// Área central: mostra a folha A4 aberta e trata cliques, arrastes, encaixes e fotos soltas.
import {
  state, on, emit, commit, getSel, select, spreadPages, pageIndex, findElement, undo, redo, commitLater, spreadCount,
} from './state.js';
import { renderPage, slotOffset, photoDpi, imageRect } from './render.js';
import { getImage, importFile } from './images.js';
import { PAGE_W, PAGE_H, HALF_H, SAFE, SHEET_W, SHEET_H, DPI_MIN, DPI_GOOD } from './constants.js';
import { h, clone, rad, clamp, uid, randSeed } from './util.js';
import { toast } from './ui-kit.js';

let cv, ov, wrap, stage;
let z = 3;                 // pixels de tela por mm
let dpr = 1;
let issues = [];
let drag = null;
let hover = null;
let snapLines = [];
let raf = 0;

export function requestRender() {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; render(); });
}

export function initEditor(container) {
  wrap = h('div', { class: 'stage-wrap' });
  stage = h('div', { class: 'stage' });
  cv = h('canvas', { class: 'sheet' });
  ov = h('canvas', { class: 'overlay' });
  stage.append(cv, ov);
  wrap.append(stage);
  container.append(wrap);

  new ResizeObserver(() => { emit('view'); }).observe(wrap);
  on((type) => {
    if (type === 'change' || type === 'select' || type === 'view') { layout(); requestRender(); }
  });

  ov.addEventListener('pointerdown', onDown);
  ov.addEventListener('pointermove', onMove);
  ov.addEventListener('pointerup', onUp);
  ov.addEventListener('pointercancel', onUp);
  ov.addEventListener('pointerleave', () => { hover = null; requestRender(); });
  ov.addEventListener('dblclick', onDbl);
  ov.addEventListener('wheel', onWheel, { passive: false });
  wrap.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('dropping'); });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('dropping'));
  wrap.addEventListener('drop', onDrop);
  window.addEventListener('keydown', onKey);
  layout();
}

function fitZoom() {
  const r = wrap.getBoundingClientRect();
  return Math.max(0.8, Math.min((r.width - 48) / SHEET_W, (r.height - 48) / SHEET_H));
}
export function getZoom() { return z; }
export function setZoom(v) { state.zoom = v == null ? null : clamp(v, 1, 12); emit('view'); }

function layout() {
  if (!wrap) return;
  dpr = window.devicePixelRatio || 1;
  z = state.zoom ?? fitZoom();
  const W = SHEET_W * z, H = SHEET_H * z;
  for (const c of [cv, ov]) {
    c.style.width = W + 'px'; c.style.height = H + 'px';
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
  }
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
}

// ───────── desenho ─────────
function render() {
  if (!cv || !state.book) return;
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  const s = z * dpr;
  ctx.scale(s, s);
  issues = [];
  const o = { s, editor: true, issues };
  const [L, R] = spreadPages();
  [L, R].forEach((p, i) => {
    ctx.save();
    ctx.translate(i * PAGE_W, 0);
    if (p) renderPage(ctx, p, i ? 'right' : 'left', o);
    else {
      ctx.fillStyle = '#f3f0ec'; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    }
    ctx.restore();
  });
  renderOverlay();
}

function pageX(side) { return side * PAGE_W; }

function elWorld(page, slotIdx, el) {
  const side = pageIndex(page.id) % 2;
  return { ox: pageX(side), oy: slotOffset(page, slotIdx) };
}

function corners(el, ox, oy) {
  const cx = ox + el.x + el.w / 2, cy = oy + el.y + el.h / 2;
  const a = rad(el.rotation || 0), c = Math.cos(a), s = Math.sin(a);
  const tr = (lx, ly) => [cx + lx * c - ly * s, cy + lx * s + ly * c];
  return { cx, cy, tr, a };
}

