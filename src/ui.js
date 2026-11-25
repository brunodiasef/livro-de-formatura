// Interface: barra superior, lista de folhas (esquerda), modelos e propriedades (direita).
import {
  state, on, emit, commit, commitLater, getSel, select, spreadCount, spreadPages, pageIndex, targetSlot,
  addSpread, duplicateSpread, deleteSpread, moveSpread, moveSpreadTo,duplicatePage, deletePage, movePage, insertPageAfter,
  setLayout, applyTemplate, undo, redo, canUndo, canRedo, newPage,
  saveSlotAsTemplate, deleteCustomTemplate, renameCustomTemplate, getMulti,
  blockList, blockIndex, moveBlock, moveBlockTo, deleteBlock, movePageTo,
} from './state.js';
import { TEMPLATES, getTemplate, customTemplates, T, P, D, BODY, instantiate } from './templates.js';
import { renderPage, renderSheetCanvas, layoutText, photoDpi, drawElement, PAPER_FRAMES, textObstacles } from './render.js';
import { initEditor, requestRender, pickPhoto, deleteSelected, duplicateSelected, reorderSelected, setZoom, getZoom, alignSelected, copySelected, pasteClipboard, clipboardInfo, groupSelected, ungroupSelected, isOneGroup, lockSelected, unlockAllOnPage, lockAllOnPage, lockedInBook, unlockAllInBook } from './editor.js';
import { FONTS, fontWeights, fontHasItalic, WEIGHT_NAMES } from './fonts.js';
import { BACKGROUNDS, FRAMES, DECOS, SWATCHES, PAGE_W, PAGE_H, HALF_H, DPI_MIN, DPI_GOOD } from './constants.js';
import { h, uid, randSeed, debounce, clone, isMobile } from './util.js';
import { btn, icon, toast, modal, confirmBox } from './ui-kit.js';
import { openExportDialog } from './export.js';
import { openBatchDialog } from './batch.js';
import { newProject, saveProject, saveProjectAs, pickAndOpenProject, currentFileName } from './project.js';

let rightTab = 'templates';
let rightEl, leftList, leftStats, undoBtn, redoBtn, saveStatus, titleInput, zoomLabel;

export function initUI(root) {
  root.innerHTML = '';
  const left = h('aside', { class: 'left' });
  const center = h('main', { class: 'center' });
  const right = h('aside', { class: 'right' });
  const bodyEl = h('div', { class: 'body' }, left, center, right);
  root.append(buildTopbar(), bodyEl, buildMobileNav());
  // celular: ao focar um campo da gaveta, o navegador tenta rolar a área inteira; mantém tudo no lugar
  for (const el of [bodyEl, root]) el.addEventListener('scroll', () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } });
  buildLeft(left);
  initEditor(center);
  center.append(buildZoomBar());
  rightEl = right;
  renderRight();
  buildTemplateThumbs();

  on((type, info) => {
    if (type === 'change') {
      refreshLeft();
      refreshTop();
      if (info.rebuild || needsRebuild()) renderRight(); else syncInputs();
      refreshMobileNav();
    } else if (type === 'select') {
      refreshLeft();
      const s = getSel();
      if (s?.el || state.multi?.length >= 2) rightTab = 'edit';
      renderRight();
      refreshMobileNav();
    } else if (type === 'live') {
      syncInputs();
    } else if (type === 'focus-text') {
      rightTab = 'edit';
      renderRight();
      if (isMobile()) openSheet('right'); // no celular, toque duplo no texto abre a gaveta de edição
      const ta = rightEl.querySelector('textarea');
      if (ta) { ta.focus(); if (!isMobile()) ta.select(); }
    } else if (type === 'contextmenu') {
      openContextMenu(info);
    } else if (type === 'saved' || type === 'file') {
      refreshTop();
    } else if (type === 'view') {
      zoomLabel.textContent = Math.round((getZoom() / 3.78) * 100) + '%';
    }
  });
  refreshLeft();
  refreshTop();
}

// ───────── celular: barra de baixo e gavetas ─────────
// No computador a barra fica escondida (CSS) e nada disto muda a tela.
let mnav = null;
let sheet = null; // 'left' | 'right' | null

function openSheet(which) {
  sheet = which;
  document.body.classList.toggle('m-left', which === 'left');
  document.body.classList.toggle('m-right', which === 'right');
  document.body.classList.toggle('m-open', !!which);
  refreshMobileNav();
}
function toggleSheet(which, tab) {
  const same = sheet === which && (which !== 'right' || rightTab === tab);
  if (which === 'right' && tab && rightTab !== tab) { rightTab = tab; renderRight(); }
  openSheet(same ? null : which);
}
const sheetHandle = () => h('button', { class: 'm-handle', onClick: () => openSheet(null), title: 'Fechar' }, 'Fechar');

function buildMobileNav() {
  const item = (key, ic, label, onClick) => h('button', { 'data-k': key, onClick }, icon(ic), h('span', {}, label));
  mnav = h('nav', { class: 'mnav' },
    item('left', 'book', 'Folhas', () => toggleSheet('left')),
    item('edit', 'move', 'Editar', () => toggleSheet('right', 'edit')),
    item('templates', 'grid', 'Modelos', () => toggleSheet('right', 'templates')),
    item('fit', 'fit', 'Ajustar', () => { openSheet(null); setZoom(null); }),
  );
  return mnav;
}
function refreshMobileNav() {
  if (!mnav) return;
  const selected = !!getSel()?.el || state.multi?.length >= 2;
  for (const b of mnav.querySelectorAll('button')) {
    const k = b.dataset.k;
    b.classList.toggle('on', (k === 'left' && sheet === 'left') || (sheet === 'right' && k === rightTab));
    b.classList.toggle('dot', k === 'edit' && selected && !(sheet === 'right' && rightTab === 'edit'));
  }
}

// ───────── barra superior ─────────
function menu(anchor, items) {
  document.querySelector('.menu')?.remove();
  const m = h('div', { class: 'menu' });
  for (const it of items) {
    if (it === '-') { m.append(h('div', { class: 'menu-sep' })); continue; }
    m.append(h('button', { class: 'menu-item', disabled: !!it.disabled, onClick: () => { m.remove(); it.onClick(); } },
      it.icon ? icon(it.icon) : null, it.preview ? it.preview() : null, h('span', {}, it.label),
      it.badge ? h('em', { class: 'menu-badge' }, it.badge) : null, it.keys ? h('kbd', { class: 'menu-keys' }, it.keys) : null));
  }
  // âncora: um botão, ou um ponto {x, y} (menu do botão direito)
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, bottom: anchor.y - 6 };
  m.style.left = r.left + 'px';
  m.style.top = r.bottom + 6 + 'px';
  m.style.maxHeight = `calc(100vh - ${Math.round(r.bottom) + 18}px)`;
  document.body.append(m);
  const mr = m.getBoundingClientRect(); // não deixa o menu sair da tela
  if (mr.right > innerWidth - 8) m.style.left = Math.max(8, innerWidth - mr.width - 8) + 'px';
  if (!anchor.getBoundingClientRect && mr.bottom > innerHeight - 8) {
    m.style.top = Math.max(8, innerHeight - mr.height - 8) + 'px';
    m.style.maxHeight = 'calc(100vh - 16px)';
  }
  setTimeout(() => document.addEventListener('mousedown', function f(e) {
    if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', f); }
  }), 0);
}

function buildTopbar() {
  titleInput = h('input', { class: 'title-input', value: state.book.title, title: 'Nome do projeto' });
  titleInput.addEventListener('change', () => { state.book.title = titleInput.value; commit(); });
  undoBtn = btn('', { icon: 'undo', title: 'Desfazer (Ctrl+Z)', onClick: undo });
  redoBtn = btn('', { icon: 'redo', title: 'Refazer (Ctrl+Y)', onClick: redo });
  saveStatus = h('span', { class: 'save-status' });
  const decoBtn = btn('Enfeite', { icon: 'sparkle', title: 'Adicionar enfeite' });
  decoBtn.addEventListener('click', () => menu(decoBtn, DECOS.map((d) => (d === '-' ? '-' : {
    label: d.name, badge: d.isNew ? 'novo' : null, preview: () => decoPreview(d), onClick: () => addDeco(d),
  }))));
  const projBtn = btn('Projeto', { icon: 'folder' });
  projBtn.addEventListener('click', () => {
    const name = currentFileName();
    menu(projBtn, [
      { label: name ? `Salvar em "${name}"` : 'Salvar…', icon: 'save', keys: 'Ctrl+S', onClick: saveProject },
      { label: 'Salvar como…', icon: 'save', keys: 'Ctrl+Shift+S', onClick: saveProjectAs },
      '-',
      { label: 'Abrir projeto salvo…', icon: 'folder', onClick: pickAndOpenProject },
      '-',
      { label: 'Destravar o livro inteiro', icon: 'unlock', disabled: !lockedInBook(), onClick: unlockBookUI },
      '-',
      { label: 'Novo projeto (começar do zero)', icon: 'file', onClick: newProject },
    ]);
  });
  // Ctrl+S salva no mesmo arquivo; Ctrl+Shift+S escolhe outro (funciona até digitando)
  // Delete com um bloco selecionado (sem item): pergunta se quer apagar o bloco
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Delete' || e.ctrlKey || e.altKey || e.metaKey || document.querySelector('.modal-back')) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    const s = getSel();
    if (!s || s.el || state.multi?.length >= 2 || s.page.layout !== 'halves') return;
    e.preventDefault();
    deleteBlockUI(s.page.id, s.slotIdx);
  });
  // Alt+↑ / Alt+↓ com um bloco selecionado (sem item): sobe ou desce o aluno/professor
  window.addEventListener('keydown', (e) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || document.querySelector('.modal-back')) return;
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    const s = getSel();
    if (!s || s.el || state.multi?.length >= 2) return;
    e.preventDefault();
    moveBlockUI(s.page.id, s.slotIdx, e.key === 'ArrowUp' ? -1 : 1);
  });
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || document.querySelector('.modal-back')) return;
    e.preventDefault();
    if (e.shiftKey) saveProjectAs(); else saveProject();
  });
  const guidesBtn = btn('Guias', { icon: 'guides', cls: state.guides ? 'on' : '', title: 'Mostrar margens de segurança e linha de corte' });
  guidesBtn.addEventListener('click', () => { state.guides = !state.guides; guidesBtn.classList.toggle('on', state.guides); emit('view'); });

  return h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, icon('book'), h('b', {}, 'Livro de Formatura')),
    titleInput,
    h('div', { class: 'tb-group' }, undoBtn, redoBtn),
    h('div', { class: 'tb-group' },
      btn('Texto', { icon: 'text', onClick: addText, title: 'Adicionar caixa de texto' }),
      btn('Foto', { icon: 'image', onClick: addPhoto, title: 'Adicionar espaço de foto' }),
      decoBtn),
    h('div', { class: 'tb-group' }, guidesBtn),
    h('div', { class: 'tb-spacer' }),
    saveStatus,
    btn('Alunos em lote', { icon: 'users', onClick: openBatchDialog, title: 'Inserir várias fotos e textos de uma vez' }),
    projBtn,
    btn('Exportar para impressão', { icon: 'print', cls: 'primary', onClick: openExportDialog }),
  );
}


