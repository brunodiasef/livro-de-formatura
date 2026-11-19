// Área central: mostra a folha A4 aberta e trata cliques, arrastes, encaixes e fotos soltas.
import {
  state, on, emit, commit, getSel, select, spreadPages, pageIndex, findElement, undo, redo, commitLater, spreadCount,
  setMulti, getMulti, targetSlot,
} from './state.js';
import { renderPage, slotOffset, photoDpi, imageRect } from './render.js';
import { getImage, importFile } from './images.js';
import { PAGE_W, PAGE_H, HALF_H, SAFE, SHEET_W, SHEET_H, DPI_MIN, DPI_GOOD } from './constants.js';
import { h, clone, rad, clamp, uid, randSeed, remapGroups } from './util.js';
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
  ov.addEventListener('contextmenu', onContext);
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
    const mates = hover.el.group && !state.multi.includes(hover.el.id) ? groupMates(hover.el).map(findWithSlot).filter((f) => f && spreadPages().includes(f.page)) : [];
    if (mates.length >= 2) { // passando o mouse num grupo: mostra a caixa do grupo todo
      const b = groupBounds(mates);
      g.save();
      g.strokeStyle = 'rgba(46,110,230,0.55)'; g.lineWidth = 1.5;
      g.strokeRect(Z(b.x0) - 4, Z(b.y0) - 4, Z(b.x1 - b.x0) + 8, Z(b.y1 - b.y0) + 8);
      g.restore();
    } else if (hover.el.locked) {
      const { ox, oy } = elWorld(hover.page, hover.slotIdx, hover.el);
      drawBox(g, hover.el, ox, oy, 'rgba(120,120,130,0.7)', [6, 4]);
      const { tr } = corners(hover.el, ox, oy);
      const [lx, ly] = tr(-hover.el.w / 2, -hover.el.h / 2);
      lockBadge(g, Z(lx), Z(ly) - 24, '');
    } else {
      const { ox, oy } = elWorld(hover.page, hover.slotIdx, hover.el);
      drawBox(g, hover.el, ox, oy, 'rgba(46,110,230,0.5)');
    }
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
    } else if (el.locked) {
      // travado: caixa sem alças, com o cadeado
      drawBox(g, el, ox, oy, 'rgba(120,120,130,0.95)', [6, 4]);
      const { tr } = corners(el, ox, oy);
      const [lx, ly] = tr(-el.w / 2, -el.h / 2);
      lockBadge(g, Z(lx), Z(ly) - 24, 'Travado');
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

  // seleção múltipla: caixa de cada elemento + caixa do grupo
  const multi = getMulti().filter((f) => spreadPages().includes(f.page));
  if (multi.length) {
    const grouped = isOneGroup(multi.map((f) => f.el));
    for (const f of multi) {
      const { ox, oy } = elWorld(f.page, f.slotIdx, f.el);
      drawBox(g, f.el, ox, oy, grouped ? 'rgba(46,110,230,0.35)' : 'rgba(46,110,230,1)', grouped ? [3, 3] : null);
    }
    const b = groupBounds(multi);
    g.save();
    g.strokeStyle = 'rgba(46,110,230,0.9)';
    g.lineWidth = grouped ? 1.5 : 1;
    if (!grouped) g.setLineDash([5, 4]);
    g.strokeRect(Z(b.x0) - 4, Z(b.y0) - 4, Z(b.x1 - b.x0) + 8, Z(b.y1 - b.y0) + 8);
    g.setLineDash([]);
    const label = grouped ? `Grupo · ${multi.length} itens` : `${multi.length} selecionados`;
    g.font = '600 11px system-ui';
    const tw = g.measureText(label).width + 14;
    g.fillStyle = 'rgba(46,110,230,0.95)';
    g.beginPath(); g.roundRect(Z(b.x0) - 4, Z(b.y0) - 26, tw, 19, 9); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(label, Z(b.x0) + 3, Z(b.y0) - 12);
    g.restore();
  }

  // retângulo de seleção (arrastar no vazio)
  if (drag?.kind === 'marquee' && drag.moved) {
    const r = marqueeRect(drag);
    for (const id of drag.preview) {
      const f = findElement(id);
      if (!f) continue;
      const si = f.page.slots.indexOf(f.slot);
      const { ox, oy } = elWorld(f.page, si, f.el);
      drawBox(g, f.el, ox, oy, 'rgba(46,110,230,0.9)');
    }
    g.save();
    g.fillStyle = 'rgba(46,110,230,0.1)';
    g.strokeStyle = 'rgba(46,110,230,0.9)'; g.lineWidth = 1;
    g.fillRect(Z(r.x0), Z(r.y0), Z(r.x1 - r.x0), Z(r.y1 - r.y0));
    g.strokeRect(Z(r.x0) + 0.5, Z(r.y0) + 0.5, Z(r.x1 - r.x0), Z(r.y1 - r.y0));
    g.restore();
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

// caixa (sem rotação) que envolve o elemento, em mm da folha
function worldBox(f) {
  const { ox, oy } = elWorld(f.page, f.slotIdx, f.el);
  const { tr } = corners(f.el, ox, oy);
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => tr((a * f.el.w) / 2, (b * f.el.h) / 2));
  return {
    x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])),
    y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])),
  };
}
export function groupBounds(list) {
  const bs = list.map(worldBox);
  return {
    x0: Math.min(...bs.map((b) => b.x0)), x1: Math.max(...bs.map((b) => b.x1)),
    y0: Math.min(...bs.map((b) => b.y0)), y1: Math.max(...bs.map((b) => b.y1)),
  };
}
function marqueeRect(d) {
  return {
    x0: Math.min(d.start.x, d.cur.x), x1: Math.max(d.start.x, d.cur.x),
    y0: Math.min(d.start.y, d.cur.y), y1: Math.max(d.start.y, d.cur.y),
  };
}
// todos os elementos da folha aberta que o retângulo encosta
function elementsInRect(r) {
  const out = [];
  spreadPages().forEach((page) => {
    if (!page) return;
    page.slots.forEach((slot, si) => {
      for (const el of slot.elements) {
        if (el.locked) continue;
        const b = worldBox({ page, slotIdx: si, el });
        if (b.x1 >= r.x0 && b.x0 <= r.x1 && b.y1 >= r.y0 && b.y0 <= r.y1) out.push(el.id);
      }
    });
  });
  return out;
}
// ───────── grupos ─────────
// Itens agrupados guardam o mesmo "group". Um clique seleciona o grupo todo;
// duplo clique entra no grupo e seleciona só aquele item.
export function groupMates(el) {
  if (!el?.group) return el ? [el.id] : [];
  const ids = [];
  for (const p of state.book.pages) for (const s of p.slots) for (const e of s.elements) if (e.group === el.group && (!e.locked || e === el)) ids.push(e.id);
  return ids;
}
function withGroups(ids) {
  const out = new Set();
  for (const id of ids) { const f = findElement(id); if (f) for (const g of groupMates(f.el)) out.add(g); }
  return [...out];
}
function findWithSlot(id) {
  const f = findElement(id);
  return f && { ...f, slotIdx: f.page.slots.indexOf(f.slot) };
}
export const isOneGroup = (els) => els.length >= 2 && !!els[0].group && els.every((e) => e.group === els[0].group);

