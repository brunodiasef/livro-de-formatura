// Interface: barra superior, lista de folhas (esquerda), modelos e propriedades (direita).
import {
  state, on, emit, commit, commitLater, getSel, select, spreadCount, spreadPages, pageIndex, targetSlot,
  addSpread, duplicateSpread, deleteSpread, moveSpread, duplicatePage, deletePage, movePage, insertPageAfter,
  setLayout, applyTemplate, undo, redo, canUndo, canRedo, newPage,
} from './state.js';
import { TEMPLATES, getTemplate, T, P, D, BODY, instantiate } from './templates.js';
import { renderPage, renderSheetCanvas, layoutText, photoDpi } from './render.js';
import { initEditor, requestRender, pickPhoto, deleteSelected, duplicateSelected, reorderSelected, setZoom, getZoom } from './editor.js';
import { FONTS, fontWeights, fontHasItalic, WEIGHT_NAMES } from './fonts.js';
import { BACKGROUNDS, FRAMES, DECOS, SWATCHES, PAGE_W, PAGE_H, HALF_H, DPI_MIN, DPI_GOOD } from './constants.js';
import { h, uid, randSeed, debounce, clone } from './util.js';
import { btn, icon, toast, modal, confirmBox } from './ui-kit.js';
import { openExportDialog } from './export.js';
import { openBatchDialog } from './batch.js';
import { newProject, saveProjectFile, openProjectFile } from './project.js';

let rightTab = 'templates';
let rightEl, leftList, leftStats, undoBtn, redoBtn, saveStatus, titleInput, zoomLabel;

export function initUI(root) {
  root.innerHTML = '';
  const left = h('aside', { class: 'left' });
  const center = h('main', { class: 'center' });
  const right = h('aside', { class: 'right' });
  root.append(buildTopbar(), h('div', { class: 'body' }, left, center, right));
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
    } else if (type === 'select') {
      refreshLeft();
      const s = getSel();
      if (s?.el) rightTab = 'edit';
      renderRight();
    } else if (type === 'live') {
      syncInputs();
    } else if (type === 'focus-text') {
      rightTab = 'edit';
      renderRight();
      const ta = rightEl.querySelector('textarea');
      if (ta) { ta.focus(); ta.select(); }
    } else if (type === 'saved') {
      refreshTop();
    } else if (type === 'view') {
      zoomLabel.textContent = Math.round((getZoom() / 3.78) * 100) + '%';
    }
  });
  refreshLeft();
  refreshTop();
}