function renderOverlay() {
  const g = ov.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, ov.width, ov.height);
  g.scale(dpr, dpr);
  const Z = (v) => v * z;
  const [L, R] = spreadPages();

  if (!R) {
    g.fillStyle = '#9b8f86'; g.font = '13px system-ui'; g.textAlign = 'center';
    g.fillText('Página vazia — use "+ Nova folha" ou "Inserir página"', Z(PAGE_W * 1.5), Z(PAGE_H / 2));
  }

  // guias de impressão
  if (state.guides) {
    g.save();
    g.lineWidth = 1;
    g.setLineDash([5, 4]);
    g.strokeStyle = 'rgba(0,140,190,0.55)';
    [L, R].forEach((p, i) => {
      if (!p) return;
      const x0 = i ? PAGE_W + SAFE.cut : SAFE.outer;
      const x1 = i ? SHEET_W - SAFE.outer : PAGE_W - SAFE.cut;
      if (p.layout === 'halves') {
        g.strokeRect(Z(x0), Z(SAFE.outer), Z(x1 - x0), Z(HALF_H - SAFE.mid - SAFE.outer));
        g.strokeRect(Z(x0), Z(HALF_H + SAFE.mid), Z(x1 - x0), Z(HALF_H - SAFE.mid - SAFE.outer));
      } else g.strokeRect(Z(x0), Z(SAFE.outer), Z(x1 - x0), Z(PAGE_H - 2 * SAFE.outer));
    });
    g.strokeStyle = 'rgba(220,40,60,0.85)';
    g.setLineDash([8, 5]);
    g.beginPath(); g.moveTo(Z(PAGE_W) + 0.5, 0); g.lineTo(Z(PAGE_W) + 0.5, Z(PAGE_H)); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(220,40,60,0.9)';
    g.font = '600 10px system-ui'; g.textAlign = 'center';
    g.save(); g.translate(Z(PAGE_W) - 5, Z(PAGE_H / 2)); g.rotate(-Math.PI / 2); g.fillText('✂  LINHA DE CORTE', 0, 0); g.restore();
    g.restore();
  }

  // dicas nas fotos vazias, alerta de qualidade e de texto que não cabe
  [L, R].forEach((p, i) => {
    if (!p) return;
    p.slots.forEach((slot, si) => {
      const oy = slotOffset(p, si), ox = pageX(i);
      for (const el of slot.elements) {
        if (el.type !== 'photo') continue;
        const { cx, cy } = corners(el, ox, oy);
        if (!el.src) {
          if (el.w < 14) continue;
          g.save();
          g.translate(Z(cx), Z(cy));
          g.fillStyle = 'rgba(255,255,255,0.85)';
          g.beginPath(); g.roundRect(-58, -16, 116, 32, 8); g.fill();
          g.fillStyle = '#5b4a3f'; g.font = '600 11px system-ui'; g.textAlign = 'center';
          g.fillText('＋ Foto', 0, -2);
          g.font = '10px system-ui'; g.fillStyle = '#8a7a6f';
          g.fillText('duplo clique ou arraste', 0, 11);
          g.restore();
        } else {
          const dpi = photoDpi(el);
          if (dpi && dpi < DPI_GOOD) {
            const bad = dpi < DPI_MIN;
            const txt = `${bad ? '⚠ ' : ''}${dpi} DPI`;
            g.font = '600 10px system-ui';
            const tw = g.measureText(txt).width + 12;
            const x = Z(ox + el.x) + 4, y = Z(oy + el.y) + 4;
            g.fillStyle = bad ? 'rgba(200,40,40,0.92)' : 'rgba(210,140,20,0.92)';
            g.beginPath(); g.roundRect(x, y, tw, 17, 8); g.fill();
            g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(txt, x + 6, y + 12);
          }
        }
      }
    });
  });
  for (const it of issues) {
    if (it.type !== 'overflow') continue;
    const f = findElement(it.el.id);
    if (!f) continue;
    const si = f.page.slots.indexOf(f.slot);
    const { ox, oy } = elWorld(f.page, si, it.el);
    drawBox(g, it.el, ox, oy, 'rgba(220,40,60,0.9)', [4, 3]);
    const { tr } = corners(it.el, ox, oy);
    const [bx, by] = tr(-it.el.w / 2, it.el.h / 2);
    g.fillStyle = 'rgba(220,40,60,0.95)'; g.font = '600 10px system-ui'; g.textAlign = 'left';
    g.fillText('texto não cabe', Z(bx), Z(by) + 12);
  }

  // metade selecionada
  const sel = getSel();
  if (sel && !sel.el && spreadPages().includes(sel.page)) {
    const side = sel.pageIdx % 2;
    const y0 = slotOffset(sel.page, sel.slotIdx);
    const hh = sel.page.layout === 'halves' ? HALF_H : PAGE_H;
    g.save();
    g.strokeStyle = 'rgba(46,110,230,0.9)'; g.lineWidth = 2;
    g.strokeRect(Z(pageX(side)) + 2, Z(y0) + 2, Z(PAGE_W) - 4, Z(hh) - 4);
    g.fillStyle = 'rgba(46,110,230,0.92)';
    const label = `Página ${sel.pageIdx + 1}${sel.page.layout === 'halves' ? (sel.slotIdx ? ' · aluno de baixo' : ' · aluno de cima') : ' · página inteira'}`;
    g.font = '600 11px system-ui';
    const tw = g.measureText(label).width + 14;
    g.beginPath(); g.roundRect(Z(pageX(side)) + 8, Z(y0) + 8, tw, 20, 10); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(label, Z(pageX(side)) + 15, Z(y0) + 22);
    g.restore();
  }

  if (hover && (!sel?.el || hover.el.id !== sel.el.id)) {
    const { ox, oy } = elWorld(hover.page, hover.slotIdx, hover.el);
    drawBox(g, hover.el, ox, oy, 'rgba(46,110,230,0.5)');
  }

  if (sel?.el && spreadPages().includes(sel.page)) {
    const el = sel.el;
    const { ox, oy } = elWorld(sel.page, sel.slotIdx, el);
    if (state.panMode && el.type === 'photo' && getImage(el.src)) {
      const im = getImage(el.src);
      const r = imageRect(im, -el.w / 2, -el.h / 2, el.w, el.h, el);
      const { cx, cy, a } = corners(el, ox, oy);
      g.save();
      g.translate(Z(cx), Z(cy)); g.rotate(a);
      g.globalAlpha = 0.35;
      g.drawImage(im.bmp, Z(r.x), Z(r.y), Z(r.w), Z(r.h));
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(46,110,230,0.9)'; g.setLineDash([5, 4]);
      g.strokeRect(Z(r.x), Z(r.y), Z(r.w), Z(r.h));
      g.restore();
      // redesenha a área visível por cima
      g.save();
      g.translate(Z(cx), Z(cy)); g.rotate(a);
      g.beginPath(); g.rect(Z(-el.w / 2), Z(-el.h / 2), Z(el.w), Z(el.h)); g.clip();
      g.drawImage(im.bmp, Z(r.x), Z(r.y), Z(r.w), Z(r.h));
      g.restore();
      drawBox(g, el, ox, oy, 'rgba(46,110,230,1)');
      g.fillStyle = 'rgba(46,110,230,0.95)'; g.font = '600 11px system-ui'; g.textAlign = 'center';
      g.fillText('Arraste para enquadrar · roda do mouse = zoom · Esc para sair', Z(cx), Z(oy + el.y + el.h) + 18);
    } else {
      drawBox(g, el, ox, oy, 'rgba(46,110,230,1)');
      for (const hd of handles(el, ox, oy)) {
        g.beginPath();
        if (hd.id === 'rot') g.arc(Z(hd.x), Z(hd.y), 5.5, 0, Math.PI * 2);
        else g.rect(Z(hd.x) - 4.5, Z(hd.y) - 4.5, 9, 9);
        g.fillStyle = '#fff'; g.fill();
        g.lineWidth = 1.5; g.strokeStyle = 'rgba(46,110,230,1)'; g.stroke();
      }
    }
  }

  // guias de encaixe
  g.save();
  g.strokeStyle = 'rgba(230,40,160,0.9)'; g.lineWidth = 1;
  for (const l of snapLines) {
    g.beginPath();
    if (l.x != null) { g.moveTo(Z(l.x) + 0.5, Z(l.y0)); g.lineTo(Z(l.x) + 0.5, Z(l.y1)); }
    else { g.moveTo(Z(l.x0), Z(l.y) + 0.5); g.lineTo(Z(l.x1), Z(l.y) + 0.5); }
    g.stroke();
  }
  g.restore();
}