export function groupSelected() {
  const multi = getMulti();
  if (multi.length < 2) { toast('Selecione 2 ou mais itens para agrupar (arraste um retângulo ou use Shift + clique).', 'warn'); return; }
  if (new Set(multi.map((f) => f.page.id)).size > 1) { toast('Só dá para agrupar itens da mesma página.', 'warn'); return; }
  const g = uid();
  for (const f of multi) f.el.group = g;
  commit();
  setMulti(multi.map((f) => f.el.id));
  toast(`Agrupado: ${multi.length} itens. Agora eles se movem juntos. Duplo clique edita um item só.`);
}

export function ungroupSelected() {
  const multi = getMulti();
  const els = multi.length ? multi.map((f) => f.el) : [getSel()?.el].filter(Boolean);
  const ids = withGroups(els.map((e) => e.id));
  const all = ids.map(findElement).filter(Boolean).map((f) => f.el).filter((e) => e.group);
  if (!all.length) { toast('Os itens selecionados não estão agrupados.', 'warn'); return; }
  for (const e of all) delete e.group;
  commit();
  setMulti(all.map((e) => e.id));
  toast('Desagrupado. Cada item agora se move sozinho.');
}

// ───────── cadeado (travar) ─────────
// Item travado não se move, não muda de tamanho, não gira, não é apagado nem editado.
export function lockSelected(lock = true) {
  const multi = getMulti();
  const sel = getSel();
  const els = multi.length ? multi.map((f) => f.el) : sel?.el ? [sel.el] : [];
  if (!els.length) { toast('Selecione o que você quer travar.', 'warn'); return; }
  // travar um item de grupo trava o grupo todo
  const all = new Set(els);
  if (lock) for (const el of els) if (el.group) for (const p of state.book.pages) for (const s of p.slots) for (const e of s.elements) if (e.group === el.group) all.add(e);
  for (const el of all) { if (lock) el.locked = true; else delete el.locked; }
  const first = findElement([...all][0].id);
  commit();
  select({ pageId: first.page.id, slot: first.page.slots.indexOf(first.slot), elId: first.el.id });
  toast(lock ? `Travado: ${all.size === 1 ? '1 item' : all.size + ' itens'}. Ninguém consegue mexer até destravar.` : `Destravado: ${all.size === 1 ? '1 item' : all.size + ' itens'}.`);
}
export function toggleLockSelected() {
  const sel = getSel();
  lockSelected(!(sel?.el?.locked && !getMulti().length));
}
export function unlockAllOnPage(page) {
  let n = 0;
  for (const s of page.slots) for (const e of s.elements) if (e.locked) { delete e.locked; n++; }
  if (n) { commit(); toast(`Destravado: ${n === 1 ? '1 item' : n + ' itens'} desta página.`); }
}