// ───────── barra superior ─────────
function menu(anchor, items) {
  document.querySelector('.menu')?.remove();
  const m = h('div', { class: 'menu' });
  for (const it of items) {
    if (it === '-') { m.append(h('div', { class: 'menu-sep' })); continue; }
    m.append(h('button', { class: 'menu-item', onClick: () => { m.remove(); it.onClick(); } }, it.icon ? icon(it.icon) : null, h('span', {}, it.label)));
  }
  const r = anchor.getBoundingClientRect();
  m.style.left = r.left + 'px';
  m.style.top = r.bottom + 6 + 'px';
  document.body.append(m);
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
  decoBtn.addEventListener('click', () => menu(decoBtn, DECOS.map((d) => ({ label: d.name, onClick: () => addDeco(d.id) }))));
  const projBtn = btn('Projeto', { icon: 'folder' });
  projBtn.addEventListener('click', () => menu(projBtn, [
    { label: 'Salvar cópia do projeto (.livro.json)…', icon: 'save', onClick: saveProjectFile },
    { label: 'Abrir projeto salvo…', icon: 'folder', onClick: pickProjectFile },
    '-',
    { label: 'Novo projeto (começar do zero)', icon: 'file', onClick: newProject },
  ]));
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

function pickProjectFile() {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.addEventListener('change', () => inp.files?.[0] && openProjectFile(inp.files[0]));
  inp.click();
}

function refreshTop() {
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
  saveStatus.textContent = state.saved ? '✓ Salvo' : 'Salvando…';
  saveStatus.title = 'O projeto é salvo automaticamente neste computador (no navegador). Use Projeto › Salvar cópia para ter um backup.';
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
function addDeco(kind) {
  const d = DECOS.find((x) => x.id === kind);
  addElement(D(kind, { w: d.w, h: d.h, rotation: d.rotation || 0, variant: d.variant, color: d.color || 'gold', opacity: d.opacity ?? 1 }));
}

// ───────── painel esquerdo: folhas ─────────
const thumbCache = new Map();

function buildLeft(left) {
  leftList = h('div', { class: 'spread-list' });
  leftStats = h('div', { class: 'stats' });
  left.append(
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
  const card = h('div', { class: 'spread', 'data-i': i, onClick: () => goSpread(i) },
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
  return [s.page.id, s.slotIdx, s.page.layout, s.page.bg, s.page.divider, s.slot.template, el?.id, el?.frame, el?.fit, !!el?.src, el?.font, el?.border, el?.kind, state.panMode].join('|');
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
  } else if (s?.el?.type === 'text') renderTextProps(body, s);
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

function elementActions() {
  return section(null, h('div', { class: 'actions' },
    btn('Duplicar', { icon: 'copy', onClick: duplicateSelected, title: 'Ctrl+D' }),
    btn('Frente', { icon: 'front', onClick: () => reorderSelected('top'), title: 'Trazer para frente' }),
    btn('Trás', { icon: 'back', onClick: () => reorderSelected('bottom'), title: 'Enviar para trás' }),
    btn('Excluir', { icon: 'trash', cls: 'danger', onClick: deleteSelected, title: 'Delete' }),
  ));
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
    const L = layoutText(measureCtx, el, 8);
    fitInfo.className = 'hint';
    if (L.overflow) { fitInfo.textContent = '⚠ O texto não cabe na caixa. Aumente a caixa, diminua a fonte ou ative o ajuste automático.'; fitInfo.classList.add('warn'); }
    else if (el.autoFit && L.size < el.size - 0.05) fitInfo.textContent = `Fonte reduzida automaticamente para ${fmt(L.size)} pt para caber na caixa.`;
    else fitInfo.textContent = '';
  }
  updateFitInfo();
  syncers.push(updateFitInfo);

  body.append(
    header('Texto', where(s)),
    section(null, ta, fitInfo),
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
        segInput(el, 'align', [['left', 'alignL', 'Esquerda'], ['center', 'alignC', 'Centro'], ['right', 'alignR', 'Direita']]),
        segInput(el, 'valign', [['top', 'vTop', 'Topo'], ['middle', 'vMid', 'Meio'], ['bottom', 'vBot', 'Base']]),
      ),
      field('Entre linhas', rangeInput(el, 'lineHeight', { min: 0.8, max: 2.5, step: 0.05, show: (v) => fmt(v, 2) })),
      field('Entre letras', rangeInput(el, 'tracking', { min: -50, max: 600, step: 10, show: (v) => v })),
    ),
    geometry(el),
    elementActions(),
  );
}

// ───── foto ─────
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
  const borderable = ['rect', 'rounded', 'circle', 'arch'].includes(el.frame);

  body.append(
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
      field('Estilo', selectInput(el, 'frame', FRAMES.map((f) => [f.id, f.name]))),
      field('Encaixe', selectInput(el, 'fit', [['cover', 'Preencher o quadro (corta as sobras)'], ['contain', 'Mostrar a imagem inteira (logos, brasões)']], () => { el.zoom = 1; el.panX = 0; el.panY = 0; })),
      borderable ? row(
        field('Borda', selectInput(el, 'border', [['null', 'Sem borda'], ['gold', 'Dourada'], ['#FFFFFF', 'Branca'], ['#3A2417', 'Marrom'], ['#1F1A17', 'Preta']])),
        field('Espessura', numInput(el, 'borderWidth', { step: 0.1, min: 0, max: 5 })),
      ) : null,
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

// ───── enfeite ─────
function renderDecoProps(body, s) {
  const el = s.el;
  const d = DECOS.find((x) => x.id === el.kind);
  body.append(
    header(d?.name || 'Enfeite', where(s)),
    section('Cor', colorInput(el, 'color', { gold: el.kind !== 'wash' && el.kind !== 'panel' })),
    el.kind === 'divider' ? section('Estilo', segInput(el, 'variant', [['end', null, 'Brilho no fim', '── ✦'], ['center', null, 'Brilho no meio', '─ ✦ ─'], ['plain', null, 'Só linha', '───']])) : null,
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
  const bgWrap = h('div', { class: 'bgs' });
  for (const b of BACKGROUNDS) {
    bgWrap.append(h('button', {
      class: 'bg' + (page.bg === b.id ? ' on' : ''), title: b.name,
      onClick: () => { page.bg = b.id; commit(); },
    }, h('span', { class: 'bg-sw' + (b.border ? ' framed' : ''), style: { background: b.swatch } }), h('small', {}, b.name)));
  }
  body.append(
    header(`Página ${pageIdx + 1}`, `${pageIdx % 2 ? 'direita' : 'esquerda'} da folha ${Math.floor(pageIdx / 2) + 1}`),
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
        btn('Limpar fotos', { icon: 'trash', onClick: () => { s.slot.elements.forEach((e) => { if (e.type === 'photo') e.src = null; }); commit(); } }),
      ),
      h('div', { class: 'actions' },
        btn('Texto', { icon: 'text', onClick: addText }),
        btn('Foto', { icon: 'image', onClick: addPhoto })),
    ),
    section('Fundo da página', bgWrap),
    section('Página',
      h('div', { class: 'actions' },
        btn('Duplicar', { icon: 'copy', onClick: () => duplicatePage(pageIdx) }),
        btn('Inserir depois', { icon: 'plus', onClick: () => insertPageAfter(pageIdx) }),
      ),
      h('div', { class: 'actions' },
        btn('Mover', { icon: 'left', onClick: () => movePage(pageIdx, -1), title: 'Mover para a página anterior' }),
        btn('Mover', { icon: 'right', onClick: () => movePage(pageIdx, 1), title: 'Mover para a próxima página' }),
        btn('Excluir', { icon: 'trash', cls: 'danger', onClick: async () => {
          if (await confirmBox('Excluir página', `Excluir a página ${pageIdx + 1}? As páginas seguintes sobem uma posição.`, 'Excluir', true)) deletePage(pageIdx);
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

function renderTemplates(body) {
  const t = targetSlot();
  const target = t ? `Página ${t.pageIdx + 1}${t.page.layout === 'halves' ? (t.slotIdx ? ' · aluno de baixo' : ' · aluno de cima') : ' · página inteira'}` : '—';
  body.append(h('div', { class: 'target' }, 'Aplicar em: ', h('b', {}, target), h('small', {}, 'Clique numa metade da página para mudar o destino. Fotos e textos já inseridos são mantidos.')));
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
