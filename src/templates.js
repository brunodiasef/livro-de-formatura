// Os 20 modelos do livro. Coordenadas em mm, relativas ao espaço do modelo:
//  - meia página (1 aluno): 148,5 x 105 mm
//  - página inteira:        148,5 x 210 mm
// Área segura usada nos modelos: ~12 mm das laterais e ~8 mm de cima/baixo de cada metade.
import { C } from './constants.js';
import { uid, randSeed, clone } from './util.js';

export const NAME = { font: 'Cormorant Garamond', weight: 600, size: 19, color: C.ink, lineHeight: 1.1 };
export const BODY = { font: 'Quicksand', weight: 400, size: 9.5, color: C.text, lineHeight: 1.6 };
const LABEL = { font: 'Montserrat', weight: 600, size: 6.8, color: C.gold, tracking: 300, uppercase: true, lineHeight: 1.2 };

const TXT_NAME = 'Nome do Aluno';
const TXT_BODY = 'Três anos de dedicação, descobertas e amizades que levaremos para a vida. Escreva aqui a mensagem do aluno.';

export const T = (o) => ({
  type: 'text', text: '', font: 'Quicksand', weight: 400, italic: false, size: 10, color: C.text,
  align: 'left', valign: 'top', lineHeight: 1.5, tracking: 0, uppercase: false,
  autoFit: true, rotation: 0, opacity: 1, ...o,
});
export const P = (o) => ({
  type: 'photo', frame: 'brush', src: null, fit: 'cover', zoom: 1, panX: 0, panY: 0,
  filter: 'none', brightness: 1, contrast: 1, border: null, borderWidth: 0.6, shadow: false,
  rotation: 0, opacity: 1, ...o,
});
export const D = (kind, o) => ({ type: 'deco', kind, color: 'gold', rotation: 0, opacity: 1, ...o });

const W = 148.5;