// ids selecionados hoje (um ou vários)
function currentIds() {
  if (state.multi?.length >= 2) return [...state.multi];
  const s = getSel();
  return s?.el ? [s.el.id] : [];
}

// etiqueta com cadeado desenhado (não depende de fonte de emoji)
function lockBadge(g, x, y, label) {
  g.save();
  g.font = '600 11px system-ui';
  const w = 22 + (label ? g.measureText(label).width + 6 : 0);
  g.fillStyle = 'rgba(70,70,80,0.92)';
  g.beginPath(); g.roundRect(x, y, w, 19, 9); g.fill();
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 1.4;
  g.beginPath(); g.arc(x + 11, y + 8, 3, Math.PI, 0); g.stroke(); // alça
  g.fillRect(x + 6.5, y + 8, 9, 6.5); // corpo
  if (label) { g.textAlign = 'left'; g.fillText(label, x + 21, y + 13.5); }
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
  // itens travados só são "pegos" se não houver nenhum item solto embaixo do mouse
  let lockedHit = null;
  for (let si = page.slots.length - 1; si >= 0; si--) {
    const oy = slotOffset(page, si);
    const els = page.slots[si].elements;
    for (let k = els.length - 1; k >= 0; k--) {
      if (!hitEl(els[k], lx, m.y - oy)) continue;
      if (!els[k].locked) return { page, slotIdx: si, el: els[k] };
      lockedHit ||= { page, slotIdx: si, el: els[k] };
    }
  }
  if (lockedHit) return lockedHit;
  const si = page.layout === 'halves' ? (m.y < HALF_H ? 0 : 1) : 0;
  return { page, slotIdx: si, el: null };
}

function handleAt(sel, m) {
  if (!sel?.el || sel.el.locked || !spreadPages().includes(sel.page) || state.panMode) return null;
  const { ox, oy } = elWorld(sel.page, sel.slotIdx, sel.el);
  for (const hd of handles(sel.el, ox, oy)) {
    if (Math.hypot(hd.x - m.x, hd.y - m.y) * z < 8) return hd;
  }
  return null;
}

const CURSORS = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', rot: 'grab' };

// Ctrl + arrastar: deixa o original no lugar e passa a arrastar a cópia
function makeDragCopies() {
  const ids = [];
  for (const it of drag.items) {
    const f = findElement(it.el.id);
    if (!f) continue;
    const c = { ...clone(f.el), id: uid() }; // mesma semente: cópia idêntica (inclusive a borda de aquarela)
    f.slot.elements.splice(f.slot.elements.indexOf(f.el) + 1, 0, c);
    ids.push(c.id);
    it.el = c;
  }
  remapGroups(drag.items.map((it) => it.el)); // a cópia de um grupo vira um grupo novo
  drag.copied = true;
  setMulti(ids);
}

