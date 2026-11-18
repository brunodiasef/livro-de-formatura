// Renderizador único: desenha as páginas tanto no editor quanto na exportação (300 DPI).
// Assim o que você vê na tela é exatamente o que sai na impressão.
// O contexto recebido está em milímetros; o.s = pixels por milímetro.
import { MM_PER_PT, PAGE_W, PAGE_H, HALF_H, C } from './constants.js';
import { getImage, placeholderImage } from './images.js';
import { rng, rad, clamp } from './util.js';

// ───────── utilidades ─────────
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

const cache = new Map();
function cached(key, fn) {
  if (cache.has(key)) {
    const v = cache.get(key);
    cache.delete(key); cache.set(key, v);
    return v;
  }
  const v = fn();
  if (v.width * v.height < 5e6) {
    cache.set(key, v);
    if (cache.size > 90) cache.delete(cache.keys().next().value);
  }
  return v;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function slotOffset(page, i) { return page.layout === 'halves' ? i * HALF_H : 0; }

// Forma irregular (borda de aquarela): superelipse + ruído
function blobPath(cx, cy, rx, ry, seed, rough = 0.05, exp = 3.2, n = 200) {
  const r = rng(seed);
  const harm = [];
  for (let k = 2; k <= 6; k++) harm.push([k, (r() * 0.8 + 0.2) * rough / Math.pow(k, 0.6), r() * 6.283]);
  for (let k = 9; k <= 40; k += 1 + Math.floor(r() * 3)) harm.push([k, r() * rough * 0.25, r() * 6.283]);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / exp);
    const ey = Math.sign(s) * Math.pow(Math.abs(s), 2 / exp);
    let f = 1;
    for (const [k, a, p] of harm) f += a * Math.sin(k * t + p);
    pts.push([cx + rx * ex * f, cy + ry * ey * f]);
  }
  const path = new Path2D();
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  path.moveTo(...mid(pts[n - 1], pts[0]));
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = mid(p, pts[(i + 1) % n]);
    path.quadraticCurveTo(p[0], p[1], q[0], q[1]);
  }
  path.closePath();
  return { path, pts };
}

export function goldGradient(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#B8892F');
  g.addColorStop(0.28, '#EBD18A');
  g.addColorStop(0.5, '#C29A42');
  g.addColorStop(0.74, '#F2DD9E');
  g.addColorStop(1, '#A47A2A');
  return g;
}
const paint = (ctx, color, x, y, w, h) => (!color || color === 'gold' ? goldGradient(ctx, x, y, w, h) : color);

// ───────── fotos ─────────
export function imageRect(im, x, y, w, h, el) {
  const contain = el.fit === 'contain';
  const k = (contain ? Math.min(w / im.w, h / im.h) : Math.max(w / im.w, h / im.h)) * (el.zoom || 1);
  const dw = im.w * k, dh = im.h * k;
  const ox = (dw - w) / 2, oy = (dh - h) / 2;
  return { x: x - ox - (el.panX || 0) * ox, y: y - oy - (el.panY || 0) * oy, w: dw, h: dh, k, ox, oy };
}

export function filterStr(el) {
  const f = [];
  if (el.brightness && el.brightness !== 1) f.push(`brightness(${el.brightness})`);
  if (el.contrast && el.contrast !== 1) f.push(`contrast(${el.contrast})`);
  if (el.filter === 'pb') f.push('grayscale(1)');
  if (el.filter === 'sepia') f.push('sepia(0.7)');
  if (el.filter === 'quente') f.push('sepia(0.22) saturate(1.12)');
  if (el.filter === 'suave') f.push('saturate(0.8) brightness(1.04)');
  return f.join(' ') || 'none';
}

// DPI efetivo da foto dentro do quadro (qualidade de impressão)
export function photoDpi(el) {
  const im = getImage(el.src);
  if (!im) return null;
  const r = imageRect(im, 0, 0, el.w, el.h, el); // r.k = mm por pixel da imagem
  return Math.round(25.4 / r.k);
}

