// Armazenamento local (IndexedDB): o projeto fica salvo no navegador automaticamente.
const DB_NAME = 'livro-formatura';
let dbp;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('kv');
        r.result.createObjectStore('images');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbp;
}

function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  }));
}

export const dbGet = (store, key) => tx(store, 'readonly', (s) => s.get(key));
export const dbPut = (store, key, val) => tx(store, 'readwrite', (s) => s.put(val, key));
export const dbDel = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
export const dbKeys = (store) => tx(store, 'readonly', (s) => s.getAllKeys());
export const dbClear = (store) => tx(store, 'readwrite', (s) => s.clear());