export const TEMPLATES = [
  // ───────────── ALUNOS (meia página) ─────────────
  {
    id: 't01', name: 'Clássico · foto à esquerda', size: 'half', style: 'Clássico',
    build: () => [
      P({ x: 14, y: 13, w: 64, h: 79 }),
      T({ ...NAME, role: 'name', text: TXT_NAME, x: 86, y: 28, w: 50, h: 14, valign: 'bottom' }),
      T({ ...BODY, role: 'body', text: TXT_BODY, x: 86, y: 44, w: 49, h: 34 }),
      D('divider', { variant: 'end', x: 86, y: 81, w: 34, h: 3 }),
    ],
  },
  {
    id: 't02', name: 'Clássico · foto à direita', size: 'half', style: 'Clássico',
    build: () => [
      P({ x: 70.5, y: 13, w: 64, h: 79 }),
      T({ ...NAME, role: 'name', text: TXT_NAME, x: 13, y: 28, w: 52, h: 14, valign: 'bottom' }),
      T({ ...BODY, role: 'body', text: TXT_BODY, x: 13, y: 44, w: 51, h: 34 }),
      D('divider', { variant: 'end', x: 13, y: 81, w: 34, h: 3 }),
    ],
  },
  {
    id: 't03', name: 'Medalhão dourado', size: 'half', style: 'Clássico',
    build: () => [
      P({ frame: 'circle', x: 51.25, y: 9, w: 46, h: 46, border: 'gold', borderWidth: 0.9 }),
      D('sparkle', { x: 33, y: 64, w: 4.5, h: 4.5 }),
      D('sparkle', { x: 111, y: 64, w: 4.5, h: 4.5 }),
      T({ role: 'name', text: TXT_NAME, font: 'Great Vibes', size: 25, color: C.ink, align: 'center', valign: 'middle', x: 38, y: 58, w: 72.5, h: 15, lineHeight: 1.1 }),
      T({ ...BODY, role: 'body', text: TXT_BODY, size: 8.8, align: 'center', x: 20, y: 74, w: 108.5, h: 18 }),
      D('divider', { variant: 'center', x: 54.25, y: 93, w: 40, h: 3 }),
    ],
  },
  {
    id: 't04', name: 'Moderno · foto sangrada', size: 'half', style: 'Moderno',
    build: () => [
      P({ frame: 'rect', x: 0, y: 0, w: 66, h: 105 }),
      T({ ...LABEL, role: 'label', text: 'Turma 2026', x: 76, y: 15, w: 60, h: 5 }),
      T({ role: 'name', text: TXT_NAME, font: 'Playfair Display', weight: 700, size: 19, color: C.ink, lineHeight: 1.1, x: 76, y: 21, w: 60, h: 19 }),
      D('line', { x: 76, y: 43, w: 16, h: 0.7 }),
      T({ role: 'body', text: TXT_BODY, font: 'Montserrat', weight: 300, size: 8.3, color: C.text, lineHeight: 1.7, x: 76, y: 48, w: 59, h: 40 }),
      D('goldSquare', { x: 129, y: 89, w: 6, h: 6 }),
    ],
  },
  {
    id: 't05', name: 'Polaroid', size: 'half', style: 'Divertido',
    build: () => [
      P({ frame: 'polaroid', x: 18, y: 11, w: 58, h: 72, rotation: -4, shadow: true }),
      D('sparkle', { x: 70, y: 7, w: 6, h: 6 }),
      D('sparkle', { x: 15, y: 86, w: 4, h: 4 }),
      T({ role: 'name', text: TXT_NAME, font: 'Dancing Script', weight: 700, size: 22, color: C.ink, lineHeight: 1.1, x: 84, y: 22, w: 52, h: 18, valign: 'bottom' }),
      T({ ...BODY, role: 'body', text: TXT_BODY, size: 9, x: 84, y: 42, w: 51, h: 38 }),
      D('divider', { variant: 'end', x: 84, y: 83, w: 30, h: 3 }),
    ],
  },
  {
    id: 't06', name: 'Perfil do aluno', size: 'half', style: 'Clássico',
    build: () => {
      const fields = [
        ['Apelido', 'Como os amigos me chamam'],
        ['Um sonho', 'O que eu quero conquistar'],
        ['Uma lembrança', 'Um momento inesquecível na escola'],
        ['Recado para a turma', 'Uma frase para levar para a vida'],
      ];
      const els = [
        P({ frame: 'arch', x: 13, y: 9, w: 44, h: 60, border: 'gold', borderWidth: 0.6 }),
        T({ ...NAME, role: 'name', text: TXT_NAME, size: 15, align: 'center', valign: 'middle', x: 6, y: 71, w: 58, h: 11 }),
        T({ ...LABEL, role: 'label', text: '3º ano · 2026', size: 6.3, align: 'center', x: 6, y: 83, w: 58, h: 5 }),
      ];
      fields.forEach(([lab, val], i) => {
        const y = 11 + i * 20;
        els.push(T({ ...LABEL, text: lab, size: 6.3, tracking: 200, x: 70, y, w: 66, h: 4.5 }));
        els.push(T({ ...BODY, role: 'field' + (i + 1), text: val, size: 8.6, lineHeight: 1.4, x: 70, y: y + 5, w: 66, h: 12 }));
      });
      els.push(D('divider', { variant: 'end', x: 70, y: 92, w: 30, h: 3 }));
      return els;
    },
  },
  {
    id: 't07', name: 'Minha trajetória (3 fotos)', size: 'half', style: 'Clássico',
    build: () => [
      T({ ...LABEL, role: 'label', text: 'Minha trajetória', align: 'center', x: 14, y: 8, w: 120.5, h: 5 }),
      T({ ...NAME, role: 'name', text: TXT_NAME, size: 18, align: 'center', valign: 'middle', x: 14, y: 14, w: 120.5, h: 11 }),
      D('line', { x: 30, y: 46.7, w: 88.5, h: 0.5 }),
      P({ frame: 'circle', x: 20, y: 31, w: 31, h: 31, border: 'gold', borderWidth: 0.6 }),
      P({ frame: 'circle', x: 58.75, y: 31, w: 31, h: 31, border: 'gold', borderWidth: 0.6 }),
      P({ frame: 'circle', x: 97.5, y: 31, w: 31, h: 31, border: 'gold', borderWidth: 0.6 }),
      T({ text: 'Infância', font: 'Cormorant Garamond', italic: true, size: 11, color: C.ink, align: 'center', x: 15.5, y: 64, w: 40, h: 6 }),
      T({ text: 'Adolescência', font: 'Cormorant Garamond', italic: true, size: 11, color: C.ink, align: 'center', x: 54.25, y: 64, w: 40, h: 6 }),
      T({ text: 'Hoje', font: 'Cormorant Garamond', italic: true, size: 11, color: C.ink, align: 'center', x: 93, y: 64, w: 40, h: 6 }),
      T({ ...BODY, role: 'body', text: TXT_BODY, size: 8.5, align: 'center', x: 18, y: 74, w: 112.5, h: 20 }),
    ],
  },
  {
    id: 't08', name: 'Duas fotos sobrepostas', size: 'half', style: 'Clássico',
    build: () => [
      P({ x: 13, y: 11, w: 58, h: 70 }),
      P({ frame: 'rect', x: 52, y: 56, w: 32, h: 36, rotation: 5, border: '#FFFFFF', borderWidth: 1.8, shadow: true }),
      T({ ...NAME, role: 'name', text: TXT_NAME, size: 17, x: 92, y: 20, w: 44, h: 16, valign: 'bottom' }),
      T({ ...BODY, role: 'body', text: TXT_BODY, size: 8.5, x: 92, y: 38, w: 44, h: 42 }),
      D('divider', { variant: 'end', x: 92, y: 83, w: 28, h: 3 }),
    ],
  },
  {
    id: 't09', name: 'Mensagem de despedida', size: 'half', style: 'Clássico',
    build: () => [
      D('quote', { x: 13, y: 7, w: 16, h: 16 }),
      T({ role: 'body', text: 'Não é um adeus, mas o início de uma nova e brilhante caminhada. Obrigado por cada riso, cada abraço e cada aprendizado.', font: 'Cormorant Garamond', italic: true, weight: 500, size: 14, color: C.ink, lineHeight: 1.35, align: 'center', valign: 'middle', x: 24, y: 13, w: 100.5, h: 52 }),
      D('divider', { variant: 'center', x: 54.25, y: 68, w: 40, h: 3 }),
      P({ frame: 'circle', x: 36, y: 75, w: 20, h: 20, border: 'gold', borderWidth: 0.5 }),
      T({ role: 'name', text: TXT_NAME, font: 'Great Vibes', size: 21, color: C.ink, valign: 'middle', lineHeight: 1.1, x: 60, y: 75, w: 66, h: 12 }),
      T({ ...LABEL, role: 'label', text: '3º ano · Turma 2026', size: 6, tracking: 200, x: 61, y: 88, w: 66, h: 5 }),
    ],
  },
  {
    id: 't10', name: 'Aquarela suave · foto à direita', size: 'half', style: 'Romântico',
    build: () => [
      D('wash', { color: C.blush, opacity: 0.8, x: 66, y: 4, w: 76, h: 34 }),
      P({ frame: 'soft', x: 76, y: 10, w: 60, h: 85 }),
      T({ role: 'name', text: TXT_NAME, font: 'Great Vibes', size: 28, color: C.ink, lineHeight: 1.05, valign: 'bottom', x: 12, y: 16, w: 62, h: 22 }),
      T({ role: 'body', text: TXT_BODY, font: 'Lora', italic: true, size: 9.3, color: C.text, lineHeight: 1.6, x: 13, y: 41, w: 58, h: 40 }),
      D('sparkle', { x: 13, y: 84, w: 5, h: 5 }),
      D('sparkle', { x: 20, y: 88, w: 3, h: 3 }),
    ],
  },

  // ───────────── PÁGINA INTEIRA ─────────────
  {
    id: 't11', name: 'Capa', size: 'full', style: 'Clássico', bg: 'aquarela',
    build: () => [
      D('cap', { x: 62.25, y: 14, w: 24, h: 16 }),
      T({ role: 'title', text: 'Livro de Formatura', font: 'Cormorant Garamond', weight: 600, size: 32, color: C.ink, align: 'center', valign: 'middle', lineHeight: 1.05, x: 12, y: 32, w: 124.5, h: 22 }),
      T({ ...LABEL, role: 'subtitle', text: '3º ano · Turma 2026', size: 8, tracking: 400, align: 'center', x: 12, y: 55, w: 124.5, h: 6 }),
      P({ x: 17, y: 68, w: 114.5, h: 88 }),
      T({ role: 'school', text: 'Nome da Escola', font: 'Cormorant Garamond', italic: true, weight: 500, size: 15, color: C.ink, align: 'center', valign: 'middle', x: 12, y: 165, w: 124.5, h: 11 }),
      D('divider', { variant: 'center', x: 49.25, y: 178, w: 50, h: 3 }),
      T({ role: 'year', text: '2026', font: 'Cinzel', weight: 600, size: 14, color: C.ink, tracking: 250, align: 'center', x: 12, y: 184, w: 124.5, h: 9 }),
    ],
  },
  {
    id: 't12', name: 'Nossa turma (foto + nomes)', size: 'full', style: 'Clássico',
    build: () => {
      const names = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => `Nome do aluno ${a + i}`).join('\n');
      return [
        T({ role: 'title', text: 'Nossa Turma', font: 'Cormorant Garamond', weight: 600, size: 28, color: C.ink, align: 'center', valign: 'middle', x: 12, y: 12, w: 124.5, h: 15 }),
        T({ ...LABEL, role: 'subtitle', text: '3º ano · 2026', align: 'center', x: 12, y: 28, w: 124.5, h: 5 }),
        P({ x: 16, y: 40, w: 116.5, h: 84 }),
        D('divider', { variant: 'center', x: 49.25, y: 131, w: 50, h: 3 }),
        T({ role: 'names1', text: names(1, 15), font: 'Quicksand', size: 7.6, color: C.text, align: 'center', lineHeight: 1.45, x: 14, y: 138, w: 58, h: 59 }),
        T({ role: 'names2', text: names(16, 30), font: 'Quicksand', size: 7.6, color: C.text, align: 'center', lineHeight: 1.45, x: 76.5, y: 138, w: 58, h: 59 }),
      ];
    },
  },
  {
    id: 't13', name: 'Professores (6 fotos)', size: 'full', style: 'Clássico',
    build: () => {
      const els = [
        T({ role: 'title', text: 'Nossos Mestres', font: 'Cormorant Garamond', weight: 600, size: 27, color: C.ink, align: 'center', valign: 'middle', x: 12, y: 11, w: 124.5, h: 14 }),
        T({ role: 'subtitle', text: 'Obrigado por cada ensinamento.', font: 'Cormorant Garamond', italic: true, size: 12, color: C.text, align: 'center', x: 12, y: 25, w: 124.5, h: 7 }),
      ];
      const cols = [44, 104.5], rows = [38, 91, 144];
      for (const y of rows) for (const cx of cols) {
        els.push(P({ frame: 'circle', x: cx - 16, y, w: 32, h: 32, border: 'gold', borderWidth: 0.6 }));
        els.push(T({ text: 'Nome do Professor', font: 'Cormorant Garamond', weight: 600, size: 12.5, color: C.ink, align: 'center', x: cx - 29, y: y + 34, w: 58, h: 7 }));
        els.push(T({ ...LABEL, text: 'Disciplina', size: 6.2, tracking: 200, align: 'center', x: cx - 29, y: y + 41.5, w: 58, h: 5 }));
      }
      return els;
    },
  },
  {
    id: 't14', name: 'Homenagem', size: 'full', style: 'Romântico',
    build: () => [
      T({ ...LABEL, role: 'label', text: 'Homenagem', size: 7.5, tracking: 400, align: 'center', x: 12, y: 13, w: 124.5, h: 6 }),
      T({ role: 'title', text: 'Aos nossos pais', font: 'Great Vibes', size: 30, color: C.ink, align: 'center', valign: 'middle', x: 12, y: 19, w: 124.5, h: 19 }),
      P({ frame: 'arch', x: 29.25, y: 42, w: 90, h: 104, border: 'gold', borderWidth: 0.7 }),
      T({ role: 'body', text: 'Por cada sacrifício, cada palavra de incentivo e cada abraço nos dias difíceis. Esta conquista também é de vocês.', font: 'Lora', italic: true, size: 10.2, color: C.text, align: 'center', valign: 'middle', lineHeight: 1.6, x: 18, y: 152, w: 112.5, h: 33 }),
      D('divider', { variant: 'center', x: 49.25, y: 189, w: 50, h: 3 }),
    ],
  },
  {
    id: 't15', name: 'Momentos especiais (4 fotos)', size: 'full', style: 'Divertido',
    build: () => [
      T({ role: 'title', text: 'Momentos Especiais', font: 'Cormorant Garamond', weight: 600, size: 26, color: C.ink, align: 'center', valign: 'middle', x: 12, y: 11, w: 124.5, h: 15 }),
      P({ frame: 'rect', x: 15, y: 32, w: 58, h: 70, rotation: -2.5, border: '#FFFFFF', borderWidth: 2, shadow: true }),
      P({ frame: 'rect', x: 77, y: 35, w: 56, h: 56, rotation: 2, border: '#FFFFFF', borderWidth: 2, shadow: true }),
      P({ frame: 'rect', x: 16, y: 109, w: 56, h: 56, rotation: 1.5, border: '#FFFFFF', borderWidth: 2, shadow: true }),
      P({ frame: 'rect', x: 75, y: 97, w: 58, h: 70, rotation: -2, border: '#FFFFFF', borderWidth: 2, shadow: true }),
      D('sparkle', { x: 69, y: 98, w: 7, h: 7 }),
      D('sparkle', { x: 129, y: 27, w: 4.5, h: 4.5 }),
      T({ role: 'body', text: 'Cada sorriso, cada desafio superado e cada noite de estudos construíram quem somos hoje.', font: 'Quicksand', size: 9.2, color: C.text, align: 'center', valign: 'middle', lineHeight: 1.6, x: 18, y: 175, w: 112.5, h: 20 }),
    ],
  },
  {
    id: 't16', name: 'Galeria moderna (3 fotos)', size: 'full', style: 'Moderno', bg: 'creme',
    build: () => [
      T({ ...LABEL, role: 'label', text: 'Momentos', size: 7, tracking: 400, x: 12, y: 12, w: 124.5, h: 5 }),
      T({ role: 'title', text: 'Nossa Jornada', font: 'Playfair Display', weight: 700, size: 22, color: C.ink, x: 12, y: 18, w: 124.5, h: 13 }),
      P({ frame: 'rect', x: 12, y: 35, w: 124.5, h: 80 }),
      P({ frame: 'rect', x: 12, y: 119, w: 60.5, h: 58 }),
      P({ frame: 'rect', x: 76, y: 119, w: 60.5, h: 58 }),
      D('line', { x: 12, y: 182, w: 18, h: 0.7 }),
      T({ role: 'body', text: 'Três anos de histórias que levaremos para sempre.', font: 'Montserrat', weight: 300, size: 8.5, color: C.text, lineHeight: 1.6, x: 12, y: 186, w: 124.5, h: 11 }),
    ],
  },
  {
    id: 't17', name: 'Foto em destaque (sangrada)', size: 'full', style: 'Moderno',
    build: () => [
      P({ frame: 'rect', x: 0, y: 0, w: W, h: 210 }),
      D('panel', { color: '#FBF6EE', opacity: 0.92, x: 14, y: 148, w: 120.5, h: 46 }),
      D('sparkle', { x: 71.75, y: 151, w: 5, h: 5 }),
      T({ role: 'title', text: 'Um Momento Inesquecível', font: 'Cormorant Garamond', weight: 600, size: 21, color: C.ink, align: 'center', valign: 'middle', x: 20, y: 156, w: 108.5, h: 13 }),
      T({ role: 'body', text: 'Escreva aqui uma legenda para esta foto especial da turma.', font: 'Quicksand', size: 8.6, color: C.text, align: 'center', lineHeight: 1.55, x: 22, y: 171, w: 104.5, h: 18 }),
    ],
  },
  {
    id: 't18', name: 'Gratidão / agradecimentos', size: 'full', style: 'Clássico', bg: 'creme',
    build: () => [
      D('frame', { x: 10, y: 10, w: 128.5, h: 190 }),
      D('laurel', { x: 52.25, y: 24, w: 44, h: 28 }),
      T({ role: 'title', text: 'Gratidão', font: 'Cormorant Garamond', weight: 600, size: 32, color: C.ink, align: 'center', valign: 'middle', x: 14, y: 55, w: 120.5, h: 18 }),
      D('divider', { variant: 'center', x: 49.25, y: 76, w: 50, h: 3 }),
      T({ role: 'body', text: 'Aos mestres, às famílias e a todos que fizeram parte desta história. Cada conselho, cada cobrança e cada gesto de carinho nos trouxe até aqui.\n\nCarregaremos vocês em cada nova conquista.', font: 'Lora', size: 10.5, color: C.text, align: 'center', valign: 'middle', lineHeight: 1.7, x: 22, y: 84, w: 104.5, h: 80 }),
      T({ role: 'sign', text: 'Turma 2026', font: 'Great Vibes', size: 24, color: C.ink, align: 'center', valign: 'middle', x: 14, y: 168, w: 120.5, h: 15 }),
    ],
  },
  {
    id: 't19', name: 'Aluno em destaque (página inteira)', size: 'full', style: 'Clássico',
    build: () => [
      P({ x: 17, y: 14, w: 114.5, h: 112 }),
      T({ ...LABEL, role: 'label', text: 'Orador da turma', size: 7, tracking: 400, align: 'center', x: 12, y: 134, w: 124.5, h: 5 }),
      T({ ...NAME, role: 'name', text: TXT_NAME, size: 27, align: 'center', valign: 'middle', x: 12, y: 140, w: 124.5, h: 16 }),
      D('divider', { variant: 'center', x: 49.25, y: 158, w: 50, h: 3 }),
      T({ ...BODY, role: 'body', text: TXT_BODY, align: 'center', x: 20, y: 164, w: 108.5, h: 31 }),
    ],
  },
  {
    id: 't20', name: 'Contracapa / mensagem final', size: 'full', style: 'Romântico', bg: 'blush',
    build: () => [
      D('sparkle', { x: 71.75, y: 30, w: 5, h: 5 }),
      T({ role: 'title', text: 'O Futuro\nNos Aguarda', font: 'Cormorant Garamond', weight: 600, size: 30, color: C.ink, align: 'center', valign: 'middle', lineHeight: 1.05, x: 12, y: 38, w: 124.5, h: 32 }),
      D('divider', { variant: 'center', x: 49.25, y: 74, w: 50, h: 3 }),
      T({ role: 'body', text: 'Não é um adeus, mas o início de uma nova e brilhante caminhada. Que cada um de nós encontre o seu caminho — e nunca esqueça de onde veio.', font: 'Quicksand', size: 10, color: C.text, align: 'center', valign: 'middle', lineHeight: 1.7, x: 22, y: 82, w: 104.5, h: 42 }),
      P({ role: 'logo', frame: 'circle', fit: 'contain', x: 56.75, y: 132, w: 35, h: 35 }),
      T({ role: 'school', text: 'Nome da Escola', font: 'Cormorant Garamond', italic: true, weight: 500, size: 13, color: C.ink, align: 'center', x: 12, y: 172, w: 124.5, h: 8 }),
      T({ role: 'year', text: '2026', font: 'Cinzel', weight: 600, size: 10, color: C.gold, tracking: 300, align: 'center', x: 12, y: 181, w: 124.5, h: 7 }),
    ],
  },
];