function startGroupMove(m) {
  const items = currentIds().map(findElement).filter(Boolean).map((f) => ({ el: f.el, x0: f.el.x, y0: f.el.y }));
  if (items.length) drag = { kind: 'group', start: m, items };
}

function onDown(e) {
  if (e.button !== 0) return;
  ov.setPointerCapture(e.pointerId);
  const m = toMM(e);
  const sel = getSel();
  const multiNow = state.multi?.length >= 2;
  const hd = multiNow ? null : handleAt(sel, m);
  if (hd) {
    drag = { kind: hd.id === 'rot' ? 'rotate' : 'resize', hd, start: m, el0: clone(sel.el), page: sel.page, slotIdx: sel.slotIdx };
    return;
  }
  const hit = hitTest(m);

  // item travado: o clique só seleciona (para ver e destravar); arrastar desenha o retângulo de seleção
  if (hit?.el?.locked) {
    if (!e.shiftKey) select({ pageId: hit.page.id, slot: hit.slotIdx, elId: hit.el.id });
    drag = { kind: 'marquee', start: m, cur: m, base: e.shiftKey ? currentIds() : [], moved: false, preview: [] };
    return;
  }

  // Ctrl (+ Shift) + arrastar: duplica, como no Word
  const copy = (e.ctrlKey || e.metaKey) && !!hit?.el;
  if (copy) {
    const inMulti = multiNow && state.multi.includes(hit.el.id);
    if (!inMulti && (!sel?.el || sel.el.id !== hit.el.id)) {
      if (hit.el.group && groupMates(hit.el).length >= 2) setMulti(groupMates(hit.el));
      else select({ pageId: hit.page.id, slot: hit.slotIdx, elId: hit.el.id });
    }
    startGroupMove(m);
    if (drag) drag.copy = true;
    return;
  }

  // Shift + clique: adiciona ou tira o item da seleção
  if (e.shiftKey && hit?.el) {
    let ids = currentIds();
    const i = ids.indexOf(hit.el.id);
    const mates = groupMates(hit.el); // num grupo, põe ou tira o grupo inteiro
    if (i >= 0) ids = ids.filter((id) => !mates.includes(id)); else ids.push(...mates);
    if (ids.length) setMulti(ids);
    else select({ pageId: hit.page.id, slot: hit.slotIdx, elId: null });
    if (i < 0) startGroupMove(m);
    return;
  }

  // clique no vazio: começa o retângulo de seleção
  if (!hit?.el) {
    if (!e.shiftKey) {
      if (hit) select({ pageId: hit.page.id, slot: hit.slotIdx, elId: null });
      else select(null);
    }
    drag = { kind: 'marquee', start: m, cur: m, base: e.shiftKey ? currentIds() : [], moved: false, preview: [] };
    return;
  }

  // clique num item da seleção múltipla: arrasta o grupo todo
  if (multiNow && state.multi.includes(hit.el.id)) { startGroupMove(m); return; }

  const samePhoto = sel?.el && hit.el && hit.el.id === sel.el.id && hit.el.type === 'photo';
  if ((state.panMode && samePhoto) || (e.altKey && hit.el?.type === 'photo' && hit.el.src)) {
    if (!samePhoto) select({ pageId: hit.page.id, slot: hit.slotIdx, elId: hit.el.id });
    drag = { kind: 'pan', start: m, el0: clone(hit.el), page: hit.page, slotIdx: hit.slotIdx };
    return;
  }
  // item de um grupo: seleciona e arrasta o grupo todo (a não ser que já tenha entrado no grupo com duplo clique)
  if (hit.el.group && sel?.el?.id !== hit.el.id) {
    const mates = groupMates(hit.el);
    if (mates.length >= 2) { setMulti(mates); startGroupMove(m); return; }
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
  if (drag.kind === 'marquee') {
    drag.cur = m;
    if (!drag.moved && Math.hypot(m.x - drag.start.x, m.y - drag.start.y) * z < 4) return;
    drag.moved = true;
    drag.preview = [...new Set([...drag.base, ...withGroups(elementsInRect(marqueeRect(drag)))])];
    requestRender();
    return;
  }
  if (drag.kind === 'group') {
    let dx = m.x - drag.start.x, dy = m.y - drag.start.y;
    if (!drag.changed && Math.hypot(dx, dy) * z < (drag.copy ? 4 : 2)) return;
    if (drag.copy && !drag.copied) makeDragCopies();
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; } // Shift: só na horizontal ou na vertical
    for (const it of drag.items) { it.el.x = round(it.x0 + dx); it.el.y = round(it.y0 + dy); }
    drag.changed = true;
    emit('live');
    requestRender();
    return;
  }
  const el = getSel()?.el;
  if (!el) return;
  const dx = m.x - drag.start.x, dy = m.y - drag.start.y;
  const e0 = drag.el0;
  drag.changed = true;
  snapLines = [];

  if (drag.kind === 'move') {
    let mdx = dx, mdy = dy;
    if (e.shiftKey) { if (Math.abs(mdx) > Math.abs(mdy)) mdy = 0; else mdx = 0; } // Shift: trava a direção
    let nx = e0.x + mdx, ny = e0.y + mdy;
    if (!e.altKey) ({ nx, ny } = snapMove(drag.page, drag.slotIdx, el, nx, ny));
    if (e.shiftKey) { if (mdy === 0) ny = e0.y; else nx = e0.x; }
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
  if (drag?.kind === 'marquee') {
    const d = drag;
    drag = null;
    if (d.moved && d.preview.length) setMulti(d.preview);
    requestRender();
    return;
  }
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
  if (hit.el.locked) { toast('Este item está travado. Destrave para editar (cadeado no painel ou botão direito).', 'warn'); return; }
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
  if (hit.el?.locked && hit.el.type === 'photo' && files.length === 1) { toast('Esta foto está travada. Destrave para trocar.', 'warn'); return; }
  if (hit.el?.type === 'photo' && !hit.el.locked && files.length === 1) {
    select({ pageId: hit.page.id, slot: hit.slotIdx, elId: hit.el.id });
    await setPhotoFromFile(hit.el.id, files[0]);
    return;
  }
  // várias fotos: preenche os espaços vazios desta metade/página
  const order = [hit.slotIdx, ...hit.page.slots.map((_, i) => i).filter((i) => i !== hit.slotIdx)];
  const targets = order.flatMap((i) => hit.page.slots[i].elements.filter((el) => el.type === 'photo' && !el.src && !el.locked)).map((el) => el.id);
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
  const multi = getMulti();
  if (e.key === 'Escape') {
    if (state.panMode) { state.panMode = false; emit('select'); }
    else if (sel?.el || multi.length) select({ ...state.sel, elId: null });
    else select(null);
    return;
  }
  if (e.key === 'PageDown') { state.spread = Math.min(spreadCount() - 1, state.spread + 1); state.sel = null; emit('select'); return; }
  if (e.key === 'PageUp') { state.spread = Math.max(0, state.spread - 1); state.sel = null; emit('select'); return; }
  if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAllInSpread(); return; }
  if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return; }
  if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelected(); return; }
  if (ctrl && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); toggleLockSelected(); return; }
  if (sel?.el?.locked && !multi.length && (e.key === 'Delete' || e.key === 'Backspace' || e.key.startsWith('Arrow') || (ctrl && e.key.toLowerCase() === 'x'))) {
    e.preventDefault();
    toast('Este item está travado. Destrave para mover ou apagar.', 'warn');
    return;
  }
  if (ctrl && e.key.toLowerCase() === 'x') { e.preventDefault(); copySelected({ cut: true }); return; }
  if (ctrl && e.key.toLowerCase() === 'g') { e.preventDefault(); e.shiftKey ? ungroupSelected() : groupSelected(); return; }
  if (!sel?.el && !multi.length) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }
  if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
  const step = e.shiftKey ? 5 : 0.5;
  const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) {
    e.preventDefault();
    const els = multi.length ? multi.map((f) => f.el) : [sel.el];
    for (const el of els) { el.x = round(el.x + mv[0]); el.y = round(el.y + mv[1]); }
    emit('live'); requestRender(); commitLater();
  }
}