function shapePath(frame, x, y, w, h) {
  const p = new Path2D();
  if (frame === 'circle') p.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (frame === 'rounded') p.roundRect(x, y, w, h, Math.min(w, h) * 0.08);
  else if (frame === 'arch') {
    const r = Math.min(w / 2, h);
    p.moveTo(x, y + h); p.lineTo(x, y + r);
    p.arc(x + w / 2, y + r, w / 2, Math.PI, 0, false);
    p.lineTo(x + w, y + h); p.closePath();
  } else p.rect(x, y, w, h);
  return p;
}

function drawPhoto(ctx, el, o) {
  let im = getImage(el.src);
  const empty = !im;
  if (empty) {
    if (o.print) return;
    im = placeholderImage();
  }
  const fitEl = empty ? { ...el, fit: 'cover', zoom: 1, panX: 0, panY: 0, filter: 'none', brightness: 1, contrast: 1 } : el;
  if (el.frame === 'brush' || el.frame === 'soft') return drawBrush(ctx, el, fitEl, im, o);

  const x = -el.w / 2, y = -el.h / 2, w = el.w, h = el.h;
  const s = o.s;

  if (el.frame === 'polaroid') {
    if (el.shadow !== false) {
      ctx.save();
      ctx.shadowColor = 'rgba(45,28,18,0.32)'; ctx.shadowBlur = 2.6 * s; ctx.shadowOffsetY = 0.9 * s;
      ctx.fillStyle = '#FDFCF8'; ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
    ctx.fillStyle = '#FDFCF8'; ctx.fillRect(x, y, w, h);
    const pad = w * 0.06;
    const pw = w - pad * 2, ph = h - pad - w * 0.24;
    ctx.save();
    ctx.beginPath(); ctx.rect(x + pad, y + pad, pw, ph); ctx.clip();
    const r = imageRect(im, x + pad, y + pad, pw, ph, fitEl);
    ctx.filter = empty ? 'none' : filterStr(el);
    ctx.drawImage(im.bmp, r.x, r.y, r.w, r.h);
    ctx.restore();
    ctx.lineWidth = 0.15; ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.strokeRect(x, y, w, h);
    return;
  }

  const path = shapePath(el.frame, x, y, w, h);
  if (el.shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(45,28,18,0.32)'; ctx.shadowBlur = 2.6 * s; ctx.shadowOffsetY = 0.9 * s;
    ctx.fillStyle = el.border && el.border !== 'gold' ? el.border : '#EEE'; ctx.fill(path);
    ctx.restore();
  }
  ctx.save();
  ctx.clip(path);
  if (el.fit === 'contain' && !empty) { /* fundo transparente para logos */ }
  const r = imageRect(im, x, y, w, h, fitEl);
  ctx.filter = empty ? 'none' : filterStr(el);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im.bmp, r.x, r.y, r.w, r.h);
  ctx.filter = 'none';
  if (el.border && el.borderWidth > 0) {
    ctx.lineWidth = el.borderWidth * 2; // traço interno
    ctx.strokeStyle = paint(ctx, el.border, x, y, w, h);
    ctx.stroke(path);
  }
  ctx.restore();
}