function refreshTop() {
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
  saveStatus.textContent = state.saved ? '✓ Salvo' : 'Salvando…';
  const fname = currentFileName();
  saveStatus.title = 'O projeto é salvo automaticamente neste navegador. ' + (fname
    ? `Ctrl+S grava também no arquivo "${fname}".`
    : 'Para guardar num arquivo (backup ou outro PC), use Projeto › Salvar… (Ctrl+S).');
  if (document.activeElement !== titleInput) titleInput.value = state.book.title;
}

function buildZoomBar() {
  zoomLabel = h('span', { class: 'zoom-label' }, '');
  const bar = h('div', { class: 'zoombar' },
    btn('', { icon: 'minus', title: 'Diminuir zoom', onClick: () => setZoom(getZoom() / 1.2) }),
    zoomLabel,
    btn('', { icon: 'plus', title: 'Aumentar zoom', onClick: () => setZoom(getZoom() * 1.2) }),
    btn('Ajustar', { icon: 'fit', title: 'Ajustar à tela', onClick: () => setZoom(null) }),
    h('span', { class: 'sep' }),
    btn('', { icon: 'left', title: 'Folha anterior (PageUp)', onClick: () => goSpread(state.spread - 1) }),
    h('span', { class: 'spread-label' }),
    btn('', { icon: 'right', title: 'Próxima folha (PageDown)', onClick: () => goSpread(state.spread + 1) }),
  );
  setTimeout(() => emit('view'), 50);
  return bar;
}

function goSpread(i) {
  if (i < 0 || i >= spreadCount()) return;
  state.spread = i;
  state.sel = null;
  if (sheet === 'left') openSheet(null); // no celular: escolheu a folha, a gaveta fecha para mostrar
  emit('select');
}

// ───────── adicionar elementos ─────────
function addElement(el) {
  const t = targetSlot();
  if (!t) return;
  const H = t.page.layout === 'halves' ? HALF_H : PAGE_H;
  el.x = Math.round((PAGE_W - el.w) / 2 * 10) / 10;
  el.y = Math.round((H - el.h) / 2 * 10) / 10;
  el.id = uid(); el.seed = randSeed();
  t.slot.elements.push(el);
  state.sel = { pageId: t.page.id, slot: t.slotIdx, elId: el.id };
  rightTab = 'edit';
  commit();
  emit('select');
}
function addText() { addElement(T({ ...BODY, text: 'Digite o texto aqui', w: 60, h: 14, autoFit: true })); }
function addPhoto() { addElement(P({ frame: 'rounded', w: 40, h: 50 })); }
// miniatura do enfeite para o menu
function decoPreview(d) {
  const W = 40, H = 24, dpr = 2;
  const c = h('canvas', { class: 'menu-prev' });
  c.width = W * dpr; c.height = H * dpr;
  const k = Math.min((W - 6) / d.w, (H - 6) / Math.max(d.h, 1.2));
  const ctx = c.getContext('2d');
  ctx.scale(dpr * k, dpr * k);
  const el = { type: 'deco', kind: d.id, w: d.w, h: d.h, x: (W / k - d.w) / 2, y: (H / k - d.h) / 2, rotation: d.rotation || 0, variant: d.variant, color: d.id === 'panel' ? '#E9DCC8' : d.color || 'gold', opacity: 1, seed: 7 };
  try { drawElement(ctx, el, { s: dpr * k, cache: false }); } catch { /* miniatura é só enfeite */ }
  return c;
}

function addDeco(d) {
  addElement(D(d.id, { w: d.w, h: d.h, rotation: d.rotation || 0, variant: d.variant, color: d.color || 'gold', opacity: d.opacity ?? 1 }));
}

// ───────── painel esquerdo: folhas ─────────
const thumbCache = new Map();

function buildLeft(left) {
  leftList = h('div', { class: 'spread-list' });
  // enquanto uma folha é arrastada com o dedo, a lista não rola junto
  leftList.addEventListener('touchmove', (e) => { if (document.body.classList.contains('sheet-dragging')) e.preventDefault(); }, { passive: false });
  leftStats = h('div', { class: 'stats' });
  left.append(
    sheetHandle(), // só aparece no celular
    h('div', { class: 'panel-head' }, h('h3', {}, 'Folhas A4'), h('small', {}, 'cada folha = 2 páginas')),
    leftList,
    h('div', { class: 'left-foot' },
      btn('Nova folha', { icon: 'plus', cls: 'block', onClick: addSpread, title: 'Adiciona 2 páginas com 4 alunos' }),
      leftStats),
  );
}

function spreadSig(i) {
  return JSON.stringify(spreadPages(i));
}

const drawThumbs = debounce(() => {
  const cards = [...leftList.querySelectorAll('.spread')];
  let k = 0;
  const step = () => {
    const card = cards[k++];
    if (!card) return;
    const i = +card.dataset.i;
    const sig = spreadSig(i);
    const c = card.querySelector('canvas');
    if (c.dataset.sig !== sig) {
      let img = thumbCache.get(sig);
      if (!img) {
        const [L, R] = spreadPages(i);
        img = renderSheetCanvas(L, R, 0.75 * (window.devicePixelRatio || 1), { editor: true });
        thumbCache.set(sig, img);
        if (thumbCache.size > 80) thumbCache.delete(thumbCache.keys().next().value);
      }
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      c.dataset.sig = sig;
    }
    setTimeout(step, 0);
  };
  step();
}, 250);

function refreshLeft() {
  const n = spreadCount();
  const existing = leftList.children.length;
  if (existing !== n) {
    leftList.innerHTML = '';
    for (let i = 0; i < n; i++) leftList.append(spreadCard(i));
  }
  [...leftList.children].forEach((card, i) => {
    card.classList.toggle('active', i === state.spread);
    const pages = state.book.pages;
    const a = i * 2 + 1, b = Math.min(i * 2 + 2, pages.length);
    card.querySelector('.sp-pages').textContent = a === b ? `pág. ${a}` : `págs. ${a}–${b}`;
  });
  leftList.children[state.spread]?.scrollIntoView({ block: 'nearest' });
  drawThumbs();

  // estatísticas
  let slots = 0, filled = 0;
  for (const p of state.book.pages) {
    if (p.layout !== 'halves') continue;
    for (const s of p.slots) {
      const ph = s.elements.find((e) => e.type === 'photo');
      if (!ph) continue;
      slots++;
      if (ph.src) filled++;
    }
  }
  leftStats.innerHTML = '';
  leftStats.append(
    h('div', {}, h('b', {}, String(n)), ' folhas A4 · ', h('b', {}, String(state.book.pages.length)), ' páginas'),
    h('div', {}, h('b', {}, `${filled}/${slots}`), ' espaços de aluno com foto'),
  );
}

function spreadCard(i) {
  const c = h('canvas', { class: 'sp-canvas' });
  const card = h('div', { class: 'spread', 'data-i': i, title: 'Clique para abrir · arraste para mudar a ordem', onPointerdown: (e) => startCardDrag(e, i, card) },
    c,
    h('div', { class: 'sp-meta' },
      h('span', { class: 'sp-title' }, `Folha ${i + 1}`),
      h('span', { class: 'sp-pages' }),
      h('span', { class: 'sp-actions' },
        miniBtn('up', 'Mover folha para cima', () => moveSpread(i, -1)),
        miniBtn('down', 'Mover folha para baixo', () => moveSpread(i, 1)),
        miniBtn('copy', 'Duplicar folha', () => duplicateSpread(i)),
        miniBtn('trash', 'Excluir folha', async () => {
          if (await confirmBox('Excluir folha', `Excluir a folha ${i + 1} (2 páginas)? Você pode desfazer com Ctrl+Z.`, 'Excluir', true)) deleteSpread(i);
        }),
      ),
    ),
  );
  return card;
}

