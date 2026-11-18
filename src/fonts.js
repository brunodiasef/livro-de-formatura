import { FONT_FACES } from './font-files.js';

export const FONTS = [
  { family: 'Cormorant Garamond', group: 'Clássicas' },
  { family: 'Playfair Display', group: 'Clássicas' },
  { family: 'EB Garamond', group: 'Clássicas' },
  { family: 'Lora', group: 'Clássicas' },
  { family: 'Cinzel', group: 'Clássicas' },
  { family: 'Great Vibes', group: 'Manuscritas' },
  { family: 'Parisienne', group: 'Manuscritas' },
  { family: 'Dancing Script', group: 'Manuscritas' },
  { family: 'Quicksand', group: 'Modernas' },
  { family: 'Josefin Sans', group: 'Modernas' },
  { family: 'Montserrat', group: 'Modernas' },
  { family: 'Lato', group: 'Modernas' },
  { family: 'Raleway', group: 'Modernas' },
];

export const WEIGHT_NAMES = { 300: 'Leve', 400: 'Normal', 500: 'Médio', 600: 'Seminegrito', 700: 'Negrito' };

export function fontWeights(family) {
  return [...new Set(FONT_FACES.filter((f) => f[0] === family && f[3] === 'normal').map((f) => +f[2]))].sort();
}
export function fontHasItalic(family) {
  return FONT_FACES.some((f) => f[0] === family && f[3] === 'italic');
}

export async function loadFonts() {
  await Promise.all(
    FONT_FACES.map(([family, url, weight, style]) => {
      const ff = new FontFace(family, `url(${url})`, { weight, style });
      document.fonts.add(ff);
      return ff.load().catch((e) => console.warn('Fonte não carregou', family, weight, e));
    })
  );
}
