import { uid } from './util.js';
import { dbGet, dbPut, dbKeys, dbDel, dbClear } from './db.js';

// id -> { bmp: ImageBitmap, w, h, blob }
const store = new Map();
const MAX_SIDE = 3600; // suficiente para uma página inteira A5 a 300 DPI

export const getImage = (id) => (id ? store.get(id) : null);

export async function importFile(file) {
  const src = await createImageBitmap(file, { imageOrientation: 'from-image' });
  // foto já em tamanho adequado: guarda o arquivo original (mais rápido e sem perder qualidade)
  if (Math.max(src.width, src.height) <= MAX_SIDE && /^image\/(jpeg|png)$/.test(file.type)) {
    src.close?.();
    const id = uid();
    await putBlob(id, file);
    return id;
  }
  const k = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
  const w = Math.round(src.width * k), hgt = Math.round(src.height * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, w, hgt);
  src.close?.();
  const keepPng = file.type === 'image/png'; // mantém transparência (brasões, logos)
  const blob = await new Promise((r) => c.toBlob(r, keepPng ? 'image/png' : 'image/jpeg', 0.93));
  const id = uid();
  await putBlob(id, blob);
  return id;
}

async function addBlob(id, blob) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  store.set(id, { bmp, w: bmp.width, h: bmp.height, blob });
}

export async function putBlob(id, blob) {
  await addBlob(id, blob);
  await dbPut('images', id, blob);
}

export async function loadAllFromDb() {
  const keys = await dbKeys('images');
  await Promise.all(keys.map(async (k) => {
    const blob = await dbGet('images', k);
    if (blob) await addBlob(k, blob).catch(() => {});
  }));
}

export async function clearAll() {
  store.clear();
  await dbClear('images');
}

export async function removeUnused(usedIds) {
  for (const id of [...store.keys()]) {
    if (!usedIds.has(id)) { store.delete(id); await dbDel('images', id); }
  }
}

export function blobToDataURL(blob) {
  return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
}

// Imagem de exemplo usada nos espaços de foto vazios e nas miniaturas dos modelos
let placeholder;
export function placeholderImage() {
  if (placeholder) return placeholder;
  const W = 600, H = 600;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#ddd0c3'); grd.addColorStop(1, '#a99789');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.beginPath(); g.arc(W * 0.8, H * 0.18, W * 0.1, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(92,74,63,0.5)';
  g.beginPath(); g.arc(W / 2, H * 0.42, W * 0.14, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(W / 2, H * 1.0, W * 0.32, H * 0.36, 0, Math.PI, 0); g.fill();
  placeholder = { bmp: c, w: W, h: H, placeholder: true };
  return placeholder;
}
