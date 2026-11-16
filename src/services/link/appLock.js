/**
 * appLock.js — the KaTuro App's PIN lock. The phone holds class lists (names, LRNs), scores
 * and kept files, so once it is linked to KaTuroDesk it asks for the teacher's PIN when the app
 * opens and after being away for a few minutes (Data Privacy Act: a lost phone shows nothing).
 *
 * Only a slow salted hash of the PIN is kept (PBKDF2-SHA-256, WebCrypto), never the PIN.
 * Forgot the PIN → sign out: that clears the teacher's data from the phone (phoneData.js).
 */
export const LOCK_KEY = 'katuro-app-lock-v1';
export const LOCK_AFTER_MS = 5 * 60 * 1000;
const ITERATIONS = 150000;
export const MAX_TRIES = 5;
export const WAIT_MS = 30 * 1000;
const MAX_WAIT_MS = 60 * 60 * 1000;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(String(s).match(/../g).map((h) => parseInt(h, 16)));

/** 4 to 6 digits. */
export const validPin = (pin) => /^\d{4,6}$/.test(String(pin || ''));

async function derive(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

const load = () => { try { return JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); } catch { return null; } };
const save = (v) => { try { localStorage.setItem(LOCK_KEY, JSON.stringify(v)); return true; } catch { return false; } };

export const hasPin = () => Boolean(load()?.hash);

export async function setPin(pin) {
  if (!validPin(pin)) throw new Error('Use 4 to 6 numbers.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  if (!save({ salt: hex(salt), iterations: ITERATIONS, hash: await derive(pin, salt, ITERATIONS), tries: 0, waitUntil: 0 })) throw new Error('The PIN could not be saved on this phone.');
}

/**
 * Checks a PIN. → { ok } or { ok: false, left, waitMs }. After MAX_TRIES wrong PINs the teacher
 * waits WAIT_MS before the next try.
 */
export async function checkPin(pin, now = Date.now()) {
  const v = load();
  if (!v?.hash) return { ok: true };
  if (v.waitUntil > now) return { ok: false, left: 0, waitMs: v.waitUntil - now };
  const ok = await derive(String(pin || ''), unhex(v.salt), v.iterations || ITERATIONS) === v.hash;
  if (ok) { save({ ...v, tries: 0, waitUntil: 0, rounds: 0 }); return { ok: true }; }
  const tries = (v.tries || 0) + 1;
  const waiting = tries >= MAX_TRIES;
  // Each round of 5 wrong PINs doubles the wait: 30 s, 1 min, 2 min … up to 1 hour.
  const rounds = (v.rounds || 0) + (waiting ? 1 : 0);
  const waitMs = waiting ? Math.min(MAX_WAIT_MS, WAIT_MS * 2 ** (rounds - 1)) : 0;
  save({ ...v, tries: waiting ? 0 : tries, rounds, waitUntil: waiting ? now + waitMs : 0 });
  return { ok: false, left: waiting ? 0 : MAX_TRIES - tries, waitMs };
}

export const forgetPin = () => { try { localStorage.removeItem(LOCK_KEY); } catch { /* nothing kept */ } };

/** Lock again after the app was away (in the background) this long. */
export const shouldLock = (hiddenAt, now = Date.now()) => Boolean(hiddenAt) && now - hiddenAt >= LOCK_AFTER_MS;