export function selectAllInSpread() {
  const ids = [];
  for (const p of spreadPages()) if (p) for (const s of p.slots) for (const el of s.elements) if (!el.locked) ids.push(el.id);
  setMulti(ids);
}

export function deleteSelected() {
  const multi = getMulti();
  if (multi.length) {
    for (const f of multi) f.slot.elements.splice(f.slot.elements.indexOf(f.el), 1);
    state.sel = { ...state.sel, elId: null };
    commit();
    return;
  }
  const sel = getSel();
  if (!sel?.el) return;
  sel.slot.elements.splice(sel.slot.elements.indexOf(sel.el), 1);
  state.sel = { ...state.sel, elId: null };
  commit();
}

export function duplicateSelected() {
  const multi = getMulti();
  if (multi.length) {
    const ids = [], copies = [];
    for (const f of multi) {
      const c = { ...clone(f.el), id: uid(), seed: randSeed(), x: f.el.x + 4, y: f.el.y + 4 };
      f.slot.elements.splice(f.slot.elements.indexOf(f.el) + 1, 0, c);
      ids.push(c.id); copies.push(c);
    }
    remapGroups(copies);
    commit();
    setMulti(ids);
    return;
  }
  const sel = getSel();
  if (!sel?.el) return;
  const c = { ...clone(sel.el), id: uid(), seed: randSeed(), x: sel.el.x + 4, y: sel.el.y + 4 };
  delete c.group; // duplicar um item de dentro do grupo cria um item solto
  delete c.locked; // a cópia de um item travado sai destravada
  sel.slot.elements.splice(sel.slot.elements.indexOf(sel.el) + 1, 0, c);
  state.sel = { ...state.sel, elId: c.id };
  commit();
}

