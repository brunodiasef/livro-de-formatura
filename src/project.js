// Salvar / abrir / novo projeto. O projeto também fica salvo automaticamente no navegador.
import { state, emit, newBook, resetHistory, saveNow, usedImageIds } from './state.js';
import { getImage, putBlob, clearAll, blobToDataURL } from './images.js';
import { clearRenderCache } from './render.js';
import { download } from './util.js';
import { toast, confirmBox } from './ui-kit.js';

const slug = (s) => (s || 'livro').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

export async function saveProjectFile() {
  toast('Preparando o arquivo do projeto…');
  const images = {};
  for (const id of usedImageIds()) {
    const im = getImage(id);
    if (im?.blob) images[id] = await blobToDataURL(im.blob);
  }
  const data = { format: 'livro-formatura', version: 1, savedAt: new Date().toISOString(), book: state.book, images };
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${slug(state.book.title)}.livro.json`);
  toast('Cópia do projeto salva na pasta Downloads (inclui as fotos).', 'ok');
}

export async function openProjectFile(file) {
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
    emit('change', { rebuild: true });
    toast('Projeto aberto.', 'ok');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Não foi possível abrir o arquivo.', 'error');
  }
}

export async function newProject() {
  if (!(await confirmBox('Novo projeto', 'Começar um livro novo? O projeto atual e as fotos dele serão apagados deste computador. Se quiser guardar, use antes "Salvar cópia do projeto".', 'Começar do zero', true))) return;
  await clearAll();
  clearRenderCache();
  state.book = newBook();
  state.spread = 0;
  state.sel = null;
  resetHistory();
  await saveNow();
  emit('change', { rebuild: true });
}