// Arrastar uma folha na lista para mudar a ordem (como os slides do PowerPoint)
function startCardDrag(e, from, card) {
  if (e.button !== 0 || e.target.closest('button')) return;
  // celular: arrastar o dedo rola a lista; segurar o dedo ~meio segundo pega a folha para mudar a ordem
  const touch = e.pointerType === 'touch' && isMobile();
  if (!touch) e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  const r0 = card.getBoundingClientRect();
  const offX = sx - r0.left, offY = sy - r0.top;
  let dragging = false, ghost, line, insertAt = null, lastX = sx, lastY = sy, raf = 0;
  const place = () => { ghost.style.transform = `translate(${lastX - offX}px, ${lastY - offY}px) rotate(-1.5deg)`; };
  const press = touch ? setTimeout(() => { navigator.vibrate?.(15); begin(); place(); }, 450) : 0;

  const begin = () => {
    dragging = true;
    card.classList.add('dragging');
    document.body.classList.add('sheet-dragging');
    ghost = card.cloneNode(true);
    ghost.className = 'spread spread-ghost';
    ghost.style.width = r0.width + 'px';
    const src = card.querySelector('canvas'), dst = ghost.querySelector('canvas');
    dst.width = src.width; dst.height = src.height;
    dst.getContext('2d').drawImage(src, 0, 0);
    document.body.append(ghost);
    line = h('div', { class: 'drop-line' });
    leftList.append(line);
    tick();
  };

  const updateInsert = () => {
    const cards = [...leftList.querySelectorAll('.spread')];
    const grid = getComputedStyle(leftList).display === 'grid'; // no celular as folhas ficam em 2 colunas
    let idx = cards.length;
    for (let k = 0; k < cards.length; k++) {
      const r = cards[k].getBoundingClientRect();
      if (grid ? (lastY < r.top || (lastY <= r.bottom && lastX < r.left + r.width / 2)) : lastY < r.top + r.height / 2) { idx = k; break; }
    }
    insertAt = idx;
    const noop = idx === from || idx === from + 1;
    line.style.display = noop ? 'none' : 'block';
    line.classList.toggle('v', grid);
    if (!noop) {
      const ref = cards[idx] || cards[cards.length - 1];
      if (grid) {
        line.style.left = (idx < cards.length ? ref.offsetLeft - 7 : ref.offsetLeft + ref.offsetWidth + 4) + 'px';
        line.style.top = ref.offsetTop + 'px';
        line.style.height = ref.offsetHeight + 'px';
      } else line.style.top = (idx < cards.length ? ref.offsetTop - 6 : ref.offsetTop + ref.offsetHeight + 4) + 'px';
    }
  };

  const tick = () => {
    if (!dragging) return;
    const lr = leftList.getBoundingClientRect();
    const edge = 60;
    if (lastY < lr.top + edge) leftList.scrollTop -= Math.ceil((lr.top + edge - lastY) / 4);
    else if (lastY > lr.bottom - edge) leftList.scrollTop += Math.ceil((lastY - (lr.bottom - edge)) / 4);
    updateInsert();
    raf = requestAnimationFrame(tick);
  };

  const move = (ev) => {
    lastX = ev.clientX; lastY = ev.clientY;
    if (!dragging) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < (touch ? 10 : 6)) return;
      if (touch) return end(ev, true); // o dedo andou antes de segurar: é rolagem, não arrastar
      begin();
    }
    place();
  };
  const end = (ev, cancel = false) => {
    clearTimeout(press);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancelEv);
    window.removeEventListener('keydown', esc);
    if (!dragging) { if (!cancel) goSpread(from); return; }
    dragging = false;
    cancelAnimationFrame(raf);
    ghost.remove(); line.remove();
    card.classList.remove('dragging');
    document.body.classList.remove('sheet-dragging');
    if (cancel || insertAt == null || insertAt === from || insertAt === from + 1) return;
    state.sel = null;
    const res = moveSpreadTo(from, insertAt);
    if (res?.padded) toast('Uma página em branco foi adicionada para completar a folha.', 'info');
  };
  const up = (ev) => end(ev);
  const cancelEv = (ev) => end(ev, true);
  const esc = (ev) => { if (ev.key === 'Escape') end(ev, true); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancelEv);
  window.addEventListener('keydown', esc);
}

function miniBtn(ic, title, fn) {
  return h('button', { class: 'mini', title, onClick: (e) => { e.stopPropagation(); fn(); } }, icon(ic));
}

// ───────── painel direito ─────────
let boundEl = null, boundSig = '';
let syncers = [];

function selSig() {
  const s = getSel();
  if (!s) return 'none';
  const el = s.el;
  return [s.page.id, s.slotIdx, s.page.layout, s.page.bg, s.page.divider, s.slot.template, el?.id, el?.frame, el?.fit, !!el?.src, el?.font, el?.border, el?.kind, state.panMode, (state.multi || []).join(','), (state.book.customTemplates || []).map((t) => t.id + t.name).join(',')].join('|');
}

function needsRebuild() {
  const s = getSel();
  return (s?.el || null) !== boundEl || selSig() !== boundSig;
}

function syncInputs() {
  for (const f of syncers) f();
}

// posição da rolagem da aba Modelos, para não voltar ao topo ao escolher um modelo
let templatesScroll = 0;
let renderedTab = null;

function renderRight() {
  const s = getSel();
  boundEl = s?.el || null;
  boundSig = selSig();
  syncers = [];
  const oldBody = rightEl.querySelector('.right-body');
  if (oldBody && renderedTab === 'templates') templatesScroll = oldBody.scrollTop;
  renderedTab = rightTab;
  rightEl.innerHTML = '';
  rightEl.append(sheetHandle()); // só aparece no celular
  refreshMobileNav();
  const tabs = h('div', { class: 'tabs' },
    h('button', { class: 'tab' + (rightTab === 'templates' ? ' on' : ''), onClick: () => { rightTab = 'templates'; renderRight(); } }, icon('grid'), 'Modelos'),
    h('button', { class: 'tab' + (rightTab === 'edit' ? ' on' : ''), onClick: () => { rightTab = 'edit'; renderRight(); } }, icon('move'), 'Editar'),
  );
  rightEl.append(tabs);
  const body = h('div', { class: 'right-body' });
  rightEl.append(body);
  if (rightTab === 'templates') {
    renderTemplates(body);
    body.scrollTop = templatesScroll;
  } else if (getMulti().length) renderMultiProps(body);
  else if (s?.el?.locked) renderLockedProps(body, s);
  else if (s?.el?.type === 'text') renderTextProps(body, s);
  else if (s?.el?.type === 'photo') renderPhotoProps(body, s);
  else if (s?.el?.type === 'deco') renderDecoProps(body, s);
  else renderPageProps(body);
}

// ───── campos reutilizáveis ─────
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString();

function section(title, ...children) {
  return h('div', { class: 'section' }, title ? h('h4', {}, title) : null, ...children);
}
function row(...children) { return h('div', { class: 'row' }, ...children); }
function field(label, input, extra) { return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, extra || null); }

function numInput(obj, key, { step = 0.5, min, max, d = 1, onSet } = {}) {
  const i = h('input', { type: 'number', step, min, max, value: fmt(obj[key] ?? 0, d) });
  i.addEventListener('input', () => {
    const v = parseFloat(i.value.replace(',', '.'));
    if (isNaN(v)) return;
    obj[key] = v; onSet?.(v); requestRender(); commitLater();
  });
  syncers.push(() => { if (document.activeElement !== i) i.value = fmt(obj[key] ?? 0, d); });
  return i;
}

function rangeInput(obj, key, { min, max, step, show = (v) => v, onSet } = {}) {
  const out = h('span', { class: 'rng-val' }, show(obj[key]));
  const i = h('input', { type: 'range', min, max, step, value: obj[key] });
  i.addEventListener('input', () => { obj[key] = parseFloat(i.value); out.textContent = show(obj[key]); onSet?.(); requestRender(); emit('live'); });
  i.addEventListener('change', () => commit());
  syncers.push(() => { if (document.activeElement !== i) i.value = obj[key]; out.textContent = show(obj[key]); });
  return h('div', { class: 'rng' }, i, out);
}

function selectInput(obj, key, options, onSet) {
  const s = h('select', {});
  for (const o of options) {
    if (o.group) {
      const g = h('optgroup', { label: o.group });
      for (const x of o.items) g.append(h('option', { value: x[0], style: x[2] }, x[1]));
      s.append(g);
    } else s.append(h('option', { value: o[0] }, o[1]));
  }
  s.value = obj[key] == null ? 'null' : String(obj[key]);
  s.addEventListener('change', () => {
    const v = s.value;
    obj[key] = /^-?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : v === 'null' ? null : v;
    onSet?.(obj[key]);
    commit();
  });
  return s;
}

function checkInput(obj, key, label, onSet) {
  const c = h('input', { type: 'checkbox' });
  c.checked = !!obj[key];
  c.addEventListener('change', () => { obj[key] = c.checked; onSet?.(); commit(); });
  syncers.push(() => { c.checked = !!obj[key]; });
  return h('label', { class: 'check' }, c, h('span', {}, label));
}

function segInput(obj, key, options) {
  const wrap = h('div', { class: 'seg' });
  const btns = options.map(([v, ic, title, label]) => {
    const b = h('button', { title, class: obj[key] === v ? 'on' : '', onClick: () => {
      obj[key] = v; btns.forEach((x) => x.classList.toggle('on', x === b)); commit();
    } }, ic ? icon(ic) : null, label ? h('span', {}, label) : null);
    return b;
  });
  wrap.append(...btns);
  return wrap;
}