// ───────── copiar / recortar / colar (entre páginas) ─────────
// Copia os itens selecionados. Sem nenhum item selecionado, copia o aluno (metade) ou a página inteira clicada.
let clip = null;
const sizeOf = (page) => (page.layout === 'halves' ? 'half' : 'full');
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

export const clipboardInfo = () => (clip ? { count: clip.els.length, whole: clip.whole, size: clip.size } : null);

export function copySelected({ cut = false, whole = false } = {}) {
  const multi = getMulti();
  const sel = getSel();
  let items;
  if (multi.length && !whole) items = multi;
  else if (sel?.el && !whole) items = [{ page: sel.page, slot: sel.slot, el: sel.el }];
  else {
    if (!sel) { toast('Clique no que você quer copiar (um item, ou uma área vazia para copiar o aluno inteiro).', 'warn'); return false; }
    items = sel.slot.elements.map((el) => ({ page: sel.page, slot: sel.slot, el }));
    whole = true;
    if (!items.length) { toast('Não há nada para copiar aqui.', 'warn'); return false; }
  }
  const f0 = items[0];
  clip = {
    els: items.map((f) => clone(f.el)),
    fromPage: f0.page.id, fromSlot: f0.page.slots.indexOf(f0.slot),
    size: sizeOf(f0.page), whole, template: whole ? f0.slot.template : null, pastes: {},
  };
  const what = whole ? (clip.size === 'half' ? 'o aluno inteiro' : 'a página inteira') : plural(items.length, 'item', 'itens');
  if (cut && !whole) {
    for (const f of items) f.slot.elements.splice(f.slot.elements.indexOf(f.el), 1);
    state.sel = { ...state.sel, elId: null };
    commit();
    toast(`Recortado: ${what}. Clique onde quer colar e aperte Ctrl+V.`);
  } else {
    toast(`Copiado: ${what}. Clique em outra página (ou metade) e aperte Ctrl+V.`);
    emit('select');
  }
  return true;
}

