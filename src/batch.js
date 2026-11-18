// "Alunos em lote": seleciona várias fotos de uma vez, confere nomes e textos e o app monta as páginas.
import { state, commit, newPage, emit } from './state.js';
import { TEMPLATES } from './templates.js';
import { importFile } from './images.js';
import { layoutText } from './render.js';
import { readDocxStudents } from './docx.js';
import { h } from './util.js';
import { modal, toast, btn } from './ui-kit.js';

const LOWER = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

export function nameFromFile(fname) {
  return fname
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+[\s._-]*/, '')
    .replace(/[_.-]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function openBatchDialog() {
  let students = [];
  const halfTemplates = TEMPLATES.filter((t) => t.size === 'half');
  const opts = { top: 't01', bottom: 't02', useEmpty: true, sort: true };

  const list = h('div', { class: 'batch-list' });
  const countLbl = h('span', { class: 'muted' });

  let counter = 0;
  const renderList = () => {
    students.sort(opts.sort ? (a, b) => (a.name || '￿').localeCompare(b.name || '￿', 'pt-BR') : (a, b) => a.order - b.order);
    list.innerHTML = '';
    if (!students.length) {
      list.append(h('div', { class: 'batch-empty' }, 'Nenhum aluno ainda. Importe o arquivo do Word, selecione as fotos ou arraste os arquivos para cá.'));
    }
    students.forEach((st, i) => {
      const name = h('input', { value: st.name, placeholder: '⚠ Digite o nome do aluno' });
      const row = h('div', { class: 'batch-row' + (st.name.trim() ? '' : ' missing') });
      name.addEventListener('input', () => { st.name = name.value; row.classList.toggle('missing', !st.name.trim()); });
      const text = h('textarea', { rows: 3, placeholder: 'Texto / mensagem do aluno (opcional)' });
      text.value = st.text;
      text.addEventListener('input', () => { st.text = text.value; });
      list.append(row);
      row.append(
        h('span', { class: 'num' }, String(i + 1)),
        h('img', { src: st.url, alt: '' }),
        h('div', { class: 'batch-fields' }, name, text),
        h('button', { class: 'mini', title: 'Remover', onClick: () => { URL.revokeObjectURL(st.url); students.splice(i, 1); renderList(); } }, '×'),
      );
    });
    countLbl.textContent = students.length ? `${students.length} aluno(s)` : '';
    goBtn.querySelector('span:not(.ico)').textContent = students.length ? `Montar páginas (${students.length} alunos)` : 'Montar páginas';
  };

  const addFiles = async (files) => {
    for (const f of files) {
      if (/\.docx$/i.test(f.name)) { await addDocx(f); continue; }
      if (!f.type.startsWith('image/')) continue;
      students.push({ file: f, url: URL.createObjectURL(f), name: nameFromFile(f.name), text: '', order: counter++ });
    }
    renderList();
  };

  const addDocx = async (f) => {
    try {
      toast('Lendo o arquivo do Word…');
      const found = await readDocxStudents(f);
      if (!found.length) { toast('Não encontrei fotos de alunos neste arquivo.', 'warn'); return; }
      for (const st of found) students.push({ ...st, url: URL.createObjectURL(st.file), order: counter++ });
      // mantém a ordem do arquivo do Word
      opts.sort = false; sortCb.checked = false;
      renderList();
      const noName = found.filter((s) => !s.name).length;
      toast(`${found.length} aluno(s) encontrados no arquivo, na mesma ordem do Word.` + (noName ? ` ${noName} sem nome — preencha o nome destacado em vermelho.` : ''), noName ? 'warn' : 'ok', 7000);
    } catch (err) {
      console.error(err);
      toast('Não consegui ler o arquivo do Word: ' + err.message, 'error', 7000);
    }
  };

  const docxBtn = btn('Importar do Word (.docx)…', { icon: 'file', cls: 'primary', onClick: () => {
    const inp = h('input', { type: 'file', accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    inp.addEventListener('change', () => inp.files?.[0] && addFiles([inp.files[0]]));
    inp.click();
  } });

  const pickBtn = btn('Selecionar fotos…', { icon: 'image', onClick: () => {
    const inp = h('input', { type: 'file', accept: 'image/*', multiple: true });
    inp.addEventListener('change', () => addFiles([...inp.files]));
    inp.click();
  } });

  const sortCb = h('input', { type: 'checkbox' }); sortCb.checked = opts.sort;
  sortCb.addEventListener('change', () => { opts.sort = sortCb.checked; renderList(); });
  const emptyCb = h('input', { type: 'checkbox' }); emptyCb.checked = opts.useEmpty;
  emptyCb.addEventListener('change', () => { opts.useEmpty = emptyCb.checked; });

  const tplSel = (key) => {
    const s = h('select', {});
    for (const t of halfTemplates) s.append(h('option', { value: t.id }, t.name));
    s.value = opts[key];
    s.addEventListener('change', () => { opts[key] = s.value; });
    return s;
  };

  // colar vários textos de uma vez
  const paste = h('textarea', { rows: 5, placeholder: 'Ana Beatriz\nTexto da Ana...\n\nBruno Costa\nTexto do Bruno...' });
  const distribute = () => {
    const blocks = paste.value.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    let matched = 0, byOrder = 0;
    const used = new Set();
    for (const b of blocks) {
      const [first, ...rest] = b.split('\n');
      const body = rest.join('\n').trim();
      const n = norm(first);
      const st = students.find((s, i) => !used.has(i) && n && (norm(s.name) === n || norm(s.name).startsWith(n) || n.startsWith(norm(s.name))));
      if (st && body) { st.text = body; used.add(students.indexOf(st)); matched++; }
    }
    // blocos sem nome correspondente: distribui pela ordem
    if (!matched && blocks.length) {
      blocks.forEach((b, i) => { if (students[i]) { students[i].text = b; byOrder++; } });
    }
    renderList();
    toast(matched ? `${matched} texto(s) associados pelo nome.` : byOrder ? `${byOrder} texto(s) distribuídos pela ordem da lista.` : 'Nenhum texto encontrado.', matched || byOrder ? 'ok' : 'warn');
  };

  const goBtn = btn('Montar páginas', { icon: 'users', cls: 'primary', onClick: async () => {
    if (!students.length) { toast('Selecione as fotos primeiro.', 'warn'); return; }
    goBtn.disabled = true;
    goBtn.querySelector('span:not(.ico)').textContent = 'Montando…';
    try {
      const label = goBtn.querySelector('span:not(.ico)');
      const { n, small } = await fill(students, opts, (k, total) => { label.textContent = `Montando ${k} de ${total}…`; });
      students.forEach((s) => URL.revokeObjectURL(s.url));
      dlg.close();
      toast(`${n} aluno(s) inseridos no livro.`, 'ok');
      if (small.length) toast(`Texto longo, a letra ficou pequena (abaixo de 7 pt) para: ${small.join(', ')}. Para esses alunos, aumente a caixa de texto ou use o modelo "Mensagem de despedida".`, 'warn', 14000);
    } catch (err) {
      console.error(err);
      toast('Erro ao montar as páginas: ' + err.message, 'error');
      goBtn.disabled = false;
    }
  } });

  const body = h('div', { class: 'batch' },
    h('div', { class: 'batch-top' },
      h('p', {}, h('b', {}, 'Arquivo do Word: '), 'um aluno por página, com a foto, a mensagem e o nome embaixo — o app separa tudo sozinho. ',
        h('b', {}, 'Ou fotos soltas: '), 'o nome vem do nome do arquivo (', h('code', {}, 'ana_beatriz_souza.jpg'), ' → Ana Beatriz Souza). Confira e corrija abaixo antes de montar.'),
      h('div', { class: 'actions' }, docxBtn, pickBtn, h('label', { class: 'check' }, sortCb, h('span', {}, 'Ordem alfabética')), countLbl),
    ),
    list,
    h('details', { class: 'paste' },
      h('summary', {}, 'Colar os textos de todos os alunos de uma vez'),
      h('p', { class: 'hint' }, 'Cole os textos separados por uma linha em branco. A primeira linha de cada bloco é o nome do aluno — o app procura o aluno com esse nome na lista.'),
      paste,
      btn('Distribuir textos', { onClick: distribute }),
    ),
    h('div', { class: 'batch-opts' },
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Modelo do aluno de cima'), tplSel('top')),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Modelo do aluno de baixo'), tplSel('bottom')),
      h('label', { class: 'check' }, emptyCb, h('span', {}, 'Preencher primeiro os espaços de aluno vazios que já existem no livro')),
    ),
  );

  body.addEventListener('dragover', (e) => e.preventDefault());
  body.addEventListener('drop', (e) => { e.preventDefault(); addFiles([...(e.dataTransfer?.files || [])]); });

  const dlg = modal('Alunos em lote', body, [], { wide: true });
  dlg.box.append(h('div', { class: 'modal-foot' }, btn('Cancelar', { onClick: () => dlg.close() }), goBtn));
  renderList();
}

// Texto longo: sobe o nome e estica a caixa da mensagem até o fim do espaço do aluno,
// para a letra não ficar pequena demais.
function expandForLongText(slot, nm, bd, measure) {
  if (!nm || nm.rotation || bd.rotation || Math.abs(nm.x - bd.x) > 3) return;
  if (layoutText(measure, bd, 8).size >= 8.5) return;
  const div = slot.elements.find((e) => e.type === 'deco' && e.kind === 'divider' && Math.abs(e.x - bd.x) < 3 && e.y > bd.y);
  const bottom = 94; // limite da área segura da metade da página
  nm.y = 10;
  bd.y = nm.y + nm.h + 1.5;
  bd.h = (div ? bottom - 5 : bottom) - bd.y;
  bd.lineHeight = Math.min(bd.lineHeight || 1.5, 1.45);
  if (div) div.y = bottom - 3;
}

async function fill(students, opts, onProgress) {
  const targets = [];
  if (opts.useEmpty) {
    for (const page of state.book.pages) {
      if (page.layout !== 'halves') continue;
      for (const slot of page.slots) {
        const ph = slot.elements.find((e) => e.type === 'photo' && e.role !== 'logo');
        if (ph && !ph.src) targets.push(slot);
      }
    }
  }
  let k = 0;
  const small = [];
  const measure = document.createElement('canvas').getContext('2d');
  for (const st of students) {
    onProgress?.(k + 1, students.length);
    let slot = targets[k++];
    if (!slot) {
      const p = newPage('halves', [opts.top, opts.bottom]);
      state.book.pages.push(p);
      targets.push(...p.slots);
      slot = targets[k - 1];
    }
    const id = await importFile(st.file);
    const ph = slot.elements.find((e) => e.type === 'photo' && e.role !== 'logo');
    if (ph) Object.assign(ph, { src: id, zoom: 1, panX: 0, panY: 0 });
    const nm = slot.elements.find((e) => e.type === 'text' && e.role === 'name');
    if (nm && st.name.trim()) nm.text = st.name.trim();
    const bd = slot.elements.find((e) => e.type === 'text' && e.role === 'body');
    if (bd && st.text.trim()) {
      bd.text = st.text.trim();
      expandForLongText(slot, nm, bd, measure);
      if (layoutText(measure, bd, 8).size < 7) small.push(st.name.trim().split(' ')[0] || 'sem nome');
    }
  }
  state.sel = null;
  commit();
  emit('change', { rebuild: true });
  return { n: students.length, small };
}
