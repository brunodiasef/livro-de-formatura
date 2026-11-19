// Separação de sílabas em português (para quebrar palavras no fim da linha com hífen).
// Regras da escola: uma consoante entre vogais vai para a sílaba seguinte (ca-mi-nho);
// duas consoantes se separam (car-ro, pas-so, nas-cer, ap-to), menos os encontros que
// começam sílaba (pr, bl, tr, ch, lh, nh, qu, gu…), que ficam juntos (a-pren-der, ca-mi-nha-da).
// Nunca separa vogais (evita erros em ditongos) e não deixa 1 letra sozinha.

const VOWELS = new Set('aeiouyáéíóúâêôãõàü');
const ONSET = new Set(['bl', 'br', 'cl', 'cr', 'dl', 'dr', 'fl', 'fr', 'gl', 'gr', 'kl', 'kr', 'pl', 'pr', 'tl', 'tr', 'vl', 'vr', 'ch', 'lh', 'nh', 'qu', 'gu']);

const cache = new Map();

// posições (índices no texto) onde a palavra pode ser quebrada
export function hyphenPoints(word) {
  if (cache.has(word)) return cache.get(word);
  const out = [];
  // palavras compostas: pode quebrar logo depois do hífen (guarda-|chuva)
  let base = 0;
  for (const part of word.split(/(?<=-)/)) {
    for (const p of syllablePoints(part)) out.push(base + p);
    base += part.length;
    if (part.endsWith('-') && base < word.length) out.push(base);
  }
  const res = [...new Set(out)].sort((a, b) => a - b);
  if (cache.size > 5000) cache.clear();
  cache.set(word, res);
  return res;
}

function syllablePoints(w) {
  const m = w.match(/^([^\p{L}]*)(\p{L}+)([^\p{L}]*)$/u);
  if (!m) return [];
  const lead = m[1].length, core = m[2], n = core.length;
  if (n < 4) return [];
  const lw = core.toLowerCase();
  const isV = [];
  for (let i = 0; i < n; i++) {
    const c = lw[i];
    // o "u" de que/qui/gue/gui (e quando, guarda) funciona como consoante
    const uCons = c === 'u' && i > 0 && (lw[i - 1] === 'q' || lw[i - 1] === 'g') && i + 1 < n && VOWELS.has(lw[i + 1]);
    isV.push(VOWELS.has(c) && !uCons);
  }
  const pts = [];
  let i = 0;
  while (i < n && !isV[i]) i++; // consoantes do começo ficam na 1ª sílaba
  while (i < n) {
    while (i < n && isV[i]) i++; // grupo de vogais
    const s = i;
    while (i < n && !isV[i]) i++; // consoantes até a próxima vogal
    const e = i;
    if (e >= n || e === s) continue; // fim da palavra, ou vogal seguida de vogal
    const len = e - s;
    let cut;
    if (len === 1) cut = s;
    else cut = ONSET.has(lw.slice(e - 2, e)) ? e - 2 : e - 1;
    if (cut >= 2 && n - cut >= 2) pts.push(lead + cut);
  }
  return pts;
}

// texto da palavra já separado, para conferência: "con-se-quen-te-men-te"
export function hyphenate(word) {
  const pts = hyphenPoints(word);
  let out = '', last = 0;
  for (const p of pts) { out += word.slice(last, p) + (word[p - 1] === '-' ? '' : '-'); last = p; }
  return out + word.slice(last);
}
