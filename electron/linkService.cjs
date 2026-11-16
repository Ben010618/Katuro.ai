/**
 * linkService.cjs — the KaTuro App (phone) talks to KaTuroDesk over the same Wi-Fi or the
 * phone's hotspot. No internet, no cloud: learner records never leave the room.
 *
 * Pairing (once per phone):
 *   KaTuroDesk shows a QR code holding this computer's addresses and a fresh random key.
 *   The phone reads it with its camera, so the key never travels over the network. The
 *   phone's first message (encrypted with that key) asks to pair; KaTuroDesk answers with
 *   the phone's own long-term key (encrypted too). A pairing QR works once, for 10 minutes.
 *
 * Every message after that:
 *   POST /link  { v: 1, id: <phone id>, iv, ct }   AES-256-GCM, per-phone key
 *   - the request carries a time and a one-off nonce (old or replayed messages are refused)
 *   - the answer is bound to that nonce, so it can't be swapped for another answer
 *   Anyone on the same Wi-Fi sees only scrambled bytes.
 *
 * What a paired phone can do: see the KaTuro folder (Records, Lessons and any other folder)
 * and open its files (answered here, paths always kept inside the KaTuro folder); the other
 * requests (class records, recording scores, bubble quizzes) go to the KaTuroDesk window
 * through askDesk(op, args, device), see src/services/link/deskRequests.js.
 *
 * Phone keys are saved encrypted (Windows DPAPI through Electron's safeStorage) in
 * linked-phones.json in KaTuroDesk's app data. The teacher can remove a phone at any time.
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 1;
const PAIR_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
// A file sent from the phone (up to 25 MB) arrives base64-encoded inside the encrypted message.
const MAX_REQUEST_BYTES = 40 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// Folders a phone may add files to (and their subfolders). The others are view only.
const WRITABLE_TOP = ['records', 'lessons'];
// What a phone may send: documents, pictures, sound and video for lessons. Never programs,
// and no formats that can carry macros (.docm/.xlsm/.pptm, old .doc/.xls/.ppt).
const UPLOAD_TYPES = /\.(pdf|docx|xlsx|pptx|csv|txt|rtf|odt|ods|odp|jpe?g|png|webp|heic|heif|gif|bmp|mp3|m4a|wav|ogg|mp4|mov|3gp|webm)$/i;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_DEVICES = 10;
const MAX_LIST = 2000;
const PREFERRED_PORT = 47821;
const QR_PREFIX = 'KTLINK1:';
const HIDDEN = /^(\.|~\$|desktop\.ini$|thumbs\.db$|\$recycle\.bin$|system volume information$)/i;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(String(s || ''), 'base64url');
const aad = (id, kind, nonce = '') => Buffer.from(`katuro-link|${id}|${kind}${nonce ? `|${nonce}` : ''}`);

/** AES-256-GCM: → { iv, ct } with the 16-byte tag at the end of ct (WebCrypto's layout). */
function seal(key, obj, additional) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(additional);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj))), c.final(), c.getAuthTag()]);
  return { iv: b64u(iv), ct: b64u(ct) };
}

function open(key, { iv, ct }, additional) {
  const ivBuf = unb64u(iv);
  const all = unb64u(ct);
  if (ivBuf.length !== 12 || all.length < 17) throw new Error('bad message');
  const d = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
  d.setAAD(additional);
  d.setAuthTag(all.subarray(all.length - 16));
  return JSON.parse(Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]).toString('utf8'));
}

/** `rel` (forward slashes, relative to the KaTuro folder) → an absolute path inside it, or null. */
function insideHome(home, rel) {
  const clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (clean.split('/').some((p) => p === '..' || HIDDEN.test(p))) return null;
  const abs = path.resolve(home, clean);
  const r = path.relative(path.resolve(home), abs);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)) ? abs : null;
}

function plainJson(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS });
  res.end(JSON.stringify(body));
}

