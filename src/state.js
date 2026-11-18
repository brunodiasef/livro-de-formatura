// Estado do livro, histórico (desfazer/refazer) e salvamento automático.
import { instantiate, switchTemplate, getTemplate } from './templates.js';
import { dbGet, dbPut } from './db.js';
import { clone, uid, debounce, randSeed } from './util.js';

export const state = {
  book: null,
  spread: 0,          // folha aberta no editor (páginas 2n e 2n+1)
  sel: null,          // { pageId, slot, elId }
  panMode: false,     // ajustando o enquadramento da foto
  guides: true,
  zoom: null,         // null = ajustar à tela
  saved: true,
};

const listeners = new Set();
export const on = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const emit = (type = 'change', info = {}) => listeners.forEach((f) => f(type, info));

// ───────── criação ─────────
export function newPage(layout = 'halves', templates = ['t01', 't02']) {
  if (layout === 'full') {
    const t = getTemplate(templates[0]);
    return { id: uid(), layout: 'full', bg: t.bg || 'aquarela', divider: true, slots: [instantiate(t.id)] };
  }
  return { id: uid(), layout: 'halves', bg: 'aquarela', divider: true, slots: [instantiate(templates[0]), instantiate(templates[1])] };
}

export function newBook() {
  return {
    version: 1,
    title: 'Livro de Formatura · 3º ano',
    settings: { imposition: 'sequencial', marks: 'marcas', dpi: 300 },
    pages: [newPage('full', ['t11']), newPage(), newPage(), newPage()],
  };
}

// ───────── histórico ─────────
let undoStack = [], redoStack = [], lastSnap = null;

const persist = debounce(async () => {
  await dbPut('kv', 'book', JSON.stringify(state.book));
  state.saved = true;
  emit('saved');
}, 700);

export function resetHistory() {
  undoStack = []; redoStack = [];
  lastSnap = JSON.stringify(state.book);
}

export function commit() {
  const snap = JSON.stringify(state.book);
  if (snap === lastSnap) return;
  undoStack.push(lastSnap);
  if (undoStack.length > 150) undoStack.shift();
  redoStack = [];
  lastSnap = snap;
  state.saved = false;
  persist();
  emit('change');
}
export const commitLater = debounce(commit, 450);

function restore(snap) {
  lastSnap = snap;
  state.book = JSON.parse(snap);
  state.panMode = false;
  fixSelection();
  state.saved = false;
  persist();
  emit('change', { rebuild: true });
}
export function undo() { if (undoStack.length) { redoStack.push(lastSnap); restore(undoStack.pop()); } }
export function redo() { if (redoStack.length) { undoStack.push(lastSnap); restore(redoStack.pop()); } }
export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

export async function loadSavedBook() {
  const s = await dbGet('kv', 'book');
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}
export function saveNow() { return dbPut('kv', 'book', JSON.stringify(state.book)); }

// ───────── consultas ─────────
export const spreadCount = () => Math.max(1, Math.ceil(state.book.pages.length / 2));
export const spreadPages = (i = state.spread) => [state.book.pages[i * 2] || null, state.book.pages[i * 2 + 1] || null];
export const pageIndex = (id) => state.book.pages.findIndex((p) => p.id === id);
export const pageSide = (idx) => (idx % 2 === 0 ? 'left' : 'right');

export function getSel() {
  const s = state.sel;
  if (!s) return null;
  const pi = pageIndex(s.pageId);
  if (pi < 0) return null;
  const page = state.book.pages[pi];
  const slot = page.slots[s.slot] || page.slots[0];
  const el = s.elId ? slot.elements.find((e) => e.id === s.elId) || null : null;
  return { page, pageIdx: pi, slotIdx: page.slots.indexOf(slot), slot, el };
}

export function fixSelection() {
  if (state.spread >= spreadCount()) state.spread = spreadCount() - 1;
  const s = getSel();
  if (!s) { state.sel = null; return; }
  if (state.sel.elId && !s.el) state.sel.elId = null;
  state.sel.slot = s.slotIdx;
}

export function select(sel) {
  state.sel = sel;
  state.panMode = false;
  if (sel) {
    const pi = pageIndex(sel.pageId);
    if (pi >= 0) state.spread = Math.floor(pi / 2);
  }
  emit('select');
}

