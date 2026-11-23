// Salvar / abrir / novo projeto. O projeto também fica salvo automaticamente no navegador.
import { state, emit, newBook, resetHistory, saveNow, usedImageIds } from './state.js';
import { getImage, putBlob, clearAll, blobToDataURL, removeUnused } from './images.js';
import { clearRenderCache } from './render.js';
import { download } from './util.js';
import { toast, confirmBox } from './ui-kit.js';
import { dbGet, dbPut, dbDel } from './db.js';

const slug = (s) => (s || 'livro').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// ───── arquivo ligado ao projeto ─────
// No Chrome/Edge o app grava direto no arquivo .livro.json escolhido: "Salvar" regrava o mesmo
// arquivo; "Salvar como…" escolhe outro. Em navegadores sem esse recurso, baixa uma cópia.
const canPickFiles = typeof window.showSaveFilePicker === 'function';
const PICKER_TYPES = [{ description: 'Projeto do Livro de Formatura', accept: { 'application/json': ['.json'] } }];
let fileHandle = null;

export async function loadFileHandle() {
  if (!canPickFiles) return;
  try { fileHandle = (await dbGet('kv', 'fileHandle')) || null; } catch { fileHandle = null; }
}
async function rememberHandle(h) {
  fileHandle = h;
  try { if (h) await dbPut('kv', 'fileHandle', h); else await dbDel('kv', 'fileHandle'); } catch { /* sem problema: vale só nesta sessão */ }
  emit('file');
}
export const currentFileName = () => fileHandle?.name || null;
export const canSaveInPlace = () => canPickFiles;

async function projectBlob() {
  const images = {};
  for (const id of usedImageIds()) {
    const im = getImage(id);
    if (im?.blob) images[id] = await blobToDataURL(im.blob);
  }
  const data = { format: 'livro-formatura', version: 1, savedAt: new Date().toISOString(), book: state.book, images };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

async function writeTo(h) {
  toast(`Salvando em "${h.name}"…`);
  const blob = await projectBlob();
  const w = await h.createWritable();
  await w.write(blob);
  await w.close();
  toast(`Projeto salvo em "${h.name}" (com as fotos).`, 'ok');
}

async function hasPermission(h) {
  const opts = { mode: 'readwrite' };
  if ((await h.queryPermission?.(opts)) === 'granted') return true;
  return (await h.requestPermission?.(opts)) === 'granted';
}

// Salvar: regrava o mesmo arquivo. Na primeira vez (ou se o arquivo sumiu), pergunta onde salvar.
export async function saveProject() {
  if (!canPickFiles || !fileHandle) return saveProjectAs();
  try {
    if (!(await hasPermission(fileHandle))) return saveProjectAs();
    await writeTo(fileHandle);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.error(err);
    if (err?.name === 'NotFoundError' || err?.name === 'NotAllowedError') return saveProjectAs();
    toast('Não foi possível salvar no arquivo. Use "Salvar como…" para escolher outro.', 'error');
  }
}

// Salvar como: escolhe nome e pasta; a partir daí, "Salvar" grava nesse arquivo
export async function saveProjectAs() {
  if (!canPickFiles) {
    toast('Preparando o arquivo do projeto…');
    download(await projectBlob(), `${slug(state.book.title)}.livro.json`);
    toast('Este navegador não deixa escolher o arquivo: a cópia foi para a pasta Downloads. Use Chrome ou Edge para salvar sempre no mesmo arquivo.', 'ok', 7000);
    return;
  }
  try {
    // o seletor precisa abrir logo após o clique; o arquivo é montado depois
    const h = await window.showSaveFilePicker({ suggestedName: fileHandle?.name || `${slug(state.book.title)}.livro.json`, types: PICKER_TYPES });
    await rememberHandle(h);
    await writeTo(h);
  } catch (err) {
    if (err?.name === 'AbortError') return; // a pessoa cancelou
    console.error(err);
    toast('Não foi possível salvar o arquivo.', 'error');
  }
}

// Abrir: no Chrome/Edge guarda o arquivo aberto, para "Salvar" gravar nele mesmo
export async function pickAndOpenProject() {
  if (typeof window.showOpenFilePicker !== 'function') {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.addEventListener('change', () => inp.files?.[0] && openProjectFile(inp.files[0]));
    inp.click();
    return;
  }
  try {
    const [h] = await window.showOpenFilePicker({ types: PICKER_TYPES, multiple: false });
    await openProjectFile(await h.getFile(), h);
  } catch (err) {
    if (err?.name !== 'AbortError') { console.error(err); toast('Não foi possível abrir o arquivo.', 'error'); }
  }
}

export async function openProjectFile(file, handle = null) {
  try {
    const data = JSON.parse(await file.text());
    if (data.format !== 'livro-formatura' || !data.book?.pages) throw new Error('Este arquivo não é um projeto do Livro de Formatura.');
    if (!(await confirmBox('Abrir projeto', 'O projeto aberto agora será substituído. Deseja continuar?', 'Abrir'))) return;
    await clearAll();
    clearRenderCache();
    for (const [id, url] of Object.entries(data.images || {})) {
      const blob = await (await fetch(url)).blob();
      await putBlob(id, blob);
    }
    state.book = data.book;
    state.spread = 0;
    state.sel = null;
    resetHistory();
    await saveNow();
    await rememberHandle(handle); // "Salvar" passa a gravar neste arquivo (ou pergunta, se veio sem arquivo ligado)
    emit('change', { rebuild: true });
    toast(handle ? `Projeto aberto: "${handle.name}". "Salvar" grava neste mesmo arquivo.` : 'Projeto aberto.', 'ok');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Não foi possível abrir o arquivo.', 'error');
  }
}

export async function newProject() {
  if (!(await confirmBox('Novo projeto', 'Começar um livro novo? O projeto atual e as fotos dele serão apagados deste navegador. Se quiser guardar, use antes "Salvar" ou "Salvar como…".', 'Começar do zero', true))) return;
  await rememberHandle(null); // o livro novo ainda não tem arquivo
  const keepTemplates = state.book.customTemplates || []; // "Meus modelos" passam para o livro novo
  clearRenderCache();
  state.book = newBook();
  state.book.customTemplates = keepTemplates;
  await removeUnused(usedImageIds());
  state.spread = 0;
  state.sel = null;
  resetHistory();
  await saveNow();
  emit('change', { rebuild: true });
}
