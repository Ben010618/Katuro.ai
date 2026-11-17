/**
 * linkClient.js — the KaTuro App's side of the phone ↔ KaTuroDesk link (see
 * electron/linkService.cjs for the KaTuroDesk side and the whole design).
 *
 * Plain WebCrypto (AES-256-GCM) and fetch, so it runs in the phone app and in tests.
 */

import { bytesToBase64, base64ToBytes as decodeBase64 } from '../../utils/bytes.js';

// Pairing QR codes: "KT2|id|key|port|addresses|deskId" (KaTuroDesk 1.20+, short so it scans at
// once) and the older "KTLINK1:" + base64 JSON.
export const QR_PREFIX = 'KT2|';
const OLD_QR_PREFIX = 'KTLINK1:';
// The phone's clock minus KaTuroDesk's, learned when KaTuroDesk refuses a message as stale.
let clockOffset = 0;
export const VERSION = 1;
const TRY_MS = 4000;
const READ_MS = 60000;
// Addresses kept per KaTuroDesk: each unreachable one costs a wait, so the list stays short.
export const MAX_HOSTS = 6;
// Requests that read or write files on KaTuroDesk can take a while on a busy laptop.
const SLOW_OPS = new Set(['read', 'upload', 'rename', 'move', 'replace', 'classes', 'class', 'record', 'history', 'undo', 'attendance', 'attendanceGet', 'quizzes', 'quiz', 'schedule', 'addEvent']);
// File changes on KaTuroDesk: one that runs out of time may still have been done there, so it is
// never sent again to another address of the computer (TIMEOUT, not UNREACHABLE). The teacher
// looks first. Not uploads: an address that is not on this network also just runs out of time,
// and a sent file never overwrites anything (at worst a "name (2)" copy), so an upload that
// runs out of time is kept on the phone to send later, as before.
const FILE_CHANGES = new Set(['rename', 'move', 'replace']);
// An assistant turn on KaTuroDesk (it may write documents) can take a few minutes.
const ASK_MS = 5 * 60000 + 15000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64uEncode(bytes) {
  return bytesToBase64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  return decodeBase64(s + '='.repeat((4 - (s.length % 4)) % 4));
}

const aad = (id, kind, nonce = '') => enc.encode(`katuro-link|${id}|${kind}${nonce ? `|${nonce}` : ''}`);
const importKey = (raw) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

async function seal(key, obj, additional) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additional }, key, enc.encode(JSON.stringify(obj))));
  return { iv: b64uEncode(iv), ct: b64uEncode(ct) };
}

async function open(key, { iv, ct }, additional) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64uDecode(iv), additionalData: additional }, key, b64uDecode(ct));
  return JSON.parse(dec.decode(plain));
}

/**
 * The QR code KaTuroDesk shows → { id, key, hosts, port, deskName, deskId }, or null when
 * the text is not a KaTuroDesk pairing code.
 */
export function parseLinkQr(text) {
  const t = String(text || '').trim();
  if (t.startsWith(QR_PREFIX)) {
    const [, id, key, port, hosts, deskId] = t.split('|');
    const list = String(hosts || '').split(',').map((h) => h.trim()).filter(Boolean).slice(0, 6);
    const p = Number(port);
    if (!id || !/^[A-Za-z0-9_-]{43}$/.test(String(key)) || !Number.isInteger(p) || p < 1 || p > 65535 || !list.length) return null;
    return { id, key, hosts: list, port: p, deskName: 'KaTuroDesk', deskId: String(deskId || '') };
  }
  if (!t.startsWith(OLD_QR_PREFIX)) return null;
  try {
    const p = JSON.parse(dec.decode(b64uDecode(t.slice(OLD_QR_PREFIX.length))));
    if (p.v !== VERSION || !p.id || !p.k || !Array.isArray(p.h) || !p.p) return null;
    return { id: String(p.id), key: String(p.k), hosts: p.h.map(String).filter(Boolean), port: Number(p.p), deskName: String(p.n || 'KaTuroDesk'), deskId: String(p.d || '') };
  } catch {
    return null;
  }
}