function drawBrush(ctx, el, fitEl, im, o) {
  const s = o.s;
  const soft = el.frame === 'soft';
  const m = Math.min(el.w, el.h) * 0.16;
  const make = () => {
    const c = makeCanvas((el.w + 2 * m) * s, (el.h + 2 * m) * s);
    const g = c.getContext('2d');
    const fx = m * s, fy = m * s, fw = el.w * s, fh = el.h * s;
    const cx = fx + fw / 2, cy = fy + fh / 2, md = Math.min(fw, fh);
    const r = imageRect(im, fx, fy, fw, fh, fitEl);
    g.imageSmoothingQuality = 'high';
    g.filter = filterStr(fitEl);
    g.drawImage(im.bmp, r.x, r.y, r.w, r.h);
    g.filter = 'none';
    const seed = el.seed || 7;
    // difusão (0–100, padrão 50): largura da faixa em degradê onde a foto some
    const fd = clamp(el.feather ?? 50, 0, 100) / 50;
    if (soft) {
      const s0 = md * 0.05, sMax = md * 0.11;
      const sg = fd <= 1 ? s0 * fd : s0 + (fd - 1) * (sMax - s0);
      // degradê mais largo cresce para dentro: no máximo, a foto já sumiu antes da borda do quadro (sem corte reto)
      const t = Math.max(0, fd - 1);
      const radius = (half) => half * 0.95 - t * (half * 0.95 - (half - 2.2 * sMax));
      const inner = blobPath(cx, cy, Math.max(fw * 0.08, radius(fw / 2)), Math.max(fh * 0.08, radius(fh / 2)), seed, 0.05, 2.6);
      g.globalCompositeOperation = 'destination-in';
      g.filter = sg > 0.2 ? `blur(${sg}px)` : 'none';
      g.fill(inner.path);
    } else {
      const inner = blobPath(cx, cy, fw / 2 * 0.97, fh / 2 * 0.97, seed, 0.05, 3.2);
      // 1) recorte irregular da foto
      g.globalCompositeOperation = 'destination-in';
      g.filter = `blur(${md * 0.008 * Math.min(fd, 1.5)}px)`;
      g.fill(inner.path);
      // 2) escurece as bordas por dentro (efeito tinta)
      g.globalCompositeOperation = 'source-atop';
      g.filter = `blur(${md * 0.045}px)`;
      g.lineWidth = md * 0.1;
      g.strokeStyle = 'rgba(24,16,11,0.78)';
      g.stroke(inner.path);
      // 3) halo de tinta escura por trás
      g.globalCompositeOperation = 'destination-over';
      const outer = blobPath(cx, cy, fw / 2 * 1.035, fh / 2 * 1.035, seed, 0.075, 3.2, 320);
      g.filter = `blur(${md * 0.012}px)`;
      g.fillStyle = 'rgba(28,19,13,0.92)';
      g.fill(outer.path);
      // 4) manchas de fumaça/tinta irregulares na borda
      const R = rng(seed + 99);
      g.fillStyle = 'rgb(28,19,13)';
      g.filter = `blur(${md * 0.025}px)`;
      for (let i = 0; i < outer.pts.length; i += 6) {
        if (R() < 0.35) continue;
        const [px, py] = outer.pts[i];
        const dx = px - cx, dy = py - cy, len = Math.hypot(dx, dy) || 1;
        const off = md * R() * 0.03;
        g.globalAlpha = 0.25 + R() * 0.45;
        g.beginPath();
        g.ellipse(px + (dx / len) * off, py + (dy / len) * off, md * (0.015 + R() * 0.04), md * (0.01 + R() * 0.025), Math.atan2(dy, dx) + Math.PI / 2, 0, Math.PI * 2);
        g.fill();
      }
      // 5) fibras curtas e finas de pincel seco
      g.filter = `blur(${Math.max(0.4, md * 0.0025)}px)`;
      g.strokeStyle = 'rgb(28,19,13)';
      g.lineCap = 'round';
      for (const [px, py] of outer.pts) {
        if (R() < 0.6) continue;
        const dx = px - cx, dy = py - cy, len = Math.hypot(dx, dy) || 1;
        const L = md * (0.006 + R() * 0.028);
        const bend = (R() - 0.5) * 0.5;
        g.lineWidth = md * (0.002 + R() * 0.004);
        g.globalAlpha = 0.15 + R() * 0.35;
        g.beginPath();
        g.moveTo(px - (dx / len) * L * 0.4, py - (dy / len) * L * 0.4);
        g.lineTo(px + (dx / len + bend * dy / len) * L, py + (dy / len - bend * dx / len) * L);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.filter = 'none';
      // 6) esmaece tudo nas pontas
      g.globalCompositeOperation = 'destination-in';
      const f0 = md * 0.035;
      const fs = fd <= 1 ? f0 * fd : f0 + (fd - 1) * md * 0.04;
      const fshrink = 1.2 * Math.max(0, fs - f0);
      const fade = blobPath(cx, cy, Math.max(fw * 0.1, fw / 2 * 1.08 - fshrink), Math.max(fh * 0.1, fh / 2 * 1.08 - fshrink), seed + 5, 0.07, 3);
      g.filter = fs > 0.2 ? `blur(${fs}px)` : 'none';
      g.fill(fade.path);
    }
    g.filter = 'none';
    g.globalCompositeOperation = 'source-over';
    return c;
  };
  const key = `b|${el.src || 'ph'}|${el.frame}|${el.w}|${el.h}|${fitEl.zoom}|${fitEl.panX}|${fitEl.panY}|${fitEl.fit}|${filterStr(fitEl)}|${el.seed}|${el.feather ?? 50}|${s.toFixed(4)}`;
  const c = o.cache === false ? make() : cached(key, make);
  ctx.drawImage(c, -el.w / 2 - m, -el.h / 2 - m, el.w + 2 * m, el.h + 2 * m);
}

// ───────── texto ─────────
const fontStr = (el, px) => `${el.italic ? 'italic ' : ''}${el.weight || 400} ${px}px "${el.font}"`;

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    const words = para.split(/ +/);
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (!line || ctx.measureText(t).width <= maxW) line = t;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out.map((t) => ({ t, w: ctx.measureText(t).width }));
}

