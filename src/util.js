export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const rad = (d) => (d * Math.PI) / 180;

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Gerador pseudoaleatório com semente (formas de aquarela sempre iguais para o mesmo elemento)
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randSeed = () => Math.floor(Math.random() * 1e9);

// celular: tela estreita (o computador nunca entra aqui)
export const isMobile = () => typeof matchMedia === 'function' && matchMedia('(max-width: 820px)').matches;

// cópias ganham grupos novos: cada grupo copiado vira um grupo próprio, sem ligar ao original
export function remapGroups(els) {
  const map = new Map();
  for (const e of els) if (e.group) { if (!map.has(e.group)) map.set(e.group, uid()); e.group = map.get(e.group); }
  return els;
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