function colorInput(obj, key, { gold = false } = {}) {
  const wrap = h('div', { class: 'colors' });
  const pick = h('input', { type: 'color', title: 'Outra cor', value: /^#/.test(obj[key]) ? obj[key] : '#A8813A' });
  const sw = [];
  const mark = () => sw.forEach((b) => b.classList.toggle('on', b.dataset.v === String(obj[key])));
  if (gold) {
    const b = h('button', { class: 'sw gold', title: 'Dourado (efeito metálico)', 'data-v': 'gold', onClick: () => { obj[key] = 'gold'; mark(); commit(); } });
    sw.push(b);
  }
  for (const c of SWATCHES) {
    const b = h('button', { class: 'sw', style: { background: c }, title: c, 'data-v': c, onClick: () => { obj[key] = c; pick.value = c; mark(); commit(); } });
    sw.push(b);
  }
  pick.addEventListener('input', () => { obj[key] = pick.value; mark(); requestRender(); });
  pick.addEventListener('change', () => commit());
  wrap.append(...sw, pick);
  mark();
  return wrap;
}

function geometry(el) {
  return section('Posição e tamanho (mm)',
    row(field('X', numInput(el, 'x')), field('Y', numInput(el, 'y')), field('Largura', numInput(el, 'w', { min: 1 })), field('Altura', numInput(el, 'h', { min: 0.3 }))),
    row(field('Rotação (°)', numInput(el, 'rotation', { step: 1, min: -180, max: 180 })),
      field('Opacidade', rangeInput(el, 'opacity', { min: 0.05, max: 1, step: 0.05, show: (v) => Math.round(v * 100) + '%' }))),
  );
}

// ───── ordem dos blocos (alunos / professores) ─────
function blockName(slot) {
  const named = slot.elements.find((e) => e.type === 'text' && e.role === 'name' && e.text.trim());
  const first = named || slot.elements.find((e) => e.type === 'text' && e.text.trim() && e.text.trim().length <= 40);
  return first ? first.text.trim().split('\n')[0] : '(sem nome)';
}
const blockWhere = (pageIdx, slotIdx) => `página ${pageIdx + 1}, ${slotIdx ? 'embaixo' : 'em cima'}`;

function moveBlockUI(pageId, slotIdx, dir) {
  const i = blockIndex(pageId, slotIdx);
  const total = blockList().length;
  if (i < 0) { toast('A ordem só vale para páginas com 2 alunos (cima e baixo).', 'warn'); return; }
  if ((dir < 0 && i === 0) || (dir > 0 && i === total - 1)) { toast(dir < 0 ? 'Este já é o primeiro do livro.' : 'Este já é o último do livro.', 'warn'); return; }
  const r = moveBlock(pageId, slotIdx, dir);
  if (r.locked) { toast('Não dá para trocar: um dos dois blocos tem itens travados (cadeado).', 'warn'); return; }
  if (r.ok) toast(`Movido para a ${blockWhere(r.pageIdx, r.slotIdx)}.`);
}

// pergunta como apagar: puxando os próximos blocos ou só esvaziando este espaço
function deleteBlockUI(pageId, slotIdx, after) {
  const i = blockIndex(pageId, slotIdx);
  if (i < 0) { toast('Apagar bloco vale para páginas com 2 blocos (cima e baixo).', 'warn'); return; }
  const b = blockList()[i];
  const slot = b.page.slots[b.slotIdx];
  const name = blockName(slot);
  const done = (res) => {
    if (res.locked) { toast('Não dá para apagar: este bloco (ou um dos seguintes) tem itens travados. Destrave antes.', 'warn'); return; }
    if (res.ok) { toast(`Bloco "${name}" apagado. Ctrl+Z desfaz.`); after?.(); }
  };
  modal('Apagar bloco',
    h('div', {},
      h('p', {}, `Apagar o bloco `, h('b', {}, name), ` (${blockWhere(b.pageIdx, b.slotIdx)})? A foto, os textos e os enfeites dele somem.`),
      h('p', { class: 'hint' }, 'Puxar os próximos: os blocos seguintes sobem uma casa (passando de página se precisar) e o último espaço do livro fica vazio. Só esvaziar: os outros não mudam de lugar.')),
    [
      { label: 'Cancelar', onClick: (c) => c() },
      { label: 'Só esvaziar este espaço', onClick: (c) => { c(); done(deleteBlock(pageId, slotIdx, { shift: false })); } },
      { label: 'Apagar e puxar os próximos', danger: true, icon: 'trash', onClick: (c) => { c(); done(deleteBlock(pageId, slotIdx, { shift: true })); } },
    ]);
}

// ───── ordem das páginas ─────
const pageWhere = (i) => `página ${i + 1} (${i % 2 ? 'direita' : 'esquerda'} da folha ${Math.floor(i / 2) + 1})`;

function movePageUI(pageId, dir) {
  const i = pageIndex(pageId), n = state.book.pages.length;
  if ((dir < 0 && i === 0) || (dir > 0 && i === n - 1)) { toast(dir < 0 ? 'Esta já é a primeira página.' : 'Esta já é a última página.', 'warn'); return; }
  const r = movePage(pageId, dir);
  if (r.ok) toast(`Agora é a ${pageWhere(r.idx)}.`);
}

function pageThumb(page, i) {
  const k = 0.9, c = h('canvas', { class: 'page-thumb' });
  c.width = Math.round(PAGE_W * k); c.height = Math.round(PAGE_H * k);
  const ctx = c.getContext('2d');
  ctx.scale(k, k);
  renderPage(ctx, page, i % 2 ? 'right' : 'left', { s: k });
  return c;
}

function pageLabel(page) {
  if (page.layout === 'halves') return page.slots.map(blockName).join(' · ');
  return getTemplate(page.slots[0]?.template).name || 'Página inteira';
}

function openPageOrder() {
  const list = h('div', { class: 'block-list' });
  let dragFrom = -1;
  const render = () => {
    list.innerHTML = '';
    const sel = getSel();
    state.book.pages.forEach((p, i, all) => {
      const move = (to) => { movePageTo(i, to); render(); };
      const item = h('div', { class: 'block-item page-item' + (sel?.page.id === p.id ? ' on' : ''), draggable: 'true', title: 'Arraste para mudar a ordem' },
        h('span', { class: 'block-n' }, i + 1),
        pageThumb(p, i),
        h('div', { class: 'block-txt' },
          h('b', {}, pageLabel(p)),
          h('small', {}, `${i % 2 ? 'direita' : 'esquerda'} da folha ${Math.floor(i / 2) + 1}`)),
        h('div', { class: 'block-btns' },
          h('button', { class: 'abtn', title: 'Mover para trás', disabled: i === 0, onClick: () => move(i - 1) }, icon('up')),
          h('button', { class: 'abtn', title: 'Mover para frente', disabled: i === all.length - 1, onClick: () => move(i + 1) }, icon('down'))),
      );
      item.addEventListener('dragstart', (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); item.classList.add('dragging'); });
      item.addEventListener('dragend', () => { item.classList.remove('dragging'); list.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after')); });
      item.addEventListener('dragover', (e) => {
        if (dragFrom < 0) return;
        e.preventDefault();
        const r = item.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
        list.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
        item.classList.add(after ? 'drop-after' : 'drop-before');
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragFrom < 0) return;
        const r = item.getBoundingClientRect(), ins = e.clientY > r.top + r.height / 2 ? i + 1 : i;
        const from = dragFrom, to = ins > from ? ins - 1 : ins;
        dragFrom = -1;
        if (to !== from) movePageTo(from, to);
        render();
      });
      list.append(item);
    });
  };
  render();
  modal('Ordem das páginas',
    h('div', {},
      h('p', { class: 'hint' }, 'Arraste uma página para cima ou para baixo (ou use as setas). As outras andam uma casa: a página da direita vira esquerda, a da esquerda passa para a folha anterior, e assim por diante.'),
      list),
    [{ label: 'Pronto', primary: true, onClick: (c) => c() }], { wide: true });
}

function blockThumb(b) {
  const k = 1.6, c = h('canvas', { class: 'block-thumb' });
  c.width = Math.round(PAGE_W * k); c.height = Math.round(HALF_H * k);
  const ctx = c.getContext('2d');
  ctx.scale(k, k);
  ctx.translate(0, -HALF_H * b.slotIdx);
  renderPage(ctx, b.page, b.pageIdx % 2 ? 'right' : 'left', { s: k });
  return c;
}

function openBlockOrder() {
  const list = h('div', { class: 'block-list' });
  let dragFrom = -1;
  const render = () => {
    list.innerHTML = '';
    const sel = getSel();
    blockList().forEach((b, i, all) => {
      const slot = b.page.slots[b.slotIdx];
      const on = sel && sel.page.id === b.page.id && sel.slotIdx === b.slotIdx;
      const move = (to) => {
        const r = moveBlockTo(i, to);
        if (r.locked) toast('Não dá para mover por cima de blocos com itens travados (cadeado).', 'warn');
        render();
      };
      const item = h('div', { class: 'block-item' + (on ? ' on' : ''), draggable: 'true', title: 'Arraste para mudar a ordem' },
        h('span', { class: 'block-n' }, i + 1),
        blockThumb(b),
        h('div', { class: 'block-txt' },
          h('b', {}, blockName(slot)),
          h('small', {}, blockWhere(b.pageIdx, b.slotIdx)),
          slot.elements.some((e) => e.locked) ? h('small', { class: 'block-lock' }, icon('lock'), ' tem itens travados') : null),
        h('div', { class: 'block-btns' },
          h('button', { class: 'abtn', title: 'Subir', disabled: i === 0, onClick: () => move(i - 1) }, icon('up')),
          h('button', { class: 'abtn', title: 'Descer', disabled: i === all.length - 1, onClick: () => move(i + 1) }, icon('down'))),
        h('button', { class: 'abtn danger', title: 'Apagar este bloco', onClick: () => deleteBlockUI(b.page.id, b.slotIdx, render) }, icon('trash')),
      );
      item.addEventListener('dragstart', (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); item.classList.add('dragging'); });
      item.addEventListener('dragend', () => { item.classList.remove('dragging'); list.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after')); });
      item.addEventListener('dragover', (e) => {
        if (dragFrom < 0) return;
        e.preventDefault();
        const r = item.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
        list.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
        item.classList.add(after ? 'drop-after' : 'drop-before');
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragFrom < 0) return;
        const r = item.getBoundingClientRect(), ins = e.clientY > r.top + r.height / 2 ? i + 1 : i;
        const from = dragFrom;
        const to = ins > from ? ins - 1 : ins;
        dragFrom = -1;
        if (to !== from) {
          const res = moveBlockTo(from, to);
          if (res.locked) toast('Não dá para mover por cima de blocos com itens travados (cadeado).', 'warn');
        }
        render();
      });
      list.append(item);
    });
  };
  render();
  modal('Ordem dos alunos e professores',
    h('div', {},
      h('p', { class: 'hint' }, 'Arraste um bloco para cima ou para baixo (ou use as setas). Os outros andam uma casa e passam de uma página para outra sozinhos. O fundo das páginas não muda. Páginas inteiras (capa, turma…) não entram na lista.'),
      list),
    [{ label: 'Pronto', primary: true, onClick: (c) => c() }], { wide: true });
}

// menu do botão direito na folha
function openContextMenu({ x, y, onItem }) {
  const c = clipboardInfo();
  const s = getSel();
  const many = state.multi?.length >= 2;
  if (onItem && !many && s?.el?.locked) {
    menu({ x, y }, [
      { label: 'Destravar', icon: 'unlock', keys: 'Ctrl+Shift+L', onClick: () => lockSelected(false) },
      { label: 'Destravar a página inteira', icon: 'unlock', onClick: () => unlockAllOnPage(s.page) },
      { label: 'Destravar o livro inteiro', icon: 'unlock', onClick: unlockBookUI },
      '-',
      { label: 'Copiar', icon: 'copy', keys: 'Ctrl+C', onClick: () => copySelected() },
      { label: 'Duplicar', icon: 'copy', keys: 'Ctrl+D', onClick: duplicateSelected },
    ]);
    return;
  }
  const pasteLabel = c ? `Colar aqui (${c.whole ? (c.size === 'half' ? 'aluno inteiro' : 'página inteira') : c.count + (c.count === 1 ? ' item' : ' itens')})` : 'Colar aqui';
  const items = onItem || many ? [
    { label: many ? `Copiar ${state.multi.length} itens` : 'Copiar', icon: 'copy', keys: 'Ctrl+C', onClick: () => copySelected() },
    { label: 'Recortar', icon: 'copy', keys: 'Ctrl+X', onClick: () => copySelected({ cut: true }) },
    { label: pasteLabel, icon: 'plus', keys: 'Ctrl+V', disabled: !c, onClick: pasteClipboard },
    { label: 'Duplicar', icon: 'copy', keys: 'Ctrl+D', onClick: duplicateSelected },
    '-',
    many && !isOneGroup(getMulti().map((f) => f.el)) ? { label: 'Agrupar', icon: 'grid', keys: 'Ctrl+G', onClick: groupSelected } : null,
    (many ? getMulti().map((f) => f.el) : [s?.el]).some((e) => e?.group) ? { label: 'Desagrupar', icon: 'grid', keys: 'Ctrl+Shift+G', onClick: ungroupSelected } : null,
    { label: 'Copiar o aluno inteiro', icon: 'grid', onClick: () => copySelected({ whole: true }) },
    { label: 'Travar (cadeado)', icon: 'lock', keys: 'Ctrl+Shift+L', onClick: () => lockSelected(true) },
    '-',
    { label: 'Excluir', icon: 'trash', keys: 'Delete', onClick: deleteSelected },
  ].filter(Boolean) : [
    { label: pasteLabel, icon: 'plus', keys: 'Ctrl+V', disabled: !c, onClick: pasteClipboard },
    s ? { label: s.page.layout === 'halves' ? 'Copiar este aluno inteiro' : 'Copiar a página inteira', icon: 'grid', keys: 'Ctrl+C', onClick: () => copySelected({ whole: true }) } : null,
    s?.page.layout === 'halves' ? '-' : null,
    s?.page.layout === 'halves' ? { label: 'Subir este bloco', icon: 'up', keys: 'Alt+↑', onClick: () => moveBlockUI(s.page.id, s.slotIdx, -1) } : null,
    s?.page.layout === 'halves' ? { label: 'Descer este bloco', icon: 'down', keys: 'Alt+↓', onClick: () => moveBlockUI(s.page.id, s.slotIdx, 1) } : null,
    s?.page.layout === 'halves' ? { label: 'Organizar a ordem de todos…', icon: 'grid', onClick: openBlockOrder } : null,
    s?.page.layout === 'halves' ? { label: 'Apagar este bloco…', icon: 'trash', keys: 'Delete', onClick: () => deleteBlockUI(s.page.id, s.slotIdx) } : null,
    s ? '-' : null,
    s ? { label: 'Mover a página para trás', icon: 'left', onClick: () => movePageUI(s.page.id, -1) } : null,
    s ? { label: 'Mover a página para frente', icon: 'right', onClick: () => movePageUI(s.page.id, 1) } : null,
    s ? { label: 'Organizar a ordem das páginas…', icon: 'grid', onClick: openPageOrder } : null,
    s ? '-' : null,
    s ? { label: 'Travar a página inteira', icon: 'lock', onClick: () => lockAllOnPage(s.page) } : null,
    s ? { label: 'Destravar a página inteira', icon: 'unlock', onClick: () => unlockAllOnPage(s.page) } : null,
    lockedInBook() ? { label: 'Destravar o livro inteiro', icon: 'unlock', onClick: unlockBookUI } : null,
  ].filter(Boolean);
  menu({ x, y }, items);
}

// destrava todas as páginas, perguntando antes (dá para desfazer)
async function unlockBookUI() {
  const n = lockedInBook();
  if (!n) { toast('Nada travado no livro.'); return; }
  if (await confirmBox('Destravar o livro inteiro', `Destravar ${n === 1 ? '1 item travado' : `os ${n} itens travados`} em todas as páginas do livro? Você pode desfazer com Ctrl+Z.`, 'Destravar tudo')) unlockAllInBook();
}

// ───── item travado (cadeado) ─────
function renderLockedProps(body, s) {
  const el = s.el;
  const kind = el.type === 'photo' ? 'Foto' : el.type === 'text' ? 'Texto' : DECOS.find((d) => d !== '-' && d.id === el.kind)?.name || 'Enfeite';
  appendAll(body,
    header(kind, where(s)),
    section(null,
      h('div', { class: 'locked-note' }, icon('lock'), h('div', {},
        h('b', {}, 'Travado'),
        h('p', {}, 'Este item não pode ser movido, redimensionado, girado, editado nem apagado. Destrave para mexer de novo.'))),
      btn('Destravar', { icon: 'unlock', cls: 'primary block', onClick: () => lockSelected(false), title: 'Ctrl+Shift+L' }),
      btn('Destravar a página inteira', { icon: 'unlock', cls: 'block', onClick: () => unlockAllOnPage(s.page) }),
      btn('Destravar o livro inteiro', { icon: 'unlock', cls: 'block', onClick: unlockBookUI }),
    ),
    section(null,
      h('p', { class: 'hint' }, 'Dá para copiar ou duplicar: a cópia sai destravada.'),
      h('div', { class: 'actions' },
        btn('Copiar', { icon: 'copy', onClick: () => copySelected(), title: 'Ctrl+C' }),
        btn('Duplicar', { icon: 'copy', onClick: duplicateSelected, title: 'Ctrl+D' })),
    ),
  );
}

function groupActions(els) {
  const one = isOneGroup(els);
  const anyGrouped = els.some((e) => e.group);
  return h('div', { class: 'actions' },
    one ? null : btn('Agrupar', { icon: 'grid', cls: 'primary', onClick: groupSelected, title: 'Ctrl+G' }),
    anyGrouped ? btn('Desagrupar', { icon: 'grid', onClick: ungroupSelected, title: 'Ctrl+Shift+G' }) : null);
}

function clipActions() {
  const c = clipboardInfo();
  return h('div', { class: 'actions' },
    btn('Copiar', { icon: 'copy', onClick: () => copySelected(), title: 'Ctrl+C · depois clique em outra página e cole' }),
    btn('Colar', { icon: 'plus', onClick: pasteClipboard, disabled: !c, title: 'Ctrl+V · cola na metade/página selecionada' }));
}

function elementActions() {
  const el = getSel()?.el;
  const inGroup = el?.group ? h('div', { class: 'in-group' },
    h('p', { class: 'hint' }, 'Este item faz parte de um grupo e você está editando só ele. Para pegar o grupo todo, clique fora e depois em qualquer item do grupo.'),
    h('div', { class: 'actions' }, btn('Desagrupar', { icon: 'grid', onClick: ungroupSelected, title: 'Ctrl+Shift+G' }))) : null;
  return section(null, inGroup, clipActions(), h('div', { class: 'actions' },
    btn('Duplicar', { icon: 'copy', onClick: duplicateSelected, title: 'Ctrl+D' }),
    btn('Frente', { icon: 'front', onClick: () => reorderSelected('top'), title: 'Trazer para frente' }),
    btn('Trás', { icon: 'back', onClick: () => reorderSelected('bottom'), title: 'Enviar para trás' }),
    btn('Excluir', { icon: 'trash', cls: 'danger', onClick: deleteSelected, title: 'Delete' }),
  ), btn('Travar (cadeado)', { icon: 'lock', cls: 'block', onClick: () => lockSelected(true), title: 'Impede mover, editar ou apagar · Ctrl+Shift+L' }));
}

function header(title, sub) {
  return h('div', { class: 'prop-head' }, h('h3', {}, title), sub ? h('small', {}, sub) : null);
}

function where(s) {
  return `Página ${s.pageIdx + 1}${s.page.layout === 'halves' ? (s.slotIdx ? ' · aluno de baixo' : ' · aluno de cima') : ''}`;
}

// ───── texto ─────
let measureCtx;
function renderTextProps(body, s) {
  const el = s.el;
  const ta = h('textarea', { rows: 6, spellcheck: 'true' });
  ta.value = el.text;
  ta.addEventListener('input', () => { el.text = ta.value; requestRender(); commitLater(); updateFitInfo(); });
  syncers.push(() => { if (document.activeElement !== ta) ta.value = el.text; });

  const fontSel = selectInput(el, 'font',
    ['Clássicas', 'Manuscritas', 'Modernas'].map((g) => ({
      group: g, items: FONTS.filter((f) => f.group === g).map((f) => [f.family, f.family, `font-family:"${f.family}";font-size:15px`]),
    })),
    (fam) => {
      const ws = fontWeights(fam);
      if (!ws.includes(el.weight)) el.weight = ws.reduce((a, b) => (Math.abs(b - el.weight) < Math.abs(a - el.weight) ? b : a), ws[0]);
      if (!fontHasItalic(fam)) el.italic = false;
    });
  fontSel.style.fontFamily = `"${el.font}"`;
  const weightSel = selectInput(el, 'weight', fontWeights(el.font).map((w) => [w, WEIGHT_NAMES[w] || w]));

  const fitInfo = h('div', { class: 'hint' });
  function updateFitInfo() {
    measureCtx ||= document.createElement('canvas').getContext('2d');
    const L = layoutText(measureCtx, el, 8, textObstacles(s.page, s.slotIdx, el));
    fitInfo.className = 'hint';
    if (L.overflow) { fitInfo.textContent = '⚠ O texto não cabe na caixa. Aumente a caixa, diminua a fonte ou ative o ajuste automático.'; fitInfo.classList.add('warn'); }
    else if (el.autoFit && L.size < el.size - 0.05) fitInfo.textContent = `Fonte reduzida automaticamente para ${fmt(L.size)} pt para caber na caixa.`;
    else fitInfo.textContent = '';
  }
  updateFitInfo();
  syncers.push(updateFitInfo);

  appendAll(body,
    header('Texto', where(s)),
    section(null, ta, fitInfo),
    wrapSection(el, s),
    section('Fonte',
      field('Família', fontSel),
      row(field('Peso', weightSel), field('Tamanho (pt)', numInput(el, 'size', { step: 0.5, min: 4, max: 120 }))),
      row(
        checkInput(el, 'italic', 'Itálico'),
        checkInput(el, 'uppercase', 'MAIÚSCULAS'),
      ),
      checkInput(el, 'autoFit', 'Diminuir a fonte automaticamente se não couber'),
    ),
    section('Cor', colorInput(el, 'color')),
    section('Alinhamento',
      row(
        segInput(el, 'align', [['left', 'alignL', 'Esquerda'], ['center', 'alignC', 'Centro'], ['right', 'alignR', 'Direita'], ['justify', 'alignJ', 'Justificado']]),
        segInput(el, 'valign', [['top', 'vTop', 'Topo'], ['middle', 'vMid', 'Meio'], ['bottom', 'vBot', 'Base']]),
      ),
      field('Entre linhas', rangeInput(el, 'lineHeight', { min: 0.8, max: 2.5, step: 0.05, show: (v) => fmt(v, 2) })),
      field('Entre letras', rangeInput(el, 'tracking', { min: -50, max: 600, step: 10, show: (v) => v })),
    ),
    geometry(el),
    elementActions(),
  );
}

// opções de contorno de fotos e sílabas (ficam logo abaixo da caixa do texto)
function wrapSection(el, s) {
  return section('Contornar fotos e separar sílabas',
      checkInput(el, 'wrapPhotos', 'Contornar as fotos (o texto desvia do formato da foto)', () => {
        if (el.wrapPhotos && el.hyphenate === undefined) el.hyphenate = true;
        setTimeout(renderRight, 0);
      }),
      el.wrapPhotos ? field('Distância da foto', rangeInput({ get wrapGap() { return el.wrapGap ?? 2.5; }, set wrapGap(v) { el.wrapGap = v; } }, 'wrapGap',
        { min: 0, max: 10, step: 0.5, show: (v) => fmt(v) + ' mm' })) : null,
      el.wrapPhotos && !(textObstacles(s.page, s.slotIdx, el) || []).length
        ? h('p', { class: 'hint warn' }, 'Nenhuma foto encosta nesta caixa. Estique a caixa de texto por cima da foto: o texto contorna sozinho.')
        : el.wrapPhotos ? h('p', { class: 'hint' }, 'Dica: estique a caixa por cima da foto. Justificado fica mais elegante no contorno.') : null,
      checkInput(el, 'hyphenate', 'Separar sílabas no fim da linha (hífen automático)'),
      /\n/.test(el.text) ? btn('Juntar as linhas que quebrei à mão', {
        icon: 'text', cls: 'block',
        title: 'Tira as quebras de linha e os hífens que você pôs à mão, para o app quebrar sozinho (parágrafos com linha em branco são mantidos)',
        onClick: () => {
          el.text = el.text
            .replace(/-[ \t]*\n[ \t]*(?=\p{Ll})/gu, '') // "desa-\nfios" → "desafios"
            .replace(/([^\n])[ \t]*\n[ \t]*(?!\n)(?=\S)/g, '$1 ') // quebra simples vira espaço
            .replace(/ {2,}/g, ' ');
          commit();
          setTimeout(renderRight, 0);
        },
      }) : null,
  );
}

// ───── foto ─────
const BORDERABLE = ['rect', 'rounded', 'circle', 'arch', 'scallop', 'heart'];
const BORDER_OPTS = [['null', 'Sem borda'], ['gold', 'Dourada'], ['#FFFFFF', 'Branca'], ['#3A2417', 'Marrom'], ['#1F1A17', 'Preta']];
const FILTER_OPTS = [['none', 'Original'], ['pb', 'Preto e branco'], ['sepia', 'Sépia (antigo)'], ['quente', 'Quente'], ['suave', 'Suave']];
const isWatercolor = (f) => f === 'brush' || f === 'soft';
const featherShow = (v) => (v === 50 ? '50 (padrão)' : String(v));
const pct = (v) => Math.round(v * 100) + '%';

// "procurador": ler mostra o valor do primeiro item; mudar muda em todos de uma vez
const proxyAll = (list, defaults = {}) => new Proxy({}, {
  get: (_, k) => list[0]?.[k] ?? defaults[k],
  set: (_, k, v) => { for (const el of list) el[k] = v; return true; },
});

// fotos antigas não têm "feather": o controle mostra 50 (o visual de antes) até ser mexido
// append que ignora itens vazios (null viraria o texto "null" na tela)
const appendAll = (parent, ...kids) => parent.append(...kids.filter((k) => k != null && k !== false));
const featherOf = (el) => ({ get feather() { return el.feather ?? 50; }, set feather(v) { el.feather = v; } });

function renderPhotoProps(body, s) {
  const el = s.el;
  const has = !!el.src;
  const q = h('div', { class: 'quality' });
  const updQ = () => {
    const dpi = photoDpi(el);
    q.className = 'quality';
    if (!dpi) { q.textContent = ''; return; }
    if (dpi >= DPI_GOOD) { q.classList.add('ok'); q.textContent = `✓ Qualidade de impressão boa (${dpi} DPI)`; }
    else if (dpi >= DPI_MIN) { q.classList.add('mid'); q.textContent = `Qualidade razoável (${dpi} DPI). Evite aumentar mais o zoom.`; }
    else { q.classList.add('bad'); q.textContent = `⚠ Resolução baixa (${dpi} DPI): a foto pode sair borrada. Use uma foto maior ou diminua o quadro.`; }
  };
  updQ();
  syncers.push(updQ);

  const panBtn = btn(state.panMode ? 'Concluir enquadramento' : 'Ajustar enquadramento', {
    icon: 'move', cls: state.panMode ? 'primary' : '',
    onClick: () => { state.panMode = !state.panMode; emit('select'); },
  });
  const borderable = BORDERABLE.includes(el.frame);

  appendAll(body,
    header('Foto', where(s)),
    section(null,
      h('div', { class: 'actions' },
        btn(has ? 'Trocar foto' : 'Escolher foto…', { icon: 'image', cls: has ? '' : 'primary', onClick: () => pickPhoto(el.id) }),
        has ? btn('Remover', { icon: 'trash', onClick: () => { el.src = null; commit(); } }) : null),
      has ? null : h('p', { class: 'hint' }, 'Dica: você também pode arrastar a foto do computador direto para o espaço na página.'),
      q,
    ),
    has ? section('Enquadramento',
      panBtn,
      field('Zoom', rangeInput(el, 'zoom', { min: el.fit === 'contain' ? 0.3 : 1, max: 4, step: 0.01, show: (v) => Math.round(v * 100) + '%' })),
      h('div', { class: 'actions' },
        btn('Centralizar', { onClick: () => { el.panX = 0; el.panY = 0; commit(); } }),
        btn('Zoom 100%', { onClick: () => { el.zoom = 1; el.panX = 0; el.panY = 0; commit(); } })),
      h('p', { class: 'hint' }, 'Atalho: segure Alt e arraste a foto para enquadrar. Duplo clique também ativa o ajuste.'),
    ) : null,
    section('Moldura',
      field('Estilo', selectInput(el, 'frame', FRAMES.map((f) => [f.id, f.name]), (v) => {
        // molduras de papel ficam melhores com sombra; ao trocar para uma delas, a sombra liga
        if (PAPER_FRAMES.includes(v)) el.shadow = true;
      })),
      field('Encaixe', selectInput(el, 'fit', [['cover', 'Preencher o quadro (corta as sobras)'], ['contain', 'Mostrar a imagem inteira (logos, brasões)']], () => { el.zoom = 1; el.panX = 0; el.panY = 0; })),
      borderable ? row(
        field('Borda', selectInput(el, 'border', [['null', 'Sem borda'], ['gold', 'Dourada'], ['#FFFFFF', 'Branca'], ['#3A2417', 'Marrom'], ['#1F1A17', 'Preta']])),
        field('Espessura', numInput(el, 'borderWidth', { step: 0.1, min: 0, max: 5 })),
      ) : null,
      el.frame === 'brush' || el.frame === 'soft' ? field('Difusão da borda', rangeInput(featherOf(el), 'feather', { min: 0, max: 100, step: 1, show: (v) => (v === 50 ? '50 (padrão)' : String(v)) })) : null,
      el.frame === 'brush' || el.frame === 'soft' ? h('p', { class: 'hint' }, 'Largura da faixa em degradê onde a foto vai sumindo. 0 = borda nítida, 100 = bem esfumada.') : null,
      el.frame !== 'brush' && el.frame !== 'soft' ? checkInput(el, 'shadow', 'Sombra suave') : null,
    ),
    has ? section('Cor e luz',
      field('Filtro', selectInput(el, 'filter', [['none', 'Original'], ['pb', 'Preto e branco'], ['sepia', 'Sépia (antigo)'], ['quente', 'Quente'], ['suave', 'Suave']])),
      field('Brilho', rangeInput(el, 'brightness', { min: 0.6, max: 1.6, step: 0.02, show: (v) => Math.round(v * 100) + '%' })),
      field('Contraste', rangeInput(el, 'contrast', { min: 0.6, max: 1.6, step: 0.02, show: (v) => Math.round(v * 100) + '%' })),
      h('p', { class: 'hint' }, 'Fotos costumam sair um pouco mais escuras no papel: um brilho de 105–110% ajuda.'),
    ) : null,
    geometry(el),
    elementActions(),
  );
}

// ───── vários itens selecionados ─────
function renderMultiProps(body) {
  const multi = getMulti();
  const texts = multi.filter((f) => f.el.type === 'text').map((f) => f.el);
  const photos = multi.filter((f) => f.el.type === 'photo').map((f) => f.el);
  const allPhotos = proxyAll(photos, { feather: 50, brightness: 1, contrast: 1, filter: 'none', borderWidth: 0.6 });
  const count = (t) => multi.filter((f) => f.el.type === t).length;
  const parts = [[count('text'), 'texto(s)'], [count('photo'), 'foto(s)'], [count('deco'), 'enfeite(s)']].filter(([n]) => n).map(([n, l]) => `${n} ${l}`);
  const alignBtn = (mode, ic, title) => h('button', { class: 'abtn', title, onClick: () => alignSelected(mode) }, icon(ic));

  // objeto "procurador": mudar aqui muda todos os textos selecionados
  const allTexts = {
    get font() { return texts[0]?.font; },
    set font(v) {
      for (const el of texts) {
        el.font = v;
        const ws = fontWeights(v);
        if (!ws.includes(el.weight)) el.weight = ws.reduce((a, b) => (Math.abs(b - el.weight) < Math.abs(a - el.weight) ? b : a), ws[0]);
        if (!fontHasItalic(v)) el.italic = false;
      }
    },
    get color() { return texts[0]?.color; },
    set color(v) { for (const el of texts) el.color = v; },
  };
  const bump = (d) => { for (const el of texts) el.size = Math.max(4, Math.round((el.size + d) * 10) / 10); commit(); };

  appendAll(body,
    header(isOneGroup(multi.map((f) => f.el)) ? `Grupo · ${multi.length} itens` : `${multi.length} itens selecionados`, parts.join(' · ')),
    section('Agrupar', groupActions(multi.map((f) => f.el)),
      h('p', { class: 'hint' }, isOneGroup(multi.map((f) => f.el))
        ? 'Os itens se movem juntos. Para mexer num item só, dê duplo clique nele.'
        : 'Agrupe para mover, copiar e alinhar estes itens sempre juntos (Ctrl+G).')),
    section('Alinhar entre si',
      h('div', { class: 'align-row' },
        alignBtn('left', 'alignL', 'Alinhar à esquerda'),
        alignBtn('center', 'alignC', 'Centralizar na horizontal'),
        alignBtn('right', 'alignR', 'Alinhar à direita'),
        h('span', { class: 'sep' }),
        alignBtn('top', 'vTop', 'Alinhar no topo'),
        alignBtn('middle', 'vMid', 'Centralizar na vertical'),
        alignBtn('bottom', 'vBot', 'Alinhar na base'),
      ),
      multi.length >= 3 ? h('div', { class: 'actions' },
        btn('Distribuir na horizontal', { onClick: () => alignSelected('dist-h'), title: 'Deixa o mesmo espaço entre os itens, da esquerda para a direita' }),
        btn('Distribuir na vertical', { onClick: () => alignSelected('dist-v'), title: 'Deixa o mesmo espaço entre os itens, de cima para baixo' }),
      ) : null,
    ),
    texts.length ? section(`Textos selecionados (${texts.length})`,
      field('Fonte', selectInput(allTexts, 'font',
        ['Clássicas', 'Manuscritas', 'Modernas'].map((g) => ({
          group: g, items: FONTS.filter((f) => f.group === g).map((f) => [f.family, f.family, `font-family:"${f.family}";font-size:15px`]),
        })))),
      h('div', { class: 'actions' },
        btn('Diminuir letra', { icon: 'minus', onClick: () => bump(-0.5) }),
        btn('Aumentar letra', { icon: 'plus', onClick: () => bump(0.5) })),
      colorInput(allTexts, 'color'),
    ) : null,
    photos.length ? section(`Fotos selecionadas (${photos.length})`,
      field('Moldura', selectInput(allPhotos, 'frame', FRAMES.map((f) => [f.id, f.name]), (v) => {
        if (PAPER_FRAMES.includes(v)) for (const p of photos) p.shadow = true;
        setTimeout(renderRight, 0); // mostra as opções da moldura nova
      })),
      new Set(photos.map((p) => p.frame)).size > 1 ? h('p', { class: 'hint' }, 'As fotos estão com molduras diferentes. Escolher uma aqui aplica a mesma em todas.') : null,
      photos.some((p) => isWatercolor(p.frame)) ? field('Difusão da borda', rangeInput(allPhotos, 'feather', { min: 0, max: 100, step: 1, show: featherShow })) : null,
      photos.every((p) => BORDERABLE.includes(p.frame)) ? row(
        field('Borda', selectInput(allPhotos, 'border', BORDER_OPTS)),
        field('Espessura', numInput(allPhotos, 'borderWidth', { step: 0.1, min: 0, max: 5 })),
      ) : null,
      photos.some((p) => !isWatercolor(p.frame)) ? checkInput(allPhotos, 'shadow', 'Sombra suave') : null,
      field('Filtro', selectInput(allPhotos, 'filter', FILTER_OPTS)),
      row(
        field('Brilho', rangeInput(allPhotos, 'brightness', { min: 0.6, max: 1.6, step: 0.02, show: pct })),
        field('Contraste', rangeInput(allPhotos, 'contrast', { min: 0.6, max: 1.6, step: 0.02, show: pct })),
      ),
      h('p', { class: 'hint' }, 'Tudo aqui muda as fotos selecionadas de uma vez.'),
    ) : null,
    section(null,
      h('p', { class: 'hint' }, 'Arraste qualquer item selecionado para mover todos juntos. Setas do teclado também movem o grupo. Shift + clique tira ou põe um item na seleção.'),
      clipActions(),
      h('div', { class: 'actions' },
        btn('Duplicar', { icon: 'copy', onClick: duplicateSelected, title: 'Ctrl+D' }),
        btn('Excluir', { icon: 'trash', cls: 'danger', onClick: deleteSelected, title: 'Delete' }),
      ),
      btn(`Travar os ${multi.length} itens (cadeado)`, { icon: 'lock', cls: 'block', onClick: () => lockSelected(true), title: 'Ctrl+Shift+L' })),
  );
}

// ───── enfeite ─────
function renderDecoProps(body, s) {
  const el = s.el;
  if (el.kind === 'quote' && !el.variant) el.variant = 'open';
  const d = DECOS.find((x) => x.id === el.kind);
  appendAll(body,
    header(el.kind === 'quote' ? 'Aspas' : d?.name || 'Enfeite', where(s)),
    el.kind === 'quote' ? section('Tipo', segInput(el, 'variant', [['open', null, 'Aspas de abrir', '“  Abrir'], ['close', null, 'Aspas de fechar', '”  Fechar']])) : null,
    section('Cor', colorInput(el, 'color', { gold: el.kind !== 'wash' && el.kind !== 'panel' })),
    el.kind === 'divider' ? section('Estilo', segInput(el, 'variant', [['end', null, 'Brilho no fim', '── ✦'], ['center', null, 'Brilho no meio', '─ ✦ ─'], ['plain', null, 'Só linha', '───']])) : null,
    section('Espelhar',
      row(checkInput(el, 'flipX', '↔ Horizontal'), checkInput(el, 'flipY', '↕ Vertical'))),
    geometry(el),
    elementActions(),
  );
}

// ───── página ─────
function renderPageProps(body) {
  const s = targetSlot();
  if (!s) return;
  const { page, pageIdx } = s;
  const tmpl = getTemplate(s.slot.template);
  const lockedCount = page.slots.reduce((n, sl) => n + sl.elements.filter((e) => e.locked).length, 0);
  const totalCount = page.slots.reduce((n, sl) => n + sl.elements.length, 0);
  const bgWrap = h('div', { class: 'bgs' });
  for (const b of BACKGROUNDS) {
    bgWrap.append(h('button', {
      class: 'bg' + (page.bg === b.id ? ' on' : ''), title: b.name,
      onClick: () => { page.bg = b.id; commit(); },
    }, h('span', { class: 'bg-sw' + (b.border ? ' framed' : ''), style: { background: b.swatch } }), h('small', {}, b.name)));
  }
  appendAll(body,
    header(`Página ${pageIdx + 1}`, `${pageIdx % 2 ? 'direita' : 'esquerda'} da folha ${Math.floor(pageIdx / 2) + 1}`),
    section('Cadeado da página',
      lockedCount ? h('div', { class: 'locked-note' }, icon('lock'), h('p', {}, lockedCount >= totalCount
        ? 'Página inteira travada: nada se move, nem é editado ou apagado.'
        : `${lockedCount} de ${totalCount} itens travados nesta página.`)) : null,
      h('div', { class: 'actions' },
        btn('Travar página', { icon: 'lock', cls: lockedCount < totalCount ? 'primary' : '', disabled: !totalCount || lockedCount >= totalCount, onClick: () => lockAllOnPage(page), title: 'Trava todas as fotos, textos e enfeites desta página' }),
        btn('Destravar página', { icon: 'unlock', disabled: !lockedCount, onClick: () => unlockAllOnPage(page), title: 'Destrava tudo desta página' })),
      btn('Destravar o livro inteiro', { icon: 'unlock', cls: 'block', disabled: !lockedInBook(), onClick: unlockBookUI, title: 'Destrava tudo, em todas as páginas do livro' }),
    ),
    section('Divisão da página',
      segInput({ get layout() { return page.layout; }, set layout(v) { setLayout(page, v); } }, 'layout', [
        ['halves', null, '2 alunos por página (um em cima, um embaixo)', '2 alunos'],
        ['full', null, 'Página inteira (capa, turma, professores…)', 'Página inteira'],
      ]),
      page.layout === 'halves' ? checkInput(page, 'divider', 'Linha dourada entre os dois alunos') : null,
    ),
    section(page.layout === 'halves' ? (s.slotIdx ? 'Aluno de baixo' : 'Aluno de cima') : 'Modelo da página',
      h('p', { class: 'muted' }, 'Modelo: ', h('b', {}, tmpl.name)),
      h('div', { class: 'actions' },
        btn('Trocar modelo', { icon: 'grid', cls: 'primary', onClick: () => { rightTab = 'templates'; renderRight(); } }),
        btn('Limpar fotos', { icon: 'trash', onClick: () => { s.slot.elements.forEach((e) => { if (e.type === 'photo' && !e.locked) e.src = null; }); commit(); } }),
      ),
      h('div', { class: 'actions' },
        btn(page.layout === 'halves' ? 'Copiar aluno' : 'Copiar página', {
          icon: 'copy', title: 'Copia foto, textos e enfeites. Depois clique em outra página e cole (Ctrl+V).',
          onClick: () => { if (!state.sel) select({ pageId: page.id, slot: s.slotIdx, elId: null }); copySelected({ whole: true }); },
        }),
        btn('Colar aqui', {
          icon: 'plus', disabled: !clipboardInfo(), title: 'Ctrl+V',
          onClick: () => { if (!state.sel) select({ pageId: page.id, slot: s.slotIdx, elId: null }); pasteClipboard(); },
        })),
      btn('Salvar como modelo', { icon: 'save', cls: 'block', onClick: openSaveTemplateDialog, title: 'Guarda este layout para usar em outras páginas' }),
      h('div', { class: 'actions' },
        btn('Texto', { icon: 'text', onClick: addText }),
        btn('Foto', { icon: 'image', onClick: addPhoto })),
    ),
    page.layout === 'halves' ? section('Ordem dos alunos / professores',
      h('p', { class: 'muted' }, `Este bloco é o ${blockIndex(page.id, s.slotIdx) + 1}º de ${blockList().length}. Subir e descer trocam de lugar com o vizinho, inclusive passando para outra página.`),
      h('div', { class: 'actions' },
        btn('Subir', { icon: 'up', onClick: () => moveBlockUI(page.id, s.slotIdx, -1), title: 'Alt+↑' }),
        btn('Descer', { icon: 'down', onClick: () => moveBlockUI(page.id, s.slotIdx, 1), title: 'Alt+↓' })),
      btn('Organizar a ordem de todos…', { icon: 'grid', cls: 'block', onClick: openBlockOrder, title: 'Lista com todos os blocos do livro: arraste para mudar a ordem' }),
      btn('Apagar bloco', { icon: 'trash', cls: 'danger block', onClick: () => deleteBlockUI(page.id, s.slotIdx), title: 'Apaga este aluno/professor (pergunta antes) · tecla Delete' }),
    ) : null,
    section('Fundo da página', bgWrap),
    section('Página',
      h('p', { class: 'muted' }, `É a página ${pageIdx + 1} de ${state.book.pages.length}. Mover anda uma casa: da direita para a esquerda da mesma folha, depois para a folha anterior (e quem estava lá desce).`),
      h('div', { class: 'actions' },
        btn('Mover para trás', { icon: 'left', onClick: () => movePageUI(page.id, -1), title: 'Uma página para trás' }),
        btn('Mover para frente', { icon: 'right', onClick: () => movePageUI(page.id, 1), title: 'Uma página para frente' }),
      ),
      btn('Organizar a ordem das páginas…', { icon: 'grid', cls: 'block', onClick: openPageOrder, title: 'Lista com todas as páginas: arraste para mudar a ordem' }),
      h('div', { class: 'actions' },
        btn('Duplicar', { icon: 'copy', onClick: () => duplicatePage(pageIndex(page.id)) }),
        btn('Inserir depois', { icon: 'plus', onClick: () => insertPageAfter(pageIndex(page.id)) }),
        btn('Excluir', { icon: 'trash', cls: 'danger', onClick: async () => {
          const i = pageIndex(page.id);
          if (await confirmBox('Excluir página', `Excluir a página ${i + 1}? As páginas seguintes sobem uma posição.`, 'Excluir', true)) deletePage(i);
        } }),
      ),
    ),
    section('Como usar',
      h('ul', { class: 'tips' },
        h('li', {}, 'Clique numa metade da página e escolha um modelo na aba ', h('b', {}, 'Modelos'), '.'),
        h('li', {}, 'Duplo clique num espaço de foto para inserir a foto do aluno (ou arraste o arquivo).'),
        h('li', {}, 'Duplo clique num texto para editar. Arraste para mover; use as alças para redimensionar e girar.'),
        h('li', {}, 'Use ', h('b', {}, 'Alunos em lote'), ' para inserir a turma inteira de uma vez.'),
      )),
  );
}

// ───── modelos ─────
const templateThumbs = new Map();

function buildTemplateThumbs() {
  const list = [...TEMPLATES];
  const dpr = window.devicePixelRatio || 1;
  const step = () => {
    const t = list.shift();
    if (!t) return;
    const half = t.size === 'half';
    const s = (half ? 1.15 : 0.82) * dpr;
    const page = { id: 'thumb-' + t.id, layout: 'full', bg: t.bg || 'aquarela', divider: false, slots: [instantiate(t.id)] };
    const c = document.createElement('canvas');
    c.width = Math.round(PAGE_W * s);
    c.height = Math.round((half ? HALF_H : PAGE_H) * s);
    const ctx = c.getContext('2d');
    ctx.scale(s, s);
    renderPage(ctx, page, 'left', { s, cache: false });
    templateThumbs.set(t.id, c);
    document.querySelectorAll(`canvas[data-tpl="${t.id}"]`).forEach((dst) => {
      dst.width = c.width; dst.height = c.height; dst.getContext('2d').drawImage(c, 0, 0);
    });
    setTimeout(step, 0);
  };
  setTimeout(step, 30);
}

// miniatura de um modelo salvo pelo usuário (refeita só quando o modelo muda)
const customThumbs = new Map();
function customThumb(tp) {
  const raw = (state.book.customTemplates || []).find((x) => x.id === tp.id);
  const key = tp.id + '|' + JSON.stringify(raw);
  let c = customThumbs.get(key);
  if (!c) {
    const half = tp.size === 'half';
    const s = (half ? 1.15 : 0.82) * (window.devicePixelRatio || 1);
    const page = { id: 'thumb-' + tp.id, layout: 'full', bg: tp.bg || 'aquarela', divider: false, slots: [instantiate(tp.id)] };
    c = document.createElement('canvas');
    c.width = Math.round(PAGE_W * s);
    c.height = Math.round((half ? HALF_H : PAGE_H) * s);
    const ctx = c.getContext('2d');
    ctx.scale(s, s);
    renderPage(ctx, page, 'left', { s, cache: false });
    customThumbs.set(key, c);
  }
  return c;
}

export function openSaveTemplateDialog() {
  const t = targetSlot();
  if (!t) return;
  const n = (state.book.customTemplates || []).length + 1;
  const name = h('input', { value: `Meu modelo ${n}`, class: 'text-input' });
  const keepTexts = h('input', { type: 'checkbox' });
  const keepPhotos = h('input', { type: 'checkbox' });
  const what = t.page.layout === 'halves' ? (t.slotIdx ? 'o aluno de baixo' : 'o aluno de cima') : 'a página inteira';
  const dlg = modal('Salvar como modelo', h('div', { class: 'save-tpl' },
    h('p', { class: 'muted' }, `Salva o layout atual (${what} da página ${t.pageIdx + 1}) como um modelo novo: posições, tamanhos, fontes, cores, molduras e enfeites. Ele aparece em "Meus modelos", na aba Modelos.`),
    h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Nome do modelo'), name),
    h('label', { class: 'check' }, keepTexts, h('span', {}, 'Manter o nome e a mensagem do aluno (senão ficam os textos de exemplo)')),
    h('label', { class: 'check' }, keepPhotos, h('span', {}, 'Manter as fotos (senão os espaços de foto ficam vazios)')),
  ), [
    { label: 'Cancelar', onClick: (close) => close() },
    { label: 'Salvar modelo', primary: true, icon: 'save', onClick: (close) => {
      const tpl = saveSlotAsTemplate(t, name.value.trim(), { keepTexts: keepTexts.checked, keepPhotos: keepPhotos.checked });
      close();
      rightTab = 'templates';
      renderRight();
      rightEl.querySelector('.right-body').scrollTop = 0;
      toast(`Modelo "${tpl.name}" salvo em Meus modelos.`, 'ok');
    } },
  ]);
  setTimeout(() => { name.focus(); name.select(); }, 30);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') dlg.foot.querySelector('.btn.primary').click(); });
}

function renameTemplateDialog(tp) {
  const name = h('input', { value: tp.name, class: 'text-input' });
  const dlg = modal('Renomear modelo', h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Nome do modelo'), name), [
    { label: 'Cancelar', onClick: (close) => close() },
    { label: 'Salvar', primary: true, onClick: (close) => { renameCustomTemplate(tp.id, name.value.trim()); close(); } },
  ]);
  setTimeout(() => { name.focus(); name.select(); }, 30);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') dlg.foot.querySelector('.btn.primary').click(); });
}

function renderTemplates(body) {
  const t = targetSlot();
  const target = t ? `Página ${t.pageIdx + 1}${t.page.layout === 'halves' ? (t.slotIdx ? ' · aluno de baixo' : ' · aluno de cima') : ' · página inteira'}` : '—';
  body.append(h('div', { class: 'target' }, 'Aplicar em: ', h('b', {}, target), h('small', {}, 'Clique numa metade da página para mudar o destino. Fotos e textos já inseridos são mantidos.')));

  // Meus modelos
  const mine = customTemplates();
  const myGrid = h('div', { class: 'tpl-grid' });
  for (const tp of mine) {
    const src = customThumb(tp);
    const c = h('canvas');
    c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
    const current = t && t.slot.template === tp.id;
    myGrid.append(h('div', {
      class: 'tpl mine' + (tp.size === 'full' ? ' full' : '') + (current ? ' on' : ''), title: tp.name, role: 'button', tabindex: 0,
      onClick: () => { const tt = targetSlot(); if (tt) applyTemplate(tt, tp.id); },
    }, c,
    h('span', { class: 'tpl-name' }, tp.name),
    h('span', { class: 'tpl-tag' }, tp.size === 'full' ? 'Página inteira' : 'Meia página'),
    h('span', { class: 'tpl-tools' },
      miniBtn('text', 'Renomear', () => renameTemplateDialog(tp)),
      miniBtn('trash', 'Excluir modelo', async () => {
        if (await confirmBox('Excluir modelo', `Excluir o modelo "${tp.name}"? As páginas que já usam esse layout não mudam.`, 'Excluir', true)) deleteCustomTemplate(tp.id);
      })),
    ));
  }
  body.append(h('div', { class: 'tpl-section' },
    h('h4', {}, 'Meus modelos', h('small', {}, mine.length ? 'modelos que você salvou' : 'monte uma página do seu jeito e salve para reutilizar')),
    btn('Salvar a seleção atual como modelo', { icon: 'save', cls: 'block', onClick: openSaveTemplateDialog }),
    mine.length ? myGrid : null,
  ));

  for (const [size, title, sub] of [['half', 'Alunos · meia página', '2 por página · 4 por folha A4'], ['full', 'Página inteira', 'capa, turma, professores, homenagens…']]) {
    const grid = h('div', { class: 'tpl-grid' + (size === 'full' ? ' full' : '') });
    for (const tp of TEMPLATES.filter((x) => x.size === size)) {
      const c = h('canvas', { 'data-tpl': tp.id });
      const src = templateThumbs.get(tp.id);
      if (src) { c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); }
      const current = t && t.slot.template === tp.id;
      grid.append(h('button', {
        class: 'tpl' + (current ? ' on' : ''), title: tp.name,
        onClick: () => { const tt = targetSlot(); if (tt) applyTemplate(tt, tp.id); },
      }, c, h('span', { class: 'tpl-name' }, tp.name), h('span', { class: 'tpl-tag' }, tp.style)));
    }
    body.append(h('div', { class: 'tpl-section' }, h('h4', {}, title, h('small', {}, sub)), grid));
  }
}