// The phone app's page runs at https://localhost (Capacitor), so the browser asks first.
// Everything is encrypted with a key only paired phones have, so any origin may ask.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
  'Access-Control-Max-Age': '600',
};

/**
 * home()        → the KaTuro folder (absolute), made if missing
 * storeFile     → where paired phones are saved (JSON)
 * protect       → { encrypt(Buffer) → string, decrypt(string) → Buffer } (safeStorage in the app)
 * deskName      → shown on the phone ("Teacher's laptop")
 * addresses()   → [{ address, name }] this computer's LAN addresses (phoneCapture.lanAddresses)
 * onChange(st)  → after pairing / removing / a phone being seen
 * askDesk(op, args, device) → Promise of the answer from the KaTuroDesk window (optional)
 * onFileAdded({ path, name, size, phone }) → after a phone sent a file into Records / Lessons
 */
function createLinkService({ home, storeFile, protect, deskName = 'KaTuroDesk', addresses = () => [], onChange = () => {}, askDesk = null, onFileAdded = () => {}, account: startAccount = '', now = () => Date.now() }) {
  let server = null;
  // The KaTuro account signed in on KaTuroDesk ('' = signed out): phones are linked to it.
  let account = String(startAccount || '');
  let port = null;
  let pairing = null; // { id, key, expiresAt }
  const sockets = new Set();

  // Nonces already used, with their expiry. Kept in a file next to the phones list, so a
  // message captured on the Wi-Fi cannot be replayed after KaTuroDesk restarts either.
  const seenFile = path.join(path.dirname(storeFile), 'linked-phones-seen.json');
  const seen = new Map(); // nonce → expiry
  try {
    for (const [n, exp] of JSON.parse(fs.readFileSync(seenFile, 'utf8'))) if (exp > now()) seen.set(n, exp);
  } catch { /* first run, or unreadable: start empty */ }
  const saveSeen = () => {
    // Written to a temporary file and renamed, so a crash mid-write never leaves a broken file.
    try {
      fs.writeFileSync(`${seenFile}.tmp`, JSON.stringify([...seen]));
      fs.renameSync(`${seenFile}.tmp`, seenFile);
    } catch { /* not critical: the clock window still applies */ }
  };

  // ── saved phones ──
  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
      return { deskId: raw.deskId || b64u(crypto.randomBytes(9)), devices: Array.isArray(raw.devices) ? raw.devices : [] };
    } catch {
      return { deskId: b64u(crypto.randomBytes(9)), devices: [] };
    }
  }
  let store = load();
  function save() {
    fs.mkdirSync(path.dirname(storeFile), { recursive: true });
    fs.writeFileSync(storeFile, JSON.stringify(store, null, 2));
  }
  if (!fs.existsSync(storeFile)) {
    try { save(); } catch { /* app data not writable: pairing still works this session */ }
  }
  const keyOf = (device) => {
    try { return protect.decrypt(device.key); } catch { return null; }
  };
  const publicDevice = ({ id, name, pairedAt, lastSeen }) => ({ id, name, pairedAt, lastSeen: lastSeen || null });
  const status = () => ({
    running: Boolean(server),
    port,
    addresses: addresses().map((a) => a.address),
    deskId: store.deskId,
    deskName,
    devices: store.devices.map(publicDevice),
    pairing: pairing && pairing.expiresAt > now() ? { expiresAt: pairing.expiresAt } : null,
  });

  // ── what a phone may ask ──
  function list(rel) {
    const root = home();
    const abs = insideHome(root, rel);
    if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw Object.assign(new Error('That folder is not in your KaTuro folder.'), { code: 'NOT_FOUND' });
    const items = fs.readdirSync(abs, { withFileTypes: true })
      .filter((e) => !HIDDEN.test(e.name) && (e.isDirectory() || e.isFile()))
      .slice(0, MAX_LIST)
      .map((e) => {
        const full = path.join(abs, e.name);
        const st = fs.statSync(full);
        const relPath = path.relative(root, full).split(path.sep).join('/');
        return e.isDirectory()
          ? { name: e.name, path: relPath, kind: 'directory' }
          : { name: e.name, path: relPath, kind: 'file', size: st.size, lastModified: st.mtimeMs };
      })
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));
    return { path: path.relative(root, abs).split(path.sep).join('/'), items };
  }

  function read(rel) {
    const abs = insideHome(home(), rel);
    if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw Object.assign(new Error('That file is not in your KaTuro folder.'), { code: 'NOT_FOUND' });
    const size = fs.statSync(abs).size;
    if (size > MAX_FILE_BYTES) throw Object.assign(new Error(`This file is too big to open on the phone (${Math.round(size / 1048576)} MB; up to 25 MB). Open it on KaTuroDesk.`), { code: 'TOO_BIG' });
    return { name: path.basename(abs), size, data: fs.readFileSync(abs).toString('base64') };
  }

  const cleanName = (name) => String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 120);

  /** Saves a file from the phone into Records or Lessons (or a folder inside them), never over an existing file. */
  function upload({ folder, name, data } = {}, device) {
    const root = home();
    const rel = String(folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!WRITABLE_TOP.includes(rel.split('/')[0].toLowerCase())) throw Object.assign(new Error('Files from the phone can go into Records or Lessons only.'), { code: 'NOT_ALLOWED' });
    const dir = insideHome(root, rel);
    if (!dir) throw Object.assign(new Error('That folder is not in your KaTuro folder.'), { code: 'NOT_FOUND' });
    const file = cleanName(name);
    if (!file || !UPLOAD_TYPES.test(file)) throw Object.assign(new Error('KaTuro takes documents, pictures, sound and video files only.'), { code: 'NOT_ALLOWED' });
    const bytes = Buffer.from(String(data || ''), 'base64');
    if (!bytes.length) throw Object.assign(new Error('The file is empty.'), { code: 'EMPTY' });
    if (bytes.length > MAX_UPLOAD_BYTES) throw Object.assign(new Error('This file is too big to send (up to 25 MB).'), { code: 'TOO_BIG' });
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(file);
    const base = file.slice(0, file.length - ext.length);
    for (let i = 1; i < 1000; i += 1) {
      const candidate = i === 1 ? file : `${base} (${i})${ext}`;
      const full = path.join(dir, candidate);
      try {
        fs.writeFileSync(full, bytes, { flag: 'wx' });
      } catch (err) {
        if (err.code === 'EEXIST') continue;
        throw err;
      }
      const savedPath = path.relative(root, full).split(path.sep).join('/');
      onFileAdded({ path: savedPath, name: candidate, size: bytes.length, phone: device?.name || 'Phone' });
      return { path: savedPath, name: candidate, size: bytes.length };
    }
    throw new Error('Too many files with this name in that folder.');
  }

  const LOCAL_OPS = new Set(['hello', 'list', 'read', 'upload']);
  async function handle(op, args, device) {
    if (op === 'hello') {
      return { deskId: store.deskId, deskName, version: VERSION, port, addresses: addresses().map((a) => a.address), phone: device.name };
    }
    if (op === 'list') return list(args?.path || '');
    if (op === 'read') return read(args?.path || '');
    if (op === 'upload') return upload(args, device);
    if (askDesk && typeof op === 'string' && !LOCAL_OPS.has(op)) return askDesk(op, args || {}, { id: device.id, name: device.name });
    throw Object.assign(new Error('KaTuroDesk does not know that request. Update KaTuroDesk.'), { code: 'UNKNOWN_OP' });
  }

  function freshNonce(nonce, ts) {
    const t = now();
    for (const [n, exp] of seen) if (exp < t) seen.delete(n);
    if (typeof nonce !== 'string' || nonce.length < 16 || nonce.length > 64) return false;
    if (!Number.isFinite(ts) || Math.abs(t - ts) > CLOCK_SKEW_MS) return false;
    if (seen.has(nonce)) return false;
    seen.set(nonce, t + 2 * CLOCK_SKEW_MS);
    saveSeen();
    return true;
  }

  async function onMessage(env) {
    const id = String(env?.id || '');
    // Pairing message: encrypted with the key from the QR code on the screen.
    if (pairing && id === pairing.id) {
      if (pairing.expiresAt < now()) { pairing = null; return { code: 401, plain: { error: 'This QR code has expired. Show a new one in KaTuroDesk.' } }; }
      const key = pairing.key;
      let req;
      try { req = open(key, env, aad(id, 'req')); } catch { return { code: 401, plain: { error: 'This QR code is not valid.' } }; }
      if (req.op !== 'pair' || !freshNonce(req.nonce, req.ts)) return { code: 400, plain: { error: 'Bad pairing request.' } };
      const refuse = (error, code) => ({ code: 200, sealed: seal(key, { error, code }, aad(id, 'res', req.nonce)) });
      if (store.devices.length >= MAX_DEVICES) return refuse(`Up to ${MAX_DEVICES} phones can be linked. Remove one in KaTuroDesk first.`, 'TOO_MANY');
      // One KaTuro account on both sides: the phone must be signed in as the teacher on KaTuroDesk.
      const phoneUid = String(req.args?.uid || '');
      if (!account) return refuse('Sign in to KaTuroDesk on the computer first, then show a new code.', 'DESK_SIGNED_OUT');
      if (phoneUid !== account) return refuse('This phone is signed in to a different KaTuro account than KaTuroDesk. Sign in with the same account on both, then link again.', 'WRONG_ACCOUNT');
      const deviceId = b64u(crypto.randomBytes(12));
      const deviceKey = crypto.randomBytes(32);
      const name = String(req.args?.deviceName || 'Phone').replace(/[\u0000-\u001f]/g, '').slice(0, 60) || 'Phone';
      const device = { id: deviceId, name, uid: account, key: protect.encrypt(deviceKey), pairedAt: new Date(now()).toISOString(), lastSeen: new Date(now()).toISOString() };
      // Saved first: a phone that could not be saved is not linked (and leaves nothing behind).
      store = { ...store, devices: [...store.devices, device] };
      try {
        save();
      } catch {
        store = { ...store, devices: store.devices.filter((d) => d.id !== deviceId) };
        return { code: 200, sealed: seal(key, { error: 'KaTuroDesk could not save this phone. Try again.' }, aad(id, 'res', req.nonce)) };
      }
      pairing = null; // one phone per QR code
      onChange(status());
      return { code: 200, sealed: seal(key, { ok: true, deviceId, key: b64u(deviceKey), deskId: store.deskId, deskName }, aad(id, 'res', req.nonce)) };
    }

    const device = store.devices.find((d) => d.id === id);
    const key = device && keyOf(device);
    if (!key) return { code: 401, plain: { error: 'This phone is not linked to this KaTuroDesk. Link it again from KaTuroDesk Settings → Phones.', code: 'NOT_LINKED' } };
    let req;
    try { req = open(key, env, aad(id, 'req')); } catch { return { code: 401, plain: { error: 'This phone is not linked to this KaTuroDesk.', code: 'NOT_LINKED' } }; }
    if (!freshNonce(req.nonce, req.ts)) return { code: 400, plain: { error: "The phone's clock or message is off. Check the phone's date and time.", code: 'STALE' } };
    // KaTuroDesk is now signed in to another account (or signed out): that teacher's phone is not served.
    if (!device.uid) {
      // Linked before phones were tied to an account: link it again (from KaTuroDesk Settings → Phones).
      return { code: 401, plain: { error: 'Link this phone again from KaTuroDesk Settings → Phones.', code: 'NOT_LINKED' } };
    }
    if (!account || device.uid !== account) {
      return { code: 200, sealed: seal(key, { error: 'KaTuroDesk is not signed in to your KaTuro account right now. Sign in on the computer with the same account as this phone.', code: 'OTHER_ACCOUNT' }, aad(id, 'res', req.nonce)) };
    }
    let body;
    try {
      body = { ok: true, result: await handle(req.op, req.args || {}, device) };
    } catch (err) {
      body = { error: err.message, code: err.code || 'ERROR', ...(err.details ? { details: err.details } : {}) };
    }
    const today = new Date(now()).toISOString();
    if (!device.lastSeen || today.slice(0, 13) !== String(device.lastSeen).slice(0, 13)) {
      device.lastSeen = today;
      try { save(); } catch { /* not critical */ }
      onChange(status());
    }
    return { code: 200, sealed: seal(key, body, aad(id, 'res', req.nonce)) };
  }

  function onRequest(req, res) {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    const url = new URL(req.url, 'http://x');
    if (req.method !== 'POST' || url.pathname !== '/link') return plainJson(res, 404, { error: 'Not found.' });
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_REQUEST_BYTES) { tooBig = true; req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', async () => {
      if (tooBig) return undefined;
      let env;
      try { env = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return plainJson(res, 400, { error: 'Bad request.' }); }
      if (env?.v !== VERSION) return plainJson(res, 400, { error: 'Update the KaTuro App and KaTuroDesk to the same version.', code: 'VERSION' });
      let out;
      try {
        out = await onMessage(env);
      } catch (err) {
        console.error('[link]', err);
        return plainJson(res, 500, { error: 'KaTuroDesk could not answer. Try again.', code: 'DESK_ERROR' });
      }
      if (out.plain) return plainJson(res, out.code, out.plain);
      return plainJson(res, out.code, { v: VERSION, ...out.sealed });
    });
    return undefined;
  }

  return {
    status,
    /** Starts listening on the LAN (port 47821 if free, any free port otherwise). */
    start(wanted = PREFERRED_PORT) {
      if (server) return Promise.resolve(status());
      const listen = (p) => new Promise((resolve, reject) => {
        const s = http.createServer(onRequest);
        s.requestTimeout = 60000;
        s.on('connection', (sock) => { sockets.add(sock); sock.on('close', () => sockets.delete(sock)); });
        s.once('error', reject);
        s.listen(p, '0.0.0.0', () => resolve(s));
      });
      return listen(wanted).catch(() => listen(0)).then((s) => {
        server = s;
        port = s.address().port;
        return status();
      });
    },
    stop() {
      if (!server) return;
      try { server.close(); } catch { /* already closed */ }
      for (const s of sockets) s.destroy();
      server = null;
      port = null;
    },
    /** A new pairing QR code (replaces any earlier one). → { qrText, expiresAt } */
    beginPairing() {
      if (!server) throw new Error('The phone link is not running.');
      pairing = { id: `p-${b64u(crypto.randomBytes(12))}`, key: crypto.randomBytes(32), expiresAt: now() + PAIR_MS };
      const payload = { v: VERSION, id: pairing.id, k: b64u(pairing.key), h: addresses().map((a) => a.address), p: port, n: deskName, d: store.deskId };
      onChange(status());
      return { qrText: QR_PREFIX + b64u(Buffer.from(JSON.stringify(payload))), expiresAt: pairing.expiresAt };
    },
    cancelPairing() {
      pairing = null;
      onChange(status());
    },
    /** The KaTuro account signed in on KaTuroDesk now ('' when signed out). */
    setAccount(uid) {
      account = String(uid || '');
      if (pairing && !account) pairing = null;
      onChange(status());
    },
    removeDevice(id) {
      const before = store.devices.length;
      store.devices = store.devices.filter((d) => d.id !== id);
      if (store.devices.length !== before) { save(); onChange(status()); }
      return status();
    },
  };
}

module.exports = { createLinkService, insideHome };
