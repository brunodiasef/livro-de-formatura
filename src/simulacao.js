// Simulação da impressão frente e verso, passo a passo: imprimir, virar a folha, cortar ao meio,
// juntar as metades e folhear o livro pronto. Usa as páginas reais do livro e faz o caminho
// "físico" do papel (não supõe a ordem): no fim confere se o livro montado bate com o editor.
import { state } from './state.js';
import { renderPageCanvas } from './render.js';
import { sheetsFor } from './export.js';
import { h, sleep } from './util.js';
import { modal } from './ui-kit.js';

const STEPS = ['Imprimir', 'Cortar', 'Juntar', 'Folhear o livro'];

// Monta o caminho do papel a partir das folhas que o PDF vai ter
export function simulate(N, imposition, flip) {
  const pages = Array.from({ length: N }, (_, i) => ({ i }));
  const sides = sheetsFor(pages, imposition, true, flip);
  const num = (it) => (it.page != null && it.idx < N ? it.idx : null); // índice da página ou null (em branco)
  const sheets = [];
  for (let s = 0; s < sides.length / 2; s++) {
    const front = sides[2 * s].map(num), back = sides[2 * s + 1].map(num);
    // o que fica atrás de cada metade da frente, depois que a impressora vira a folha
    const behind = flip === 'longa' ? [back[0], back[1]] : [back[1], back[0]];
    sheets.push({ front, back, pieces: [0, 1].map((k) => ({ sheet: s, half: k, front: front[k], back: behind[k] })) });
  }
  const left = sheets.map((s) => s.pieces[0]), right = sheets.map((s) => s.pieces[1]);
  let stack = imposition === 'empilhar' ? [...left, ...right] : sheets.flatMap((s) => s.pieces);
  const spare = stack.filter((p) => p.front == null && p.back == null).length; // metades que sobram em branco
  stack = stack.filter((p) => p.front != null || p.back != null);
  const read = stack.flatMap((p) => [p.front, p.back]);
  const wrong = [];
  for (let i = 0; i < N; i++) if (read[i] !== i) wrong.push(i);
  return { sheets, left, right, stack, read, spare, ok: !wrong.length, wrong };
}

// página sem nada que apareça na impressão (só caixas de exemplo ou vazias)
const isEmpty = (p) => !p.slots.some((s) => s.elements.some((e) => e.type !== 'text' || ((e.text || '').trim() && !/^Digite o texto aqui$/i.test(e.text.trim()))));