function drawBox(g, el, ox, oy, color, dash) {
  const { tr } = corners(el, ox, oy);
  const pts = [tr(-el.w / 2, -el.h / 2), tr(el.w / 2, -el.h / 2), tr(el.w / 2, el.h / 2), tr(-el.w / 2, el.h / 2)];
  g.save();
  g.strokeStyle = color; g.lineWidth = 1.5;
  if (dash) g.setLineDash(dash);
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x * z, y * z) : g.moveTo(x * z, y * z)));
  g.closePath(); g.stroke();
  g.restore();
}

const HANDLES = [
  ['nw', -1, -1], ['n', 0, -1], ['ne', 1, -1], ['e', 1, 0], ['se', 1, 1], ['s', 0, 1], ['sw', -1, 1], ['w', -1, 0],
];
function handles(el, ox, oy) {
  const { tr } = corners(el, ox, oy);
  const out = HANDLES.map(([id, hx, hy]) => { const [x, y] = tr((hx * el.w) / 2, (hy * el.h) / 2); return { id, hx, hy, x, y }; });
  const [rx, ry] = tr(0, -el.h / 2 - 22 / z);
  out.push({ id: 'rot', x: rx, y: ry });
  return out;
}

// ───────── interação ─────────
function toMM(e) {
  const r = ov.getBoundingClientRect();
  return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
}

