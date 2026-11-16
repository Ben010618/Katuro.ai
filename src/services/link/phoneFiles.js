/**
 * phoneFiles.js — files on the KaTuro App's side (Phase 3, Lessons):
 *   - "Keep on phone": offline copies of chosen files from the KaTuro folder
 *   - the outbox: photos and files to send to KaTuroDesk, kept while it can't be reached
 *   - photos made smaller before sending, and pages scanned into one PDF
 *
 * Stored in the app's own IndexedDB on this phone only (never in the cloud). Learner
 * records the teacher keeps on the phone stay on the phone until removed here.
 */
import { newId } from './scoreEntry.js';

const DB_NAME = 'katuro-phone-files';
const KEPT = 'kept';
const OUTBOX = 'outbox';
let dbPromise = null;

function db() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This phone cannot keep files for the app.')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(KEPT)) d.createObjectStore(KEPT, { keyPath: 'path' });
      if (!d.objectStoreNames.contains(OUTBOX)) d.createObjectStore(OUTBOX, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('The phone storage could not be opened.'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

async function run(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(out?.result);
    tx.onerror = () => reject(tx.error || new Error('The phone storage could not be used. The phone may be full.'));
    tx.onabort = tx.onerror;
  });
}

// ── Keep on phone ──
export const keepFile = (path, { name, size, bytes }) => run(KEPT, 'readwrite', (s) => s.put({ path, name, size: size ?? bytes.byteLength, bytes, keptAt: new Date().toISOString() }));
export const keptFile = (path) => run(KEPT, 'readonly', (s) => s.get(path));
export const forgetKept = (path) => run(KEPT, 'readwrite', (s) => s.delete(path));
/** → [{ path, name, size, keptAt }] (without the bytes) */
export async function keptFiles() {
  const all = (await run(KEPT, 'readonly', (s) => s.getAll())) || [];
  return all.map(({ path, name, size, keptAt }) => ({ path, name, size, keptAt })).sort((a, b) => a.name.localeCompare(b.name));
}
/** Removes every kept file and every file waiting to be sent (unlink / sign-out). */
export async function forgetPhoneFiles() {
  await run(KEPT, 'readwrite', (s) => s.clear());
  await run(OUTBOX, 'readwrite', (s) => s.clear());
}

// ── Outbox ──
/** Adds a file to send; → its id. */
async function addToOutbox({ folder, name, bytes }) {
  const id = newId();
  await run(OUTBOX, 'readwrite', (s) => s.put({ id, folder, name, bytes, size: bytes.byteLength, addedAt: new Date().toISOString(), error: null }));
  return id;
}
export async function outbox() {
  const all = (await run(OUTBOX, 'readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}
const removeFromOutbox = (id) => run(OUTBOX, 'readwrite', (s) => s.delete(id));

/**
 * Sends what is waiting, oldest first; stops at the first "can't reach".
 * A file KaTuroDesk refused stays with its reason. → { sent: [result], failed, unreachable }
 */
let sendingOutbox = null; // one send at a time: a second caller waits for the same run
export function sendOutbox(client) {
  if (!sendingOutbox) sendingOutbox = sendOutboxOnce(client).finally(() => { sendingOutbox = null; });
  return sendingOutbox;
}
async function sendOutboxOnce(client) {
  const sent = [];
  const failed = [];
  for (const item of await outbox()) {
    try {
      sent.push(await client.upload(item.folder, item.name, item.bytes));
      await removeFromOutbox(item.id);
    } catch (err) {
      if (err.code === 'UNREACHABLE' || err.code === 'DESK_STARTING') return { sent, failed, unreachable: true };
      await run(OUTBOX, 'readwrite', (s) => s.put({ ...item, error: err.message }));
      failed.push({ item, error: err.message });
    }
  }
  return { sent, failed, unreachable: false };
}
export const dropFromOutbox = removeFromOutbox;

/**
 * Sends one file now, or keeps it in the outbox when KaTuroDesk can't be reached.
 * → { sent: result } or { queued: true }
 */
export async function sendOrKeep(client, { folder, name, bytes }) {
  try {
    return { sent: await client.upload(folder, name, bytes) };
  } catch (err) {
    if (err.code !== 'UNREACHABLE' && err.code !== 'DESK_STARTING') throw err;
    await addToOutbox({ folder, name, bytes });
    return { queued: true };
  }
}

// ── Photos and scans ──
const pad = (n) => String(n).padStart(2, '0');
/** "Photo 2026-11-16 1432.jpg" */
export function stampName(prefix, ext, d = new Date()) {
  return `${prefix} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}

/** A photo from the camera or gallery → a JPEG up to 2400 pixels on the long side (sharp enough for papers). */
export async function shrinkPhoto(file, { maxSide = 2400, quality = 0.88 } = {}) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', quality));
    if (!blob) throw new Error('This photo could not be prepared.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close?.();
  }
}

/** Scanned pages (JPEG bytes, in order) → one PDF, a page per photo. */
export async function pagesToPdf(pages, { paper = 'a4' } = {}) {
  const { imagesToPdf } = await import('../desk/generators/pdfTools.js');
  return imagesToPdf(pages.map((bytes) => ({ bytes, mimeType: 'image/jpeg' })), { paper, margin: 18 });
}

/** Where a file may go from the phone: Records or Lessons, or a folder inside them. */
export const canSendTo = (folder) => /^(records|lessons)(\/|$)/i.test(String(folder || ''));