export function layoutText(ctx, el, s) {
  const text = el.uppercase ? (el.text || '').toUpperCase() : el.text || '';
  const maxW = el.w * s, maxH = el.h * s;
  let size = el.size;
  for (let guard = 0; guard < 200; guard++) {
    const px = size * MM_PER_PT * s;
    ctx.font = fontStr(el, px);
    ctx.letterSpacing = `${((el.tracking || 0) / 1000) * px}px`;
    const lines = wrap(ctx, text, maxW);
    const lh = px * (el.lineHeight || 1.3);
    const overflow = lines.length * lh > maxH + lh * 0.2 || lines.some((l) => l.w > maxW + 1);
    if (!overflow || !el.autoFit || size <= 5) return { lines, px, lh, size, overflow };
    size = Math.max(5, size - Math.max(0.2, size * 0.03));
  }
}

function drawText(ctx, el, o) {
  const s = o.s;
  ctx.save();
  ctx.scale(1 / s, 1 / s);
  const L = layoutText(ctx, el, s);
  const x0 = (-el.w / 2) * s, y0 = (-el.h / 2) * s, W = el.w * s, H = el.h * s;
  const total = L.lines.length * L.lh;
  let y = el.valign === 'middle' ? y0 + (H - total) / 2 : el.valign === 'bottom' ? y0 + H - total : y0;
  ctx.fillStyle = el.color || C.text;
  ctx.textBaseline = 'middle';
  ctx.textAlign = el.align === 'center' ? 'center' : el.align === 'right' ? 'right' : 'left';
  const x = el.align === 'center' ? x0 + W / 2 : el.align === 'right' ? x0 + W : x0;
  for (const ln of L.lines) {
    ctx.fillText(ln.t, x, y + L.lh / 2);
    y += L.lh;
  }
  ctx.restore();
  if (o.issues && L.overflow) o.issues.push({ el, type: 'overflow' });
  if (o.issues && L.size < el.size - 0.01) o.issues.push({ el, type: 'shrunk', size: L.size });
}

// ───────── enfeites ─────────
function sparklePath(cx, cy, rx, ry) {
  const p = new Path2D();
  const k = 0.14;
  p.moveTo(cx, cy - ry);
  p.quadraticCurveTo(cx + rx * k, cy - ry * k, cx + rx, cy);
  p.quadraticCurveTo(cx + rx * k, cy + ry * k, cx, cy + ry);
  p.quadraticCurveTo(cx - rx * k, cy + ry * k, cx - rx, cy);
  p.quadraticCurveTo(cx - rx * k, cy - ry * k, cx, cy - ry);
  p.closePath();
  return p;
}

function softBlob(ctx, cx, cy, w, h, color, seed, o, blurK = 0.14) {
  const s = o.s;
  const m = Math.min(w, h) * 0.3;
  const make = () => {
    const c = makeCanvas((w + 2 * m) * s, (h + 2 * m) * s);
    const g = c.getContext('2d');
    const md = Math.min(w, h) * s;
    const ccx = (w / 2 + m) * s, ccy = (h / 2 + m) * s;
    g.fillStyle = color;
    g.filter = `blur(${md * blurK}px)`;
    g.globalAlpha = 0.55;
    g.fill(blobPath(ccx, ccy, (w / 2) * s, (h / 2) * s, seed, 0.14, 2.2).path);
    g.globalAlpha = 0.35;
    g.fill(blobPath(ccx + md * 0.08, ccy - md * 0.05, (w / 2.6) * s, (h / 2.8) * s, seed + 3, 0.18, 2.2).path);
    g.filter = 'none';
    return c;
  };
  const key = `w|${w}|${h}|${color}|${seed}|${blurK}|${s.toFixed(4)}`;
  const c = o.cache === false ? make() : cached(key, make);
  ctx.drawImage(c, cx - w / 2 - m, cy - h / 2 - m, w + 2 * m, h + 2 * m);
}