export function pasteClipboard() {
  if (!clip) { toast('Nada copiado ainda. Selecione algo e aperte Ctrl+C.', 'warn'); return; }
  const t = targetSlot();
  if (!t) return;
  const H = t.page.layout === 'halves' ? HALF_H : PAGE_H;
  const same = t.page.id === clip.fromPage && t.slotIdx === clip.fromSlot;
  // em outra página ou metade: mesma posição; colando de novo no mesmo lugar (ou na origem), desloca um pouco
  const key = t.page.id + ':' + t.slotIdx;
  const replace = clip.whole && !same && sizeOf(t.page) === clip.size;
  const n = (clip.pastes[key] || 0) + (same ? 1 : 0);
  clip.pastes[key] = (clip.pastes[key] || 0) + 1;
  const off = replace ? 0 : 4 * n;
  const els = clip.els.map((e) => {
    const c = clone(e);
    c.id = uid(); // mesma semente: a cópia fica idêntica (inclusive a borda de aquarela)
    c.x = round(c.x + off); c.y = round(c.y + off);
    if (c.x + c.w > PAGE_W) c.x = round(Math.max(0, PAGE_W - c.w));
    if (c.y + c.h > H) c.y = round(Math.max(0, H - c.h));
    return c;
  });
  remapGroups(els);
  if (els.length === 1) delete els[0].group;
  if (!clip.whole) for (const c of els) delete c.locked; // itens colados saem destravados (o aluno inteiro mantém)
  if (replace) {
    t.slot.elements = els;
    if (clip.template) t.slot.template = clip.template;
  } else t.slot.elements.push(...els);
  commit();
  if (els.length === 1) select({ pageId: t.page.id, slot: t.slotIdx, elId: els[0].id });
  else { state.spread = Math.floor(pageIndex(t.page.id) / 2); setMulti(els.map((e) => e.id)); }
  const where = t.page.layout === 'halves' ? (t.slotIdx ? 'aluno de baixo' : 'aluno de cima') : 'página inteira';
  toast(replace
    ? `Colado na página ${t.pageIdx + 1} (${where}), no lugar do que havia ali. Ctrl+Z desfaz.`
    : `Colado na página ${t.pageIdx + 1} (${where}): ${plural(els.length, 'item', 'itens')}.`);
}

// botão direito: seleciona o que está embaixo do mouse e abre o menu (montado na interface)
function onContext(e) {
  e.preventDefault();
  const m = toMM(e);
  const hit = hitTest(m);
  if (hit) {
    const inMulti = hit.el && state.multi.includes(hit.el.id);
    const entered = hit.el && getSel()?.el?.id === hit.el.id;
    if (!inMulti && !entered && hit.el?.group && groupMates(hit.el).length >= 2) setMulti(groupMates(hit.el));
    else if (!inMulti) select({ pageId: hit.page.id, slot: hit.slotIdx, elId: hit.el ? hit.el.id : null });
  }
  emit('contextmenu', { x: e.clientX, y: e.clientY, onItem: !!hit?.el });
}

// alinha os itens selecionados em relação à caixa do grupo
export function alignSelected(mode) {
  const multi = getMulti();
  if (multi.length < 2) return;
  const b = groupBounds(multi);
  const boxes = multi.map((f) => ({ f, b: worldBox(f) }));
  if (mode === 'dist-h' || mode === 'dist-v') {
    const hz = mode === 'dist-h';
    const sorted = [...boxes].sort((p, q) => (hz ? p.b.x0 - q.b.x0 : p.b.y0 - q.b.y0));
    const total = sorted.reduce((s, x) => s + (hz ? x.b.x1 - x.b.x0 : x.b.y1 - x.b.y0), 0);
    const gap = ((hz ? b.x1 - b.x0 : b.y1 - b.y0) - total) / (sorted.length - 1);
    let pos = hz ? b.x0 : b.y0;
    for (const { f, b: eb } of sorted) {
      const d = pos - (hz ? eb.x0 : eb.y0);
      if (hz) f.el.x = round(f.el.x + d); else f.el.y = round(f.el.y + d);
      pos += (hz ? eb.x1 - eb.x0 : eb.y1 - eb.y0) + gap;
    }
  } else {
    for (const { f, b: eb } of boxes) {
      let dx = 0, dy = 0;
      if (mode === 'left') dx = b.x0 - eb.x0;
      if (mode === 'right') dx = b.x1 - eb.x1;
      if (mode === 'center') dx = (b.x0 + b.x1) / 2 - (eb.x0 + eb.x1) / 2;
      if (mode === 'top') dy = b.y0 - eb.y0;
      if (mode === 'bottom') dy = b.y1 - eb.y1;
      if (mode === 'middle') dy = (b.y0 + b.y1) / 2 - (eb.y0 + eb.y1) / 2;
      f.el.x = round(f.el.x + dx); f.el.y = round(f.el.y + dy);
    }
  }
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
