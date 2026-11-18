// "Alunos em lote": seleciona várias fotos de uma vez, confere nomes e textos e o app monta as páginas.
import { state, commit, newPage, emit } from './state.js';
import { TEMPLATES } from './templates.js';
import { importFile } from './images.js';
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

  const renderList = () => {
    if (opts.sort) students.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    list.innerHTML = '';
    if (!students.length) {
      list.append(h('div', { class: 'batch-empty' }, 'Nenhuma foto ainda. Clique em "Selecionar fotos" ou arraste as fotos para cá.'));
    }
    students.forEach((st, i) => {
      const name = h('input', { value: st.name, placeholder: 'Nome do aluno' });
      name.addEventListener('input', () => { st.name = name.value; });
      const text = h('textarea', { rows: 2, placeholder: 'Texto / mensagem do aluno (opcional)' });
      text.value = st.text;
      text.addEventListener('input', () => { st.text = text.value; });
      list.append(h('div', { class: 'batch-row' },
        h('span', { class: 'num' }, String(i + 1)),
        h('img', { src: st.url, alt: '' }),
        h('div', { class: 'batch-fields' }, name, text),
        h('button', { class: 'mini', title: 'Remover', onClick: () => { URL.revokeObjectURL(st.url); students.splice(i, 1); renderList(); } }, '×'),
      ));
    });
    countLbl.textContent = students.length ? `${students.length} aluno(s)` : '';
    goBtn.querySelector('span').textContent = students.length ? `Montar páginas (${students.length} alunos)` : 'Montar páginas';
  };

  const addFiles = (files) => {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      students.push({ file: f, url: URL.createObjectURL(f), name: nameFromFile(f.name), text: '' });
    }
    renderList();
  };

  const pickBtn = btn('Selecionar fotos…', { icon: 'image', cls: 'primary', onClick: () => {
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
    goBtn.querySelector('span').textContent = 'Montando…';
    try {
      const n = await fill(students, opts);
      students.forEach((s) => URL.revokeObjectURL(s.url));
      dlg.close();
      toast(`${n} aluno(s) inseridos no livro.`, 'ok');
    } catch (err) {
      console.error(err);
      toast('Erro ao montar as páginas: ' + err.message, 'error');
      goBtn.disabled = false;
    }
  } });

  const body = h('div', { class: 'batch' },
    h('div', { class: 'batch-top' },
      h('p', {}, 'Selecione as fotos de todos os alunos de uma vez. O nome é tirado do nome do arquivo (ex.: ', h('code', {}, 'ana_beatriz_souza.jpg'), ' → Ana Beatriz Souza) — confira e corrija abaixo.'),
      h('div', { class: 'actions' }, pickBtn, h('label', { class: 'check' }, sortCb, h('span', {}, 'Ordem alfabética')), countLbl),
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

async function fill(students, opts) {
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
  for (const st of students) {
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
    if (bd && st.text.trim()) bd.text = st.text.trim();
  }
  state.sel = null;
  commit();
  emit('change', { rebuild: true });
  return students.length;
}