class LinkError extends Error {
  constructor(message, code = 'ERROR', details = null) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const UNREACHABLE = "Can't reach your KaTuroDesk. Check that it is open on your computer, and that this phone is on the same Wi-Fi or hotspot.";

function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

/**
 * One encrypted request to one address. → the Desk's decrypted answer object.
 * Throws LinkError('…', 'UNREACHABLE') when nothing answers at that address.
 */
async function exchange({ host, port, id, key, op, args, fetchImpl, timeoutMs, retried = false }) {
  const nonce = b64uEncode(crypto.getRandomValues(new Uint8Array(18)));
  const body = JSON.stringify({ v: VERSION, id, ...(await seal(key, { op, args, ts: Date.now() + clockOffset, nonce }, aad(id, 'req'))) });
  const t = withTimeout(timeoutMs);
  let res;
  try {
    res = await fetchImpl(`http://${host}:${port}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: t.signal });
  } catch {
    if (t.signal.aborted && FILE_CHANGES.has(op)) throw new LinkError('KaTuroDesk took too long to answer. Look in the folder whether it was done before trying again.', 'TIMEOUT');
    throw new LinkError(UNREACHABLE, 'UNREACHABLE');
  } finally {
    t.done();
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new LinkError(UNREACHABLE, 'UNREACHABLE');
  }
  if (!json?.ct) throw new LinkError(json?.error || 'KaTuroDesk refused the request.', json?.code || `HTTP_${res.status}`);
  let out;
  try {
    out = await open(key, json, aad(id, 'res', nonce));
  } catch {
    throw new LinkError('The answer from KaTuroDesk could not be checked. Link this phone again.', 'BAD_ANSWER');
  }
  // The phone's clock is off: take KaTuroDesk's time (from its encrypted answer, so nobody else
  // can set it) and send once more, as a new message (the refused one was not done).
  if (out.error && out.code === 'STALE' && Number.isFinite(out.now) && !retried) {
    clockOffset = out.now - Date.now();
    return exchange({ host, port, id, key, op, args, fetchImpl, timeoutMs, retried: true });
  }
  if (out.error) throw new LinkError(out.error, out.code || 'ERROR', out.details || null);
  return out;
}

/** Tries each address (the one that worked last time first). → { host, out } */
async function tryHosts(hosts, run) {
  let last = new LinkError(UNREACHABLE, 'UNREACHABLE');
  for (const host of hosts) {
    try {
      return { host, out: await run(host) };
    } catch (err) {
      if (err.code !== 'UNREACHABLE') throw err;
      last = err;
    }
  }
  throw last;
}

/**
 * Tries every address at once (pairing: the first to answer wins, so a computer with several
 * network cards links as fast as its quickest one). → { host, out }
 */
async function raceHosts(hosts, run) {
  // An older Android WebView (before Chrome 85) has no Promise.any: one address at a time.
  if (hosts.length <= 1 || typeof Promise.any !== 'function') return tryHosts(hosts, run);
  try {
    return await Promise.any(hosts.map((host) => run(host).then((out) => ({ host, out }))));
  } catch (all) {
    const errors = all?.errors || [];
    throw errors.find((e) => e.code !== 'UNREACHABLE') || errors[0] || new LinkError(UNREACHABLE, 'UNREACHABLE');
  }
}

/**
 * Pairs with the KaTuroDesk whose QR code was scanned.
 * → the saved link: { deskId, deskName, deviceId, key, hosts, port, pairedAt }
 */
/**
 * uid = the KaTuro account signed in on the phone: KaTuroDesk links only a phone signed in to
 * the same account as KaTuroDesk itself.
 */
export async function pairWithDesk(qr, { deviceName = 'Phone', uid = '', fetchImpl = fetch } = {}) {
  const key = await importKey(b64uDecode(qr.key));
  const { host, out } = await raceHosts(qr.hosts, (h) => exchange({ host: h, port: qr.port, id: qr.id, key, op: 'pair', args: { deviceName, uid }, fetchImpl, timeoutMs: TRY_MS }));
  return {
    deskId: out.deskId,
    deskName: out.deskName || qr.deskName,
    deviceId: out.deviceId,
    key: out.key,
    hosts: [host, ...qr.hosts.filter((h) => h !== host)],
    port: qr.port,
    uid,
    pairedAt: new Date().toISOString(),
  };
}

/**
 * A client for a saved link. onLinkChange(link) is called when the Desk's addresses change,
 * so the app can save them (a laptop gets a new address on another Wi-Fi).
 */
export function createLinkClient(link, { fetchImpl = fetch, onLinkChange = () => {} } = {}) {
  let current = { ...link };
  let keyPromise = null;
  // Closed when the phone is unlinked or signs out: nothing may write the teacher's data back.
  let closed = false;
  const changed = (l) => { if (!closed) onLinkChange(l); };
  const key = () => (keyPromise ||= importKey(b64uDecode(current.key)));

  async function call(op, args = {}, { timeoutMs = op === 'ask' ? ASK_MS : SLOW_OPS.has(op) ? READ_MS : TRY_MS } = {}) {
    if (closed) throw new LinkError('This phone is no longer linked.', 'CLOSED');
    const k = await key();
    const { host, out } = await tryHosts(current.hosts, (h) => exchange({ host: h, port: current.port, id: current.deviceId, key: k, op, args, fetchImpl, timeoutMs }));
    if (host !== current.hosts[0]) {
      current = { ...current, hosts: [host, ...current.hosts.filter((h) => h !== host)] };
      changed(current);
    }
    if (closed) throw new LinkError('This phone is no longer linked.', 'CLOSED');
    return out.result;
  }

  return {
    get link() { return current; },
    /** True after close(): answers that arrive later must not be stored on the phone. */
    get closed() { return closed; },
    close() { closed = true; },
    /** Checks the link and learns the Desk's current addresses. */
    async hello() {
      const r = await call('hello');
      // The address that answered first, then the Desk's current ones; at most MAX_HOSTS to try.
      const fresh = [...new Set([current.hosts[0], ...(r.addresses || []), ...current.hosts])].filter(Boolean).slice(0, MAX_HOSTS);
      const moved = fresh.join() !== current.hosts.join() || (r.port && r.port !== current.port);
      if (moved) {
        current = { ...current, hosts: fresh, port: r.port || current.port, deskName: r.deskName || current.deskName };
        changed(current);
      }
      return r;
    },
    /** One folder of the KaTuro folder ('' = the top). → { path, items: [{ name, path, kind, size?, lastModified? }] } */
    list: (path = '') => call('list', { path }),
    /** Any other request KaTuroDesk answers (classes, class, record, rename, move, replace, …). options: { timeoutMs } */
    request: (op, args, options) => call(op, args, options),
    /** Sends a file into a folder KaTuroDesk lets this phone add to. → { path, name, size } */
    upload: (folder, name, bytes) => call('upload', { folder, name, data: bytesToBase64(bytes) }),
    /** One file. → { name, size, bytes: Uint8Array } */
    async read(path) {
      const r = await call('read', { path });
      return { name: r.name, size: r.size, bytes: decodeBase64(r.data) };
    },
  };
}
