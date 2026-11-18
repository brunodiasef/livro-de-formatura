// Todas as medidas do livro estão em milímetros.
export const MM_PER_PT = 25.4 / 72;
export const SHEET_W = 297;   // A4 paisagem
export const SHEET_H = 210;
export const PAGE_W = 148.5;  // metade da folha (A5 retrato)
export const PAGE_H = 210;
export const HALF_H = 105;    // espaço de um aluno (meia página)

// Margens de segurança (texto e rostos devem ficar dentro delas)
export const SAFE = {
  outer: 10,   // borda externa da folha (impressoras não imprimem os últimos ~4-5 mm)
  cut: 8,      // distância da linha de corte central
  mid: 5,      // distância da linha que separa o aluno de cima e o de baixo
};

export const DPI_GOOD = 220;   // abaixo disso a foto já perde nitidez
export const DPI_MIN = 150;    // abaixo disso a foto fica visivelmente borrada

export const C = {
  paper: '#FBF6EE',
  ink: '#3A2417',
  text: '#4B3D33',
  gold: '#A8813A',
  goldLight: '#E9CF85',
  blush: '#F0C9B6',
  white: '#FFFFFF',
};

export const SWATCHES = [
  '#3A2417', '#4B3D33', '#6B5446', '#A8813A', '#C9A24A', '#8A5A44',
  '#B76E5A', '#7D8B74', '#2F3B52', '#1F1A17', '#FFFFFF', '#FBF6EE',
];

export const BACKGROUNDS = [
  { id: 'aquarela', name: 'Aquarela creme', swatch: 'linear-gradient(135deg,#F3D3C2 0%,#FBF6EE 40%,#FBF6EE 70%,#E9CF85 100%)' },
  { id: 'creme', name: 'Creme liso', swatch: '#FBF6EE' },
  { id: 'classico', name: 'Clássico com moldura', swatch: '#FBF6EE', border: true },
  { id: 'blush', name: 'Rosé suave', swatch: 'linear-gradient(160deg,#FBEFE6,#F4D6C6)' },
  { id: 'branco', name: 'Branco', swatch: '#FFFFFF' },
  { id: 'noite', name: 'Escuro elegante', swatch: 'linear-gradient(160deg,#2A211C,#16110E)' },
];

export const FRAMES = [
  { id: 'brush', name: 'Aquarela (bordas em tinta)' },
  { id: 'soft', name: 'Aquarela suave (esfumado)' },
  { id: 'rect', name: 'Retângulo' },
  { id: 'rounded', name: 'Cantos arredondados' },
  { id: 'circle', name: 'Círculo / oval' },
  { id: 'arch', name: 'Arco' },
  { id: 'polaroid', name: 'Polaroid' },
];

export const DECOS = [
  { id: 'sparkle', name: 'Brilho (estrela)', w: 6, h: 6 },
  { id: 'divider', name: 'Linha com brilho', w: 36, h: 3, variant: 'end' },
  { id: 'line', name: 'Linha', w: 30, h: 0.6 },
  { id: 'goldSquare', name: 'Quadrado dourado', w: 8, h: 8 },
  { id: 'goldStrip', name: 'Faixa dourada', w: 6, h: 40, rotation: 35 },
  { id: 'diamond', name: 'Losango', w: 5, h: 5 },
  { id: 'wash', name: 'Mancha aquarela', w: 50, h: 35, color: '#F0C9B6' },
  { id: 'quote', name: 'Aspas (abrir “)', w: 16, h: 16, variant: 'open' },
  { id: 'quote', name: 'Aspas (fechar ”)', w: 16, h: 16, variant: 'close' },
  { id: 'laurel', name: 'Ramos de louro', w: 40, h: 26 },
  { id: 'cap', name: 'Capelo', w: 22, h: 15 },
  { id: 'frame', name: 'Moldura dupla', w: 60, h: 40 },
  { id: 'panel', name: 'Faixa / caixa de fundo', w: 60, h: 20, color: '#FBF6EE', opacity: 0.9 },
];