export function openDuplexSimulator(opts, onChange) {
  const pages = state.book.pages;
  const N = pages.length;
  const thumbs = new Array(N).fill(null);
  let step = 0, sim, closed = false;

  const root = h('div', { class: 'sim' });
  const controls = h('div', { class: 'sim-controls' });
  const tabs = h('div', { class: 'sim-tabs' });
  const view = h('div', { class: 'sim-view' });
  root.append(h('div', { class: 'sim-head' }, controls, tabs), view);

  const seg = (title, key, choices) => h('div', { class: 'sim-seg' },
    h('small', {}, title),
    h('div', { class: 'seg' }, choices.map(([v, label]) => h('button', {
      class: opts[key] === v ? 'on' : '',
      onClick: () => { if (opts[key] === v) return; opts[key] = v; onChange?.(); build(); },
    }, label))));

  // ───── pedaços de tela ─────
  const pg = (i, cls = '') => {
    if (i == null) return h('div', { class: 'sim-pg blank ' + cls }, h('span', {}, 'em branco'));
    const img = h('img', { 'data-idx': i, alt: '' });
    if (thumbs[i]) img.src = thumbs[i];
    return h('div', { class: 'sim-pg ' + cls }, img, h('b', { class: 'n' }, String(i + 1)));
  };
  const pgName = (i) => (i == null ? 'em branco' : `pág. ${i + 1}`);
  const piece = (p, extra) => h('div', { class: 'sim-piece' }, pg(p.front),
    h('div', { class: 'sim-piece-t' },
      h('b', {}, p.front == null ? 'Frente em branco' : `Frente: pág. ${p.front + 1}`),
      h('span', {}, `Atrás: ${pgName(p.back)}`),
      extra ? h('small', {}, extra) : null));
  const fromSheet = (p) => `folha ${p.sheet + 1}, metade ${p.half ? 'direita' : 'esquerda'}`;
  const note = (...c) => h('p', { class: 'sim-note' }, ...c);

  function stepPrint() {
    const S = sim.sheets.length;
    const grid = h('div', { class: 'sim-sheets' });
    sim.sheets.forEach((s, k) => {
      const card = h('div', { class: 'sim-sheet ' + (opts.flip === 'longa' ? 'longa' : 'curta') },
        h('div', { class: 'sim-flip' },
          h('div', { class: 'sim-face front' }, pg(s.front[0]), pg(s.front[1])),
          h('div', { class: 'sim-face back' }, pg(s.back[0]), pg(s.back[1]))),
        h('div', { class: 'sim-cap' }, h('b', {}, `Folha ${k + 1}`), h('span', { class: 'side' }, 'frente')));
      card.addEventListener('click', () => {
        card.classList.toggle('flipped');
        card.querySelector('.side').textContent = card.classList.contains('flipped') ? 'verso' : 'frente';
      });
      grid.append(card);
    });
    const flipAll = h('button', { class: 'btn', onClick: () => {
      const cards = [...grid.children];
      const to = !cards.every((c) => c.classList.contains('flipped'));
      cards.forEach((c, k) => setTimeout(() => {
        c.classList.toggle('flipped', to);
        c.querySelector('.side').textContent = to ? 'verso' : 'frente';
      }, k * 60));
    } }, 'Virar todas');
    return [
      note(`A impressora imprime `, h('b', {}, `${S} folha${S > 1 ? 's' : ''} A4`), ` dos dois lados (frente e verso), virando o papel pela `,
        h('b', {}, opts.flip === 'longa' ? 'borda longa' : 'borda curta'), '. ',
        'Toque numa folha para virá-la e ver o verso, do jeito que ele sai do papel.'),
      h('div', { class: 'sim-row' }, flipAll, h('small', {}, 'Ao tirar da impressora, deixe a pilha com a folha 1 em cima e a frente virada para cima.')),
      grid,
    ];
  }

  function stepCut() {
    const list = h('div', { class: 'sim-cuts' });
    sim.sheets.forEach((s, k) => list.append(h('div', { class: 'sim-cut' },
      h('div', { class: 'sim-cut-t' }, `Folha ${k + 1}`),
      h('div', { class: 'sim-cut-row' }, piece(s.pieces[0], 'metade esquerda'), h('div', { class: 'sim-scissor', title: 'corte' }, '✂'), piece(s.pieces[1], 'metade direita')))));
    return [
      opts.imposition === 'empilhar'
        ? note('Com a pilha arrumada (folha 1 em cima), ', h('b', {}, 'corte a pilha inteira ao meio de uma vez'), ', na linha do meio. Cada metade vira uma folhinha do livro, com uma página na frente e outra atrás:')
        : note(h('b', {}, 'Corte cada folha ao meio'), ', na linha do meio. Cada metade vira uma folhinha do livro, com uma página na frente e outra atrás:'),
      list,
    ];
  }

  function stepJoin() {
    const col = (title, arr, sub) => h('div', { class: 'sim-pile' },
      h('h5', {}, title), sub ? h('small', {}, sub) : null,
      h('div', { class: 'sim-pile-list' }, arr.map((p) => piece(p, fromSheet(p)))));
    if (opts.imposition === 'empilhar') {
      const L = sim.left.filter((p) => p.front != null || p.back != null);
      const R = sim.right.filter((p) => p.front != null || p.back != null);
      return [
        note('Depois do corte ficam ', h('b', {}, 'dois montes'), '. ', h('b', {}, 'Pegue o monte da esquerda e coloque em cima do monte da direita'), ' (sem virar nada). Pronto: o livro está na ordem.'),
        h('div', { class: 'sim-piles' },
          col('Monte da esquerda', L, 'de cima para baixo'),
          h('div', { class: 'sim-arrow' }, h('span', {}, 'vai por cima do outro'), h('i', {}, '➜')),
          col('Monte da direita', R, 'de cima para baixo'),
          h('div', { class: 'sim-arrow eq' }, h('i', {}, '=')),
          col('Livro montado', sim.stack, 'de cima para baixo')),
      ];
    }
    return [
      note(h('b', {}, 'Junte as metades na ordem: '), 'esquerda da folha 1, direita da folha 1, esquerda da folha 2, direita da folha 2… sempre colocando a próxima ', h('b', {}, 'embaixo'), ' (sem virar nada).'),
      h('div', { class: 'sim-piles' }, col('Livro montado', sim.stack, 'de cima para baixo')),
    ];
  }

  function stepBook() {
    const r = sim.read;
    // livro aberto: capa sozinha à direita, depois (verso, frente seguinte)… e a última sozinha à esquerda
    const spreads = [[undefined, r[0]]];
    for (let k = 1; k < r.length; k += 2) spreads.push([r[k], k + 1 < r.length ? r[k + 1] : undefined]);
    let at = 0;
    const book = h('div', { class: 'sim-book' });
    const label = h('div', { class: 'sim-book-t' });
    const prev = h('button', { class: 'btn', onClick: () => go(at - 1) }, '◀ Voltar a página');
    const next = h('button', { class: 'btn primary', onClick: () => go(at + 1) }, 'Virar a página ▶');
    const side = (i) => (i === undefined ? h('div', { class: 'sim-pg none' }) : pg(i, 'big'));
    function go(k) {
      at = Math.max(0, Math.min(spreads.length - 1, k));
      const [a, b] = spreads[at];
      book.replaceChildren(side(a), side(b));
      book.classList.remove('turn'); void book.offsetWidth; book.classList.add('turn');
      label.textContent = at === 0 ? 'Capa (o livro fechado)' : b === undefined ? 'Contracapa (última página, por dentro)' : `Livro aberto: ${pgName(a)} | ${pgName(b)}`;
      prev.disabled = at === 0; next.disabled = at === spreads.length - 1;
    }
    go(0);
    root.onkeydown = (e) => { if (e.key === 'ArrowRight') go(at + 1); if (e.key === 'ArrowLeft') go(at - 1); };
    const lastIsBlankBack = r[r.length - 1] == null;
    const coverEmpty = isEmpty(pages[0]), backEmpty = !lastIsBlankBack && N > 1 && isEmpty(pages[N - 1]);
    return [
      sim.ok
        ? h('div', { class: 'okbox' }, `✓ Conferido: folheando o livro montado, as páginas saem na ordem 1, 2, 3… até ${N}, igual ao editor.`)
        : h('div', { class: 'warnbox' }, `Atenção: com essas opções o livro sai fora de ordem (págs. ${sim.wrong.slice(0, 8).map((i) => i + 1).join(', ')}).`),
      h('ul', { class: 'sim-facts' },
        h('li', {}, 'A pág. 1 é a capa e fica sozinha. Com o livro aberto, a página par fica à esquerda e a ímpar à direita (2 | 3, 4 | 5…). Por isso a página seguinte de uma folhinha fica sempre atrás dela.'),
        coverEmpty ? h('li', { class: 'alert' }, h('b', {}, 'A pág. 1 está vazia'), ' e ela é o lado de fora do livro (a capa): quem pegar o livro fechado vê uma página em branco. Para a capa aparecer por fora, ela precisa ser a pág. 1.') : null,
        backEmpty ? h('li', { class: 'alert' }, h('b', {}, `A pág. ${N} está vazia`), ' e ela é o lado de fora da contracapa.') : null,
        lastIsBlankBack ? h('li', {}, `O livro tem ${N} páginas (número ímpar): a pág. ${N} é a última e o verso dela sai em branco (é o lado de fora da contracapa).`) : null,
        sim.spare ? h('li', {}, `Sobra${sim.spare > 1 ? 'm' : ''} ${sim.spare} metade${sim.spare > 1 ? 's' : ''} de folha em branco no fim da pilha: pode tirar.`) : null),
      h('div', { class: 'sim-book-nav' }, prev, label, next), book,
    ];
  }

  // ───── montagem ─────
  const back = h('button', { class: 'btn', onClick: () => show(step - 1) }, '◀ Passo anterior');
  const fwd = h('button', { class: 'btn primary', onClick: () => show(step + 1) }, 'Próximo passo ▶');
  function show(k) {
    step = Math.max(0, Math.min(STEPS.length - 1, k));
    [...tabs.children].forEach((t, i) => { t.classList.toggle('on', i === step); t.classList.toggle('done', i < step); });
    root.onkeydown = null;
    view.replaceChildren(...[stepPrint, stepCut, stepJoin, stepBook][step]());
    view.scrollTop = 0;
    back.disabled = step === 0;
    fwd.disabled = step === STEPS.length - 1;
  }
  function build() {
    sim = simulate(N, opts.imposition, opts.flip);
    controls.replaceChildren(
      seg('Como vai cortar', 'imposition', [['sequencial', 'Folha por folha'], ['empilhar', 'Cortar e empilhar']]),
      seg('Na impressora, virar pela', 'flip', [['curta', 'Borda curta'], ['longa', 'Borda longa']]),
    );
    tabs.replaceChildren(...STEPS.map((t, i) => h('button', { onClick: () => show(i) }, h('b', {}, String(i + 1)), t)));
    show(step);
  }
  build();
  root.tabIndex = -1;

  const dlg = modal('Simulação da impressão frente e verso', root, [], { wide: true, onClose: () => { closed = true; } });
  dlg.box.classList.add('sim-modal');
  dlg.box.append(h('div', { class: 'modal-foot sim-foot' }, back, fwd));
  root.focus();

  // miniaturas: uma página por vez, sem travar a tela
  (async () => {
    const px = Math.min(2.4, 1.3 * (window.devicePixelRatio || 1));
    for (let i = 0; i < N && !closed; i++) {
      await sleep(0);
      try {
        const c = renderPageCanvas(pages[i], i % 2 ? 'right' : 'left', px, { print: true, cache: false });
        thumbs[i] = c.toDataURL('image/jpeg', 0.85);
        c.width = c.height = 0;
        root.querySelectorAll(`img[data-idx="${i}"]`).forEach((img) => { img.src = thumbs[i]; });
      } catch (err) { console.error(err); }
    }
  })();
}