function drawDeco(ctx, el, o) {
  const w = el.w, h = el.h, x = -w / 2, y = -h / 2;
  switch (el.kind) {
    case 'sparkle':
      ctx.fillStyle = paint(ctx, el.color, x, y, w, h);
      ctx.fill(sparklePath(0, 0, w / 2, h / 2));
      break;
    case 'divider': {
      const col = paint(ctx, el.color, x, y, w, h);
      ctx.fillStyle = col;
      const lw = 0.22, st = Math.min(h, 4);
      if (el.variant === 'center') {
        const gap = st * 0.9;
        ctx.fillRect(x, -lw / 2, w / 2 - gap, lw);
        ctx.fillRect(gap, -lw / 2, w / 2 - gap, lw);
        ctx.fill(sparklePath(0, 0, st / 2, st / 2));
      } else if (el.variant === 'plain') {
        ctx.fillRect(x, -lw / 2, w, lw);
      } else {
        ctx.fillRect(x, -lw / 2, w - st * 1.6, lw);
        ctx.fill(sparklePath(w / 2 - st / 2, 0, st / 2, st / 2));
      }
      break;
    }
    case 'line':
    case 'goldStrip':
      ctx.fillStyle = paint(ctx, el.color, x, y, w, h);
      ctx.fillRect(x, y, w, h);
      break;
    case 'goldSquare': {
      ctx.fillStyle = paint(ctx, el.color, x, y, w, h);
      ctx.fillRect(x, y, w, h);
      const R = rng(el.seed || 3);
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      for (let i = 0; i < 14; i++) {
        ctx.strokeStyle = R() < 0.5 ? 'rgba(255,248,220,0.35)' : 'rgba(140,100,30,0.25)';
        ctx.lineWidth = 0.1 + R() * 0.25;
        const yy = y + R() * h;
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy + (R() - 0.5) * h * 0.6); ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'diamond': {
      ctx.strokeStyle = paint(ctx, el.color, x, y, w, h);
      ctx.lineWidth = Math.max(0.25, Math.min(w, h) * 0.07);
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(w / 2, 0); ctx.lineTo(0, h / 2); ctx.lineTo(x, 0); ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'wash':
      softBlob(ctx, 0, 0, w, h, el.color && el.color !== 'gold' ? el.color : C.blush, el.seed || 1, o);
      break;
    case 'quote': {
      const s = o.s;
      ctx.save(); ctx.scale(1 / s, 1 / s);
      ctx.fillStyle = paint(ctx, el.color, x * s, y * s, w * s, h * s);
      ctx.font = `700 ${h * 1.9 * s}px "Cormorant Garamond"`;
      ctx.textBaseline = 'top'; ctx.textAlign = 'center';
      ctx.fillText(el.variant === 'close' ? '”' : '“', 0, y * s - h * 0.05 * s);
      ctx.restore();
      break;
    }
    case 'frame': {
      const col = paint(ctx, el.color, x, y, w, h);
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.55; ctx.strokeRect(x, y, w, h);
      ctx.lineWidth = 0.22; ctx.strokeRect(x + 1.8, y + 1.8, w - 3.6, h - 3.6);
      ctx.fillStyle = col;
      for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); ctx.fillRect(-1.3, -1.3, 2.6, 2.6); ctx.restore();
      }
      break;
    }
    case 'laurel': {
      ctx.fillStyle = paint(ctx, el.color, x, y, w, h);
      ctx.strokeStyle = ctx.fillStyle;
      for (const side of [-1, 1]) {
        const p0 = [side * w * 0.05, h * 0.45], p1 = [side * w * 0.55, h * 0.35], p2 = [side * w * 0.3, -h * 0.47];
        ctx.lineWidth = Math.min(w, h) * 0.022;
        ctx.beginPath(); ctx.moveTo(...p0); ctx.quadraticCurveTo(...p1, ...p2); ctx.stroke();
        const N = 7;
        for (let i = 0; i < N; i++) {
          const t = 0.12 + (i / (N - 1)) * 0.86;
          const bx = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
          const by = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
          const tx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
          const ty = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
          const ang = Math.atan2(ty, tx);
          const L = h * 0.15 * (1 - t * 0.35), Wd = L * 0.38;
          for (const sgn of [-1, 1]) {
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(ang + sgn * 0.75);
            ctx.beginPath(); ctx.ellipse(L / 2, 0, L / 2, Wd / 2, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
          }
        }
      }
      break;
    }
    case 'cap': {
      const col = paint(ctx, el.color, x, y, w, h);
      ctx.fillStyle = col; ctx.strokeStyle = col;
      ctx.beginPath(); // corpo
      ctx.moveTo(-w * 0.28, -h * 0.02);
      ctx.lineTo(-w * 0.28, h * 0.3);
      ctx.quadraticCurveTo(0, h * 0.48, w * 0.28, h * 0.3);
      ctx.lineTo(w * 0.28, -h * 0.02);
      ctx.closePath(); ctx.globalAlpha *= 0.85; ctx.fill(); ctx.globalAlpha /= 0.85;
      ctx.beginPath(); // tampo
      ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, -h * 0.13); ctx.lineTo(0, h * 0.2); ctx.lineTo(-w / 2, -h * 0.13);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = Math.min(w, h) * 0.03; // borla
      ctx.beginPath(); ctx.moveTo(0, -h * 0.15); ctx.lineTo(w * 0.36, -h * 0.02); ctx.lineTo(w * 0.36, h * 0.3); ctx.stroke();
      ctx.fillRect(w * 0.33, h * 0.28, w * 0.06, h * 0.16);
      break;
    }
    case 'panel':
      ctx.fillStyle = el.color && el.color !== 'gold' ? el.color : C.paper;
      if (el.radius) { ctx.beginPath(); ctx.roundRect(x, y, w, h, el.radius); ctx.fill(); }
      else ctx.fillRect(x, y, w, h);
      break;
  }
}