// alvo padrão para modelos/novos elementos quando nada está selecionado
export function targetSlot() {
  const s = getSel();
  if (s) return s;
  const [L, R] = spreadPages();
  const page = L || R;
  if (!page) return null;
  return { page, pageIdx: pageIndex(page.id), slotIdx: 0, slot: page.slots[0], el: null };
}

export function findElement(id) {
  for (const page of state.book.pages) {
    for (const slot of page.slots) {
      const el = slot.elements.find((e) => e.id === id);
      if (el) return { page, slot, el };
    }
  }
  return null;
}

export function usedImageIds(book = state.book) {
  const ids = new Set();
  for (const p of book.pages) for (const s of p.slots) for (const e of s.elements) if (e.type === 'photo' && e.src) ids.add(e.src);
  return ids;
}

// ───────── operações em páginas ─────────
function clonePage(page) {
  const p = clone(page);
  p.id = uid();
  for (const s of p.slots) for (const e of s.elements) { e.id = uid(); e.seed = randSeed(); }
  return p;
}

export function addSpread() {
  state.book.pages.push(newPage(), newPage());
  state.spread = spreadCount() - 1;
  state.sel = null;
  commit();
}

export function insertPageAfter(idx, page = newPage()) {
  state.book.pages.splice(idx + 1, 0, page);
  state.sel = { pageId: page.id, slot: 0, elId: null };
  state.spread = Math.floor((idx + 1) / 2);
  commit();
}

export function duplicatePage(idx) { insertPageAfter(idx, clonePage(state.book.pages[idx])); }

export function deletePage(idx) {
  state.book.pages.splice(idx, 1);
  if (!state.book.pages.length) state.book.pages.push(newPage());
  state.sel = null;
  fixSelection();
  commit();
}

export function movePage(idx, dir) {
  const j = idx + dir, pages = state.book.pages;
  if (j < 0 || j >= pages.length) return;
  [pages[idx], pages[j]] = [pages[j], pages[idx]];
  state.spread = Math.floor(j / 2);
  commit();
}

export function moveSpread(i, dir) {
  const pages = state.book.pages, j = i + dir;
  if (j < 0 || j >= spreadCount()) return;
  const a = pages.slice(i * 2, i * 2 + 2), b = pages.slice(j * 2, j * 2 + 2);
  const lo = Math.min(i, j);
  pages.splice(lo * 2, a.length + b.length, ...(dir > 0 ? [...b, ...a] : [...a, ...b]));
  state.spread = j;
  commit();
}

export function duplicateSpread(i) {
  const pages = state.book.pages.slice(i * 2, i * 2 + 2).map(clonePage);
  state.book.pages.splice(i * 2 + 2, 0, ...pages);
  state.spread = i + 1;
  state.sel = null;
  commit();
}

export function deleteSpread(i) {
  state.book.pages.splice(i * 2, 2);
  if (!state.book.pages.length) state.book.pages.push(newPage(), newPage());
  state.sel = null;
  fixSelection();
  commit();
}

export function setLayout(page, layout) {
  if (page.layout === layout) return;
  if (layout === 'full') {
    page.slots = [switchTemplate(page.slots[0], 't19')];
  } else {
    page.slots = [switchTemplate(page.slots[0], 't01'), instantiate('t02')];
  }
  page.layout = layout;
  state.sel = { pageId: page.id, slot: 0, elId: null };
  commit();
}

export function applyTemplate(target, tid) {
  const t = getTemplate(tid);
  const page = target.page;
  if (t.size === 'full') {
    page.slots = [switchTemplate(target.slot, tid)];
    page.layout = 'full';
    if (t.bg) page.bg = t.bg;
    state.sel = { pageId: page.id, slot: 0, elId: null };
  } else if (page.layout === 'full') {
    page.layout = 'halves';
    page.slots = [switchTemplate(page.slots[0], tid), instantiate(tid === 't01' ? 't02' : 't01')];
    state.sel = { pageId: page.id, slot: 0, elId: null };
  } else {
    page.slots[target.slotIdx] = switchTemplate(page.slots[target.slotIdx], tid);
    state.sel = { pageId: page.id, slot: target.slotIdx, elId: null };
  }
  state.panMode = false;
  commit();
}
