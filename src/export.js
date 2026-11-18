// Exportação para impressão: PDF A4 paisagem (2 páginas por folha, linha de corte no meio),
// PDF A5 (uma página por folha, para gráfica) ou PNG da folha aberta. Tudo a 300 DPI.
import { jsPDF } from 'jspdf';
import { state, spreadPages, commit } from './state.js';
import { renderPage, layoutText, photoDpi } from './render.js';
import { PAGE_W, PAGE_H, SHEET_W, SHEET_H, DPI_MIN } from './constants.js';
import { h, download, sleep } from './util.js';
import { modal, toast } from './ui-kit.js';

function sheetsFor(pages, imposition) {
  const N = pages.length;
  if (imposition === 'empilhar') {
    const S = Math.ceil(N / 2);
    return Array.from({ length: S }, (_, i) => [{ page: pages[i], idx: i }, { page: pages[i + S] || null, idx: i + S }]);
  }
  return Array.from({ length: Math.ceil(N / 2) }, (_, i) => [{ page: pages[2 * i], idx: 2 * i }, { page: pages[2 * i + 1] || null, idx: 2 * i + 1 }]);
}

function sheetCanvas(L, R, pxmm) {
  const c = document.createElement('canvas');
  c.width = Math.round(SHEET_W * pxmm);
  c.height = Math.round(SHEET_H * pxmm);
  const ctx = c.getContext('2d');
  ctx.scale(pxmm, pxmm);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);
  const o = { s: pxmm, print: true, cache: false };
  [L, R].forEach((it, i) => {
    if (!it?.page) return;
    ctx.save();
    ctx.translate(i * PAGE_W, 0);
    renderPage(ctx, it.page, it.idx % 2 ? 'right' : 'left', o);
    ctx.restore();
  });
  return c;
}

function pageCanvas(page, idx, pxmm) {
  const c = document.createElement('canvas');
  c.width = Math.round(PAGE_W * pxmm);
  c.height = Math.round(PAGE_H * pxmm);
  const ctx = c.getContext('2d');
  ctx.scale(pxmm, pxmm);
  renderPage(ctx, page, idx % 2 ? 'right' : 'left', { s: pxmm, print: true, cache: false });
  return c;
}

const toJpeg = async (c) => new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.93))).arrayBuffer());

function collectIssues() {
  const ctx = document.createElement('canvas').getContext('2d');
  const out = { empty: [], lowres: [], overflow: [], sample: [] };
  state.book.pages.forEach((p, pi) => p.slots.forEach((s, si) => {
    const where = `pág. ${pi + 1}${p.layout === 'halves' ? (si ? ' (baixo)' : ' (cima)') : ''}`;
    for (const el of s.elements) {
      if (el.type === 'photo') {
        if (!el.src) out.empty.push(where);
        else { const d = photoDpi(el); if (d && d < DPI_MIN) out.lowres.push(`${where} — ${d} DPI`); }
      } else if (el.type === 'text') {
        if (layoutText(ctx, el, 8).overflow) out.overflow.push(where);
        if (/^Nome do Aluno$|Escreva aqui a mensagem|^Nome do Professor$|^Nome do aluno \d+/m.test(el.text)) out.sample.push(where);
      }
    }
  }));
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])];
  return out;
}