function hitEl(el, x, y) {
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  const a = -rad(el.rotation || 0);
  const dx = x - cx, dy = y - cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  const hw = Math.max(el.w / 2, 1.6), hh = Math.max(el.h / 2, 1.6);
  if (Math.abs(lx) > hw || Math.abs(ly) > hh) return false;
  if (el.type === 'deco' && el.kind === 'frame') return Math.abs(lx) > hw - 3 || Math.abs(ly) > hh - 3;
  return true;
}

function hitTest(m) {
  if (m.y < 0 || m.y > PAGE_H || m.x < 0 || m.x > SHEET_W) return null;
  const side = m.x < PAGE_W ? 0 : 1;
  const page = spreadPages()[side];
  if (!page) return null;
  const lx = m.x - pageX(side);
  for (let si = page.slots.length - 1; si >= 0; si--) {
    const oy = slotOffset(page, si);
    const els = page.slots[si].elements;
    for (let k = els.length - 1; k >= 0; k--) {
      if (els[k].locked) continue;
      if (hitEl(els[k], lx, m.y - oy)) return { page, slotIdx: si, el: els[k] };
    }
  }
  const si = page.layout === 'halves' ? (m.y < HALF_H ? 0 : 1) : 0;
  return { page, slotIdx: si, el: null };
}

function handleAt(sel, m) {
  if (!sel?.el || !spreadPages().includes(sel.page) || state.panMode) return null;
  const { ox, oy } = elWorld(sel.page, sel.slotIdx, sel.el);
  for (const hd of handles(sel.el, ox, oy)) {
    if (Math.hypot(hd.x - m.x, hd.y - m.y) * z < 8) return hd;
  }
  return null;
}

const CURSORS = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', rot: 'grab' };