export const getTemplate = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];

export function instantiate(id) {
  const t = getTemplate(id);
  return {
    template: t.id,
    elements: t.build().map((e) => ({ ...clone(e), id: uid(), seed: randSeed() })),
  };
}

// Ao trocar de modelo, mantém fotos e textos do aluno já inseridos.
export function switchTemplate(oldSlot, newId) {
  const fresh = instantiate(newId);
  if (!oldSlot) return fresh;
  const oldPhotos = oldSlot.elements.filter((e) => e.type === 'photo' && e.src && e.role !== 'logo');
  const newPhotos = fresh.elements.filter((e) => e.type === 'photo' && e.role !== 'logo');
  newPhotos.forEach((p, i) => {
    const o = oldPhotos[i];
    if (o) Object.assign(p, { src: o.src, zoom: o.zoom, panX: o.panX, panY: o.panY, filter: o.filter, brightness: o.brightness, contrast: o.contrast });
  });
  const tmpl = getTemplate(oldSlot.template);
  const defaults = new Map(tmpl.build().filter((e) => e.role).map((e) => [e.role, e.text]));
  for (const ne of fresh.elements) {
    if (ne.type !== 'text' || !ne.role) continue;
    const oe = oldSlot.elements.find((e) => e.type === 'text' && e.role === ne.role);
    if (oe && oe.text !== defaults.get(ne.role)) ne.text = oe.text; // só copia se foi editado
  }
  return fresh;
}
