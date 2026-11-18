import './style.css';
import { loadFonts } from './fonts.js';
import { loadAllFromDb, removeUnused } from './images.js';
import { state, newBook, loadSavedBook, resetHistory, usedImageIds } from './state.js';
import { initUI } from './ui.js';

async function boot() {
  const root = document.getElementById('app');
  root.innerHTML = '<div class="boot"><div class="spinner"></div><p>Abrindo o Livro de Formatura…</p></div>';
  await loadFonts();
  await loadAllFromDb();
  let book = await loadSavedBook();
  if (!book?.pages?.length) book = newBook();
  state.book = book;
  resetHistory();
  removeUnused(usedImageIds(book)).catch(() => {});
  initUI(root);
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('app').innerHTML = `<div class="boot"><p>Não foi possível abrir o aplicativo.</p><pre>${String(err?.message || err)}</pre></div>`;
});