function onDown(e) {
  if (e.button !== 0) return;
  ov.setPointerCapture(e.pointerId);
  const m = toMM(e);
  const sel = getSel();
  const hd = handleAt(sel, m);
  if (hd) {
    drag = { kind: hd.id === 'rot' ? 'rotate' : 'resize', hd, start: m, el0: clone(sel.el), page: sel.page, slotIdx: sel.slotIdx };
    return;
  }
  const hit = hitTest(m);
  if (!hit) { select(null); return; }
  const samePhoto = sel?.el && hit.el && hit.el.id === sel.el.id && hit.el.type === 'photo';
  if ((state.panMode && samePhoto) || (e.altKey && hit.el?.type === 'photo' && hit.el.src)) {
    if (!samePhoto) select({ pageId: hit.page.id, slot: hit.slotIdx, elId: hit.el.id });
    drag = { kind: 'pan', start: m, el0: clone(hit.el), page: hit.page, slotIdx: hit.slotIdx };
    return;
  }
  if (hit.el) {
    if (!sel?.el || sel.el.id !== hit.el.id) select({ pageId: hit.page.id, slot: hit.slotIdx, elId: hit.el.id });
    drag = { kind: 'move', start: m, el0: clone(hit.el), page: hit.page, slotIdx: hit.slotIdx };
  } else {
    select({ pageId: hit.page.id, slot: hit.slotIdx, elId: null });
  }
}

function onMove(e) {
  const m = toMM(e);
  if (!drag) {
    const sel = getSel();
    const hd = handleAt(sel, m);
    const hit = hd ? null : hitTest(m);
    const newHover = hit?.el ? hit : null;
    if (newHover?.el?.id !== hover?.el?.id) { hover = newHover; requestRender(); }
    ov.style.cursor = hd ? CURSORS[hd.id] : state.panMode && hit?.el?.id === sel?.el?.id ? 'grab' : hit?.el ? 'move' : 'default';
    return;
  }
  const el = getSel()?.el;
  if (!el) return;
  const dx = m.x - drag.start.x, dy = m.y - drag.start.y;
  const e0 = drag.el0;
  drag.changed = true;
  snapLines = [];

  if (drag.kind === 'move') {
    let nx = e0.x + dx, ny = e0.y + dy;
    if (!e.ctrlKey) ({ nx, ny } = snapMove(drag.page, drag.slotIdx, el, nx, ny));
    el.x = round(nx); el.y = round(ny);
  } else if (drag.kind === 'resize') {
    const a = rad(e0.rotation || 0), c = Math.cos(a), s = Math.sin(a);
    const ldx = dx * c + dy * s, ldy = -dx * s + dy * c;
    const { hx, hy } = drag.hd;
    let nw = e0.w + hx * ldx, nh = e0.h + hy * ldy;
    const keep = hx && hy && (e.shiftKey || (el.type === 'photo' && el.frame === 'circle' && Math.abs(e0.w - e0.h) < 0.5) || (el.type === 'deco' && ['sparkle', 'goldSquare', 'diamond', 'quote', 'laurel', 'cap'].includes(el.kind)));
    if (keep) { const k = Math.max(nw / e0.w, nh / e0.h); nw = e0.w * k; nh = e0.h * k; }
    if (!hx) nw = e0.w;
    if (!hy) nh = e0.h;
    nw = Math.max(1.5, nw); nh = Math.max(el.type === 'deco' ? 0.3 : 2, nh);
    const dcx = (hx * (nw - e0.w)) / 2, dcy = (hy * (nh - e0.h)) / 2;
    const cx0 = e0.x + e0.w / 2 + dcx * c - dcy * s, cy0 = e0.y + e0.h / 2 + dcx * s + dcy * c;
    el.w = round(nw); el.h = round(nh);
    el.x = round(cx0 - nw / 2); el.y = round(cy0 - nh / 2);
  } else if (drag.kind === 'rotate') {
    const { ox, oy } = elWorld(drag.page, drag.slotIdx, el);
    const cx = ox + e0.x + e0.w / 2, cy = oy + e0.y + e0.h / 2;
    let ang = (Math.atan2(m.y - cy, m.x - cx) * 180) / Math.PI + 90;
    if (ang > 180) ang -= 360;
    if (e.shiftKey) ang = Math.round(ang / 15) * 15;
    else if (Math.abs(ang) < 2.5) ang = 0;
    el.rotation = Math.round(ang * 10) / 10;
    ov.style.cursor = 'grabbing';
  } else if (drag.kind === 'pan') {
    const im = getImage(el.src);
    if (!im) return;
    const r = imageRect(im, 0, 0, e0.w, e0.h, e0);
    const a = rad(e0.rotation || 0), c = Math.cos(a), s = Math.sin(a);
    const ldx = dx * c + dy * s, ldy = -dx * s + dy * c;
    if (Math.abs(r.ox) > 0.01) el.panX = clamp(e0.panX - ldx / r.ox, -1, 1);
    if (Math.abs(r.oy) > 0.01) el.panY = clamp(e0.panY - ldy / r.oy, -1, 1);
    ov.style.cursor = 'grabbing';
  }
  emit('live');
  requestRender();
}