export function openExportDialog() {
  const st = state.book.settings || (state.book.settings = {});
  const opts = { format: 'a4', imposition: st.imposition || 'sequencial', marks: st.marks || 'marcas', dpi: st.dpi || 300 };
  const issues = collectIssues();

  const radio = (name, value, label, desc) => {
    const r = h('input', { type: 'radio', name, value });
    r.checked = opts[name] === value;
    r.addEventListener('change', () => { opts[name] = value; refresh(); });
    return h('label', { class: 'opt' }, r, h('div', {}, h('b', {}, label), desc ? h('small', {}, desc) : null));
  };

  const N = state.book.pages.length;
  const impoBox = h('div', { class: 'opt-group' });
  const marksBox = h('div', { class: 'opt-group' });
  const refresh = () => {
    impoBox.style.display = opts.format === 'a4' ? '' : 'none';
    marksBox.style.display = opts.format === 'a4' ? '' : 'none';
  };

  const warn = [];
  if (issues.empty.length) warn.push(h('li', {}, h('b', {}, `${issues.empty.length} espaço(s) de foto vazio(s)`), ' — sairão em branco: ', issues.empty.slice(0, 8).join(', '), issues.empty.length > 8 ? '…' : ''));
  if (issues.lowres.length) warn.push(h('li', {}, h('b', {}, 'Fotos com resolução baixa'), ' — podem sair borradas: ', issues.lowres.slice(0, 6).join('; ')));
  if (issues.overflow.length) warn.push(h('li', {}, h('b', {}, 'Textos que não cabem'), ' (serão cortados): ', issues.overflow.join(', ')));
  if (issues.sample.length) warn.push(h('li', {}, h('b', {}, 'Textos de exemplo ainda não trocados'), ': ', issues.sample.slice(0, 8).join(', '), issues.sample.length > 8 ? '…' : ''));

  const progress = h('div', { class: 'progress hidden' }, h('div', { class: 'bar' }), h('span', {}, ''));

  const body = h('div', { class: 'export' },
    h('div', { class: 'opt-group' },
      h('h4', {}, 'Formato'),
      radio('format', 'a4', `PDF A4 paisagem — ${Math.ceil(N / 2)} folha(s)`, 'Para imprimir em casa ou na copiadora e cortar ao meio. 2 páginas por folha.'),
      radio('format', 'a5', `PDF A5 — ${N} página(s) separadas`, 'Para enviar a uma gráfica que imprime e encaderna.'),
      radio('format', 'png', 'PNG da folha aberta no editor', 'Imagem em alta resolução para conferir ou mandar por WhatsApp.'),
    ),
    impoBox,
    marksBox,
    h('div', { class: 'opt-group' },
      h('h4', {}, 'Resolução'),
      radio('dpi', 300, '300 DPI (recomendado para impressão)'),
      radio('dpi', 200, '200 DPI (arquivo menor, rascunho)'),
    ),
    warn.length ? h('div', { class: 'warnbox' }, h('h4', {}, 'Antes de imprimir, confira:'), h('ul', {}, warn)) : h('div', { class: 'okbox' }, '✓ Tudo certo: todas as fotos estão preenchidas e os textos cabem.'),
    h('div', { class: 'printtips' },
      h('b', {}, 'Na hora de imprimir: '),
      'escolha papel A4, orientação paisagem e escala ', h('b', {}, '"Tamanho real / 100%"'), ' (não use "Ajustar à página"). ',
      'Papel fotográfico ou couché 170–250 g dá o melhor resultado. A área de 4–5 mm da borda pode ficar branca em impressoras comuns — por isso textos e rostos ficam dentro das margens de segurança.'),
    progress,
  );
  impoBox.append(
    h('h4', {}, 'Ordem das páginas nas folhas'),
    radio('imposition', 'sequencial', 'Sequencial (folha 1 = págs. 1–2, folha 2 = págs. 3–4…)', 'Depois de cortar, junte as metades na ordem: esquerda, direita, esquerda, direita…'),
    radio('imposition', 'empilhar', 'Cortar e empilhar (mais prático com guilhotina)', `Corte a pilha inteira de uma vez: a pilha da esquerda tem as págs. 1–${Math.ceil(N / 2)} e a da direita as demais. Basta colocar a pilha da direita embaixo da esquerda.`),
  );
  marksBox.append(
    h('h4', {}, 'Marca de corte no meio da folha'),
    radio('marks', 'marcas', 'Marcas pequenas no topo e na base'),
    radio('marks', 'linha', 'Linha tracejada fina de cima a baixo'),
    radio('marks', 'nenhuma', 'Sem marcas'),
  );
  refresh();

  let busy = false;
  const dlg = modal('Exportar para impressão', body, [
    { label: 'Cancelar', onClick: (close) => { if (!busy) close(); } },
    { label: 'Exportar', primary: true, icon: 'download', onClick: async () => {
      if (busy) return;
      busy = true;
      Object.assign(st, { imposition: opts.imposition, marks: opts.marks, dpi: opts.dpi });
      commit();
      progress.classList.remove('hidden');
      dlg.foot.querySelectorAll('button').forEach((b) => (b.disabled = true));
      try {
        await runExport(opts, (k, n, label) => {
          progress.querySelector('.bar').style.width = Math.round((k / n) * 100) + '%';
          progress.querySelector('span').textContent = label;
        });
        toast('Arquivo exportado! Veja a pasta Downloads.', 'ok');
        dlg.close();
      } catch (err) {
        console.error(err);
        toast('Erro ao exportar: ' + (err?.message || err), 'error', 8000);
        dlg.foot.querySelectorAll('button').forEach((b) => (b.disabled = false));
      } finally { busy = false; }
    } },
  ], { wide: true });
}