export function drawElement(ctx, el, o) {
  ctx.save();
  ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
  if (el.rotation) ctx.rotate(rad(el.rotation));
  if (el.type === 'deco' && (el.flipX || el.flipY)) ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  ctx.globalAlpha = el.opacity ?? 1;
  if (el.type === 'photo') drawPhoto(ctx, el, o);
  else if (el.type === 'text') drawText(ctx, el, o);
  else if (el.type === 'deco') drawDeco(ctx, el, o);
  ctx.restore();
}

// ───────── fundo da página ─────────
let noiseTile;
function paperTexture(ctx, o, dark) {
  if (!noiseTile) {
    noiseTile = makeCanvas(256, 256);
    const g = noiseTile.getContext('2d');
    const d = g.createImageData(256, 256);
    const R = rng(42);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 110 + R() * 145;
      d.data[i] = v; d.data[i + 1] = v * 0.96; d.data[i + 2] = v * 0.9; d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
  }
  const s = o.s;
  ctx.save();
  ctx.scale(1 / s, 1 / s);
  ctx.globalAlpha = dark ? 0.05 : 0.045;
  ctx.globalCompositeOperation = dark ? 'screen' : 'multiply';
  ctx.fillStyle = ctx.createPattern(noiseTile, 'repeat');
  ctx.fillRect(0, 0, PAGE_W * s, PAGE_H * s);
  ctx.restore();
}