function onUp() {
  if (drag?.changed) commit();
  drag = null;
  if (snapLines.length) { snapLines = []; requestRender(); }
}

const round = (v) => Math.round(v * 10) / 10;

function snapMove(page, slotIdx, el, nx, ny) {
  const thr = 6 / z;
  const W = PAGE_W, H = page.layout === 'halves' ? HALF_H : PAGE_H;
  const side = pageIndex(page.id) % 2;
  const oy = slotOffset(page, slotIdx), ox = pageX(side);
  const xs = [W / 2], ys = [H / 2];
  for (const o of page.slots[slotIdx].elements) {
    if (o.id === el.id || o.rotation) continue;
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  let bx = null, by = null;
  for (const [off, kx] of [[0, 'l'], [el.w / 2, 'c'], [el.w, 'r']]) {
    for (const t of xs) if (Math.abs(nx + off - t) < thr && (bx == null || Math.abs(nx + off - t) < Math.abs(bx.d))) bx = { d: nx + off - t, t };
  }
  for (const [off] of [[0], [el.h / 2], [el.h]]) {
    for (const t of ys) if (Math.abs(ny + off - t) < thr && (by == null || Math.abs(ny + off - t) < Math.abs(by.d))) by = { d: ny + off - t, t };
  }
  if (bx) { nx -= bx.d; snapLines.push({ x: ox + bx.t, y0: oy, y1: oy + H }); }
  if (by) { ny -= by.d; snapLines.push({ y: oy + by.t, x0: ox, x1: ox + W }); }
  return { nx, ny };
}

function onDbl(e) {
  const m = toMM(e);
  const hit = hitTest(m);
  if (!hit?.el) return;
  select({ pageId: hit.page.id, slot: hit.slotIdx, elId: hit.el.id });
  if (hit.el.type === 'photo') {
    if (!hit.el.src) pickPhoto(hit.el.id);
    else { state.panMode = !state.panMode; emit('select'); }
  } else if (hit.el.type === 'text') {
    emit('focus-text');
  }
}

function onWheel(e) {
  const sel = getSel();
  if (e.ctrlKey) {
    e.preventDefault();
    setZoom(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
    return;
  }
  if (state.panMode && sel?.el?.type === 'photo') {
    e.preventDefault();
    const el = sel.el;
    const min = el.fit === 'contain' ? 0.3 : 1;
    el.zoom = clamp(Math.round((el.zoom || 1) * (e.deltaY < 0 ? 1.06 : 1 / 1.06) * 1000) / 1000, min, 6);
    emit('live');
    requestRender();
    commitLater();
  }
}

export function pickPhoto(elId, multiple = false) {
  const inp = h('input', { type: 'file', accept: 'image/*' });
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0];
    if (!f) return;
    await setPhotoFromFile(elId, f);
  });
  inp.click();
}