const slug = (s) => (s || 'livro').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

async function runExport(opts, onProgress) {
  const pxmm = opts.dpi / 25.4;
  const pages = state.book.pages;
  const name = slug(state.book.title);

  if (opts.format === 'png') {
    const i = state.spread;
    onProgress(0, 1, 'Gerando imagem…');
    await sleep(30);
    const [L, R] = spreadPages();
    const c = sheetCanvas({ page: L, idx: i * 2 }, { page: R, idx: i * 2 + 1 }, pxmm);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    download(blob, `${name}-folha-${i + 1}.png`);
    onProgress(1, 1, 'Pronto');
    return;
  }

  if (opts.format === 'a5') {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [PAGE_W, PAGE_H], compress: true });
    for (let i = 0; i < pages.length; i++) {
      onProgress(i, pages.length, `Página ${i + 1} de ${pages.length}…`);
      await sleep(20);
      const c = pageCanvas(pages[i], i, pxmm);
      if (i > 0) pdf.addPage([PAGE_W, PAGE_H], 'portrait');
      pdf.addImage(await toJpeg(c), 'JPEG', 0, 0, PAGE_W, PAGE_H, undefined, 'NONE');
      c.width = c.height = 0;
    }
    onProgress(1, 1, 'Salvando PDF…');
    download(pdf.output('blob'), `${name}-A5.pdf`);
    return;
  }

  const sheets = sheetsFor(pages, opts.imposition);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  for (let i = 0; i < sheets.length; i++) {
    onProgress(i, sheets.length, `Folha ${i + 1} de ${sheets.length}…`);
    await sleep(20);
    const c = sheetCanvas(sheets[i][0], sheets[i][1], pxmm);
    if (i > 0) pdf.addPage('a4', 'landscape');
    pdf.addImage(await toJpeg(c), 'JPEG', 0, 0, SHEET_W, SHEET_H, undefined, 'NONE');
    c.width = c.height = 0;
    if (opts.marks === 'marcas') {
      pdf.setDrawColor(70, 70, 70); pdf.setLineWidth(0.2);
      pdf.line(PAGE_W, 0, PAGE_W, 8);
      pdf.line(PAGE_W, SHEET_H - 8, PAGE_W, SHEET_H);
    } else if (opts.marks === 'linha') {
      pdf.setDrawColor(150, 150, 150); pdf.setLineWidth(0.12);
      pdf.setLineDashPattern([1.5, 1.5], 0);
      pdf.line(PAGE_W, 0, PAGE_W, SHEET_H);
      pdf.setLineDashPattern([], 0);
    }
  }
  onProgress(1, 1, 'Salvando PDF…');
  download(pdf.output('blob'), `${name}-A4-${opts.imposition}.pdf`);
}
