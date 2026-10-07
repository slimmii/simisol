// Liedjesbibliotheek in de browser (IndexedDB). De liedjes komen uit een zip die je zelf importeert,
// zodat ze niet op de website of GitHub hoeven te staan.
import { readZip } from './zip.js';

const DB_NAME = 'simisol';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'num' });
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio'); // sleutel = bestandsnaam
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Opslaan in de browser mislukt.'));
  });
}

function getAll(store) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

const objectUrls = [];

/** Alle bewaarde liedjes, met een speelbare URL voor elke opname. */
export async function loadSongs() {
  objectUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  let songs;
  try { songs = await getAll('songs'); } catch { return []; }
  const db = await openDb();
  const store = db.transaction('audio').objectStore('audio');
  const getBlob = (key) => new Promise((resolve) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
  for (const s of songs) {
    if (!s.audio) continue;
    for (const kind of Object.keys(s.audio)) {
      const a = s.audio[kind];
      const blob = await getBlob(a.file);
      if (!blob) { delete s.audio[kind]; continue; }
      a.src = URL.createObjectURL(blob);
      objectUrls.push(a.src);
    }
    if (!Object.keys(s.audio).length) s.audio = null;
  }
  return songs.sort((a, b) => a.num - b.num);
}

/**
 * Importeert een zip gemaakt met tools/make_songs_zip.py. Liedjes met hetzelfde nummer worden vervangen.
 * @returns {Promise<{songs:number, audio:number}>}
 */
export async function importZip(file, onProgress) {
  onProgress?.('Zip lezen…');
  const files = await readZip(await file.arrayBuffer());
  // songs.json mag ook in een map binnen de zip zitten (bv. na opnieuw inpakken met Finder)
  const index = [...files.keys()].find((n) => /(^|\/)songs\.json$/.test(n) && !n.includes('__MACOSX'));
  if (!index) throw new Error('In deze zip zit geen songs.json.');
  const root = index.slice(0, index.length - 'songs.json'.length);
  let data;
  try { data = JSON.parse(new TextDecoder().decode(files.get(index))); } catch { throw new Error('songs.json kan niet gelezen worden.'); }
  if (data.format !== 'simisol-liedjes' || !Array.isArray(data.songs)) throw new Error('Dit is geen Simisol-liedjeszip.');

  const songs = data.songs.filter(validSong);
  if (!songs.length) throw new Error('Geen geldige liedjes gevonden in de zip.');
  onProgress?.(`${songs.length} liedjes opslaan…`);

  const db = await openDb();
  const tx = db.transaction(['songs', 'audio'], 'readwrite');
  let audioCount = 0;
  for (const s of songs) {
    for (const kind of Object.keys(s.audio || {})) {
      const a = s.audio[kind];
      const bytes = files.get(root + a.file);
      if (!bytes) { delete s.audio[kind]; continue; }
      tx.objectStore('audio').put(new Blob([bytes], { type: 'audio/mpeg' }), a.file);
      audioCount++;
    }
    if (s.audio && !Object.keys(s.audio).length) s.audio = null;
    tx.objectStore('songs').put(s);
  }
  await done(tx);
  // vraag de browser om de gegevens niet zomaar op te ruimen
  try { await navigator.storage?.persist?.(); } catch {}
  return { songs: songs.length, audio: audioCount };
}

export async function clearLibrary() {
  const db = await openDb();
  const tx = db.transaction(['songs', 'audio'], 'readwrite');
  tx.objectStore('songs').clear();
  tx.objectStore('audio').clear();
  await done(tx);
}

function validSong(s) {
  return s && Number.isFinite(s.num) && typeof s.title === 'string' && Array.isArray(s.time) && s.time.length === 2 &&
    Array.isArray(s.notes) && s.notes.length > 0 &&
    s.notes.every((n) => n && typeof n.p === 'string' && /^(r|[A-G][#b]?\d)$/.test(n.p) && Number.isFinite(n.d) && n.d > 0);
}
