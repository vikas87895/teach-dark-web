/*
  DB.js — chhota storage layer
  - IndexedDB: uploaded PDF/source files (browser me hi rehte hain, GitHub Pages ka
    static hosting hai isliye server par store nahi ho sakte)
  - localStorage: lightweight metadata lists (sources list, videos list, logo)
*/

const DB = (() => {
  const DB_NAME = "apna_style_study";
  const STORE = "sources";
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function saveSourceFile(id, blob) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id, blob });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getSourceFile(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteSourceFile(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---- metadata lists (small, so localStorage is fine) ----
  function getSourcesMeta() {
    return JSON.parse(localStorage.getItem("ass_sources") || "[]");
  }
  function setSourcesMeta(list) {
    localStorage.setItem("ass_sources", JSON.stringify(list));
  }
  function getVideosMeta() {
    return JSON.parse(localStorage.getItem("ass_videos") || "[]");
  }
  function setVideosMeta(list) {
    localStorage.setItem("ass_videos", JSON.stringify(list));
  }
  function getLogo() {
    return localStorage.getItem("ass_logo") || null;
  }
  function setLogo(dataUrl) {
    localStorage.setItem("ass_logo", dataUrl);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return {
    saveSourceFile, getSourceFile, deleteSourceFile,
    getSourcesMeta, setSourcesMeta,
    getVideosMeta, setVideosMeta,
    getLogo, setLogo,
    uid
  };
})();