export async function setPhotoFromFile(elId, file) {
  try {
    const id = await importFile(file);
    const found = findElement(elId);
    if (!found) return;
    Object.assign(found.el, { src: id, zoom: 1, panX: 0, panY: 0 });
    commit();
    const dpi = photoDpi(found.el);
    if (dpi && dpi < DPI_MIN) toast(`Atenção: esta foto tem resolução baixa para este tamanho (${dpi} DPI). Pode sair borrada na impressão.`, 'warn');
  } catch (err) {
    console.error(err);
    toast('Não foi possível abrir esta imagem. Tente JPG ou PNG.', 'error');
  }
}

async function onDrop(e) {
  e.preventDefault();
  wrap.classList.remove('dropping');
  const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  const m = toMM(e);
  const hit = hitTest(m);
  if (!hit) return;
  if (hit.el?.type === 'photo' && files.length === 1) {
    select({ pageId: hit.page.id, slot: hit.slotIdx, elId: hit.el.id });
    await setPhotoFromFile(hit.el.id, files[0]);
    return;
  }
  // várias fotos: preenche os espaços vazios desta metade/página
  const order = [hit.slotIdx, ...hit.page.slots.map((_, i) => i).filter((i) => i !== hit.slotIdx)];
  const targets = order.flatMap((i) => hit.page.slots[i].elements.filter((el) => el.type === 'photo' && !el.src)).map((el) => el.id);
  if (!targets.length) { toast('Solte a foto em cima de um espaço de foto.', 'warn'); return; }
  let n = 0;
  for (const f of files) {
    const id = targets[n];
    if (!id) break;
    const imgId = await importFile(f);
    const found = findElement(id);
    if (found) Object.assign(found.el, { src: imgId, zoom: 1, panX: 0, panY: 0 });
    n++;
  }
  commit();
  if (files.length > n) toast(`${n} foto(s) inseridas. Não havia espaço para ${files.length - n}.`, 'warn');
}

// ───────── teclado ─────────
function onKey(e) {
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  const typing = ['input', 'textarea', 'select'].includes(tag) || document.activeElement?.isContentEditable;
  if (document.querySelector('.modal-back')) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (ctrl && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
  if (typing) return;
  const sel = getSel();
  if (e.key === 'Escape') {
    if (state.panMode) { state.panMode = false; emit('select'); }
    else if (sel?.el) select({ ...state.sel, elId: null });
    else select(null);
    return;
  }
  if (e.key === 'PageDown') { state.spread = Math.min(spreadCount() - 1, state.spread + 1); state.sel = null; emit('select'); return; }
  if (e.key === 'PageUp') { state.spread = Math.max(0, state.spread - 1); state.sel = null; emit('select'); return; }
  if (!sel?.el) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
  if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
  const step = e.shiftKey ? 5 : 0.5;
  const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) {
    e.preventDefault();
    sel.el.x = round(sel.el.x + mv[0]); sel.el.y = round(sel.el.y + mv[1]);
    emit('live'); requestRender(); commitLater();
  }
}

export function deleteSelected() {
  const sel = getSel();
  if (!sel?.el) return;
  sel.slot.elements.splice(sel.slot.elements.indexOf(sel.el), 1);
  state.sel = { ...state.sel, elId: null };
  commit();
}

export function duplicateSelected() {
  const sel = getSel();
  if (!sel?.el) return;
  const c = { ...clone(sel.el), id: uid(), seed: randSeed(), x: sel.el.x + 4, y: sel.el.y + 4 };
  sel.slot.elements.splice(sel.slot.elements.indexOf(sel.el) + 1, 0, c);
  state.sel = { ...state.sel, elId: c.id };
  commit();
}

export function reorderSelected(dir) {
  const sel = getSel();
  if (!sel?.el) return;
  const arr = sel.slot.elements, i = arr.indexOf(sel.el);
  const j = dir === 'top' ? arr.length - 1 : dir === 'bottom' ? 0 : clamp(i + dir, 0, arr.length - 1);
  if (i === j) return;
  arr.splice(i, 1);
  arr.splice(j, 0, sel.el);
  commit();
}