export function drawBackground(ctx, page, side, o) {
  const bg = page.bg || 'aquarela';
  const W = PAGE_W, H = PAGE_H;
  const base = { aquarela: C.paper, creme: C.paper, classico: C.paper, blush: '#FAEEE6', branco: '#FFFFFF', noite: '#1E1815' }[bg] || C.paper;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  if (bg === 'blush') {
    const g = ctx.createLinearGradient(0, 0, W * 0.6, H);
    g.addColorStop(0, 'rgba(255,248,242,0.9)'); g.addColorStop(1, 'rgba(240,200,180,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (bg === 'noite') {
    const g = ctx.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, H * 0.75);
    g.addColorStop(0, 'rgba(70,52,40,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (bg !== 'branco') paperTexture(ctx, o, bg === 'noite');

  const outer = side === 'right' ? W : 0;
  const dir = side === 'right' ? -1 : 1;
  const seed = hashStr(page.id || 'p');

  if (bg === 'aquarela' || bg === 'blush') {
    softBlob(ctx, outer + dir * 6, 14, 72, 50, '#EFC2AC', seed, o);
    softBlob(ctx, outer + dir * 8, H - 18, 62, 48, '#F2CBB8', seed + 11, o);
    if (bg === 'aquarela') softBlob(ctx, W - outer - dir * 4, H * 0.5, 36, 60, '#F5D9CA', seed + 21, o, 0.2);
  }
  if (bg === 'aquarela' || bg === 'noite') {
    // faixa dourada na borda externa
    ctx.save();
    ctx.translate(outer, H * 0.6);
    ctx.rotate(dir * rad(-38));
    ctx.globalAlpha = bg === 'noite' ? 0.7 : 0.85;
    // curta o bastante para não entrar na área segura do texto (10 mm da borda)
    ctx.fillStyle = goldGradient(ctx, -3, -14, 6, 28);
    ctx.fillRect(-3, -13, 6, 26);
    ctx.restore();
    // quadradinho dourado no canto de baixo e losango no canto de cima
    drawDeco2(ctx, 'goldSquare', outer + dir * 9.5, H - 10.5, 6.5, 6.5, seed, o);
    drawDeco2(ctx, 'diamond', outer + dir * 9, 9.5, 3.6, 3.6, seed, o);
  }
  if (bg === 'classico') {
    drawDeco2(ctx, 'frame', W / 2, H / 2, W - 14, H - 14, seed, o);
  }
  // linha que separa o aluno de cima e o de baixo
  if (page.layout === 'halves' && page.divider !== false) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = goldGradient(ctx, 16, HALF_H, W - 32, 1);
    ctx.fillRect(18, HALF_H - 0.1, W / 2 - 22, 0.2);
    ctx.fillRect(W / 2 + 4, HALF_H - 0.1, W / 2 - 22, 0.2);
    ctx.globalAlpha = 0.9;
    ctx.fill(sparklePath(W / 2, HALF_H, 1.8, 1.8));
    ctx.restore();
  }
}

function drawDeco2(ctx, kind, cx, cy, w, h, seed, o) {
  drawElement(ctx, { type: 'deco', kind, x: cx - w / 2, y: cy - h / 2, w, h, color: 'gold', seed }, o);
}

// ───────── páginas e folhas ─────────
export function renderPage(ctx, page, side, o) {
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, PAGE_W, PAGE_H); ctx.clip();
  drawBackground(ctx, page, side, o);
  page.slots.forEach((slot, i) => {
    ctx.save();
    ctx.translate(0, slotOffset(page, i));
    for (const el of slot.elements) {
      if (o.skipId && el.id === o.skipId) continue;
      drawElement(ctx, el, o);
    }
    ctx.restore();
  });
  ctx.restore();
}

// Desenha uma folha A4 (duas páginas lado a lado) num canvas novo
export function renderSheetCanvas(left, right, pxPerMm, o = {}) {
  const c = makeCanvas(297 * pxPerMm, 210 * pxPerMm);
  const ctx = c.getContext('2d');
  ctx.scale(pxPerMm, pxPerMm);
  const opts = { s: pxPerMm, ...o };
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 297, 210);
  if (left) renderPage(ctx, left, 'left', opts);
  if (right) { ctx.save(); ctx.translate(PAGE_W, 0); renderPage(ctx, right, 'right', opts); ctx.restore(); }
  return c;
}

export function renderPageCanvas(page, side, pxPerMm, o = {}) {
  const c = makeCanvas(PAGE_W * pxPerMm, PAGE_H * pxPerMm);
  const ctx = c.getContext('2d');
  ctx.scale(pxPerMm, pxPerMm);
  renderPage(ctx, page, side, { s: pxPerMm, ...o });
  return c;
}

export function clearRenderCache() { cache.clear(); }
