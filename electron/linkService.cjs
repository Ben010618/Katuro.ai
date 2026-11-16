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
 * What a paired phone can do with files is set per folder and per phone in KaTuroDesk
 * (phoneAccess.cjs: hidden / view / add / full) and checked here on every request: list, read,
 * upload, and for "full" folders rename, move and replace (a backup first). Paths always stay
 * inside the KaTuro folder or a folder the teacher added for phones. The other requests (class
 * records, recording scores, bubble quizzes, the Assistant) go to the KaTuroDesk window through
 * askDesk(op, args, device), see src/services/link/deskRequests.js.
 *
 * Phone keys are saved encrypted (Windows DPAPI through Electron's safeStorage) in
 * linked-phones.json in KaTuroDesk's app data. The teacher can remove a phone at any time.
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isInsideFolder } = require('./defaultFolders.cjs');
const access = require('./phoneAccess.cjs');

const VERSION = 1;
const PAIR_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
// A file sent from the phone (up to 25 MB) arrives base64-encoded inside the encrypted message.
const MAX_REQUEST_BYTES = 40 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// What a phone may send: documents, pictures, sound and video for lessons. Never programs,
// and no formats that can carry macros (.docm/.xlsm/.pptm, old .doc/.xls/.ppt).
const UPLOAD_TYPES = /\.(pdf|docx|xlsx|pptx|csv|txt|rtf|odt|ods|odp|jpe?g|png|webp|heic|heif|gif|bmp|mp3|m4a|wav|ogg|mp4|mov|3gp|webm)$/i;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_DEVICES = 10;
const MAX_LIST = 2000;
const PREFERRED_PORT = 47821;
const QR_PREFIX = 'KTLINK1:';
const { HIDDEN } = access;

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
  return isInsideFolder(abs, home) ? abs : null;
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
 * onFileAdded({ path, name, size, phone }) → after a phone sent, renamed, moved or replaced a file
 * guard         → { profile, protectedPaths, systemPaths } for folders added for phones (phoneAccess.checkSharedFolder)
 */
function createLinkService({ home, storeFile, protect, deskName = 'KaTuroDesk', addresses = () => [], onChange = () => {}, askDesk = null, onFileAdded = () => {}, account: startAccount = '', guard = {}, now = () => Date.now() }) {
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
      return { deskId: raw.deskId || b64u(crypto.randomBytes(9)), devices: Array.isArray(raw.devices) ? raw.devices : [], shared: Array.isArray(raw.shared) ? raw.shared : [] };
    } catch {
      return { deskId: b64u(crypto.randomBytes(9)), devices: [], shared: [] };
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
  // The folders a teacher can set levels for: the KaTuro folder's top folders, then the outside
  // folders added for phones.
  const folders = () => [
    ...access.homeFolders(home()).map((name) => ({ key: access.homeKey(name), name, kind: 'home', max: access.maxLevel(access.homeKey(name)) })),
    ...store.shared.map((s) => ({ key: access.outKey(s.id), id: s.id, name: s.name, kind: 'outside', path: s.path, max: 'full' })),
  ];
  const publicDevice = (d, list) => ({
    id: d.id, name: d.name, pairedAt: d.pairedAt, lastSeen: d.lastSeen || null,
    levels: Object.fromEntries(list.map((f) => [f.key, access.levelFor(d, f.key)])),
  });
  const status = () => {
    const list = folders();
    return {
      running: Boolean(server),
      port,
      addresses: addresses().map((a) => a.address),
      deskId: store.deskId,
      deskName,
      devices: store.devices.map((d) => publicDevice(d, list)),
      folders: list,
      pairing: pairing && pairing.expiresAt > now() ? { expiresAt: pairing.expiresAt } : null,
    };
  };

  // ── what a phone may ask (every file request checks the phone's level for that folder) ──
  const notFound = (msg = 'That folder or file is not on this computer for your phone.') => Object.assign(new Error(msg), { code: 'NOT_FOUND' });
  const refused = (msg) => Object.assign(new Error(msg), { code: 'NOT_ALLOWED' });
  /** A phone path → a place the phone may use at `min` level, or throws. */
  function place(phonePath, device, min = 'view') {
    const p = access.resolvePhonePath(phonePath, { home: home(), shared: store.shared });
    if (!p) throw notFound();
    const level = access.levelAt(device, p);
    if (!access.atLeast(level, 'view')) throw notFound();
    if (!access.atLeast(level, min)) {
      throw refused(min === 'add'
        ? 'Your phone can only view this folder. To send files here, change it in KaTuroDesk Settings → Phones.'
        : 'Renaming, moving and replacing files here is not allowed for this phone. Change it in KaTuroDesk Settings → Phones.');
    }
    return { ...p, level };
  }
  const entry = (p, device, full, name, isDir) => {
    const phonePath = access.phonePathOf(p, full);
    const sub = access.resolvePhonePath(phonePath, { home: home(), shared: store.shared });
    const level = sub ? access.levelAt(device, sub) : 'hidden';
    if (!access.atLeast(level, 'view')) return null;
    if (isDir) return { name, path: phonePath, kind: 'directory', access: level };
    const st = fs.statSync(full);
    return { name, path: phonePath, kind: 'file', size: st.size, lastModified: st.mtimeMs, access: level };
  };

  function list(rel, device) {
    const p = place(rel, device);
    if (!fs.existsSync(p.abs) || !fs.statSync(p.abs).isDirectory()) throw notFound();
    const items = fs.readdirSync(p.abs, { withFileTypes: true })
      .filter((e) => !HIDDEN.test(e.name) && (e.isDirectory() || e.isFile()))
      .slice(0, MAX_LIST)
      .map((e) => entry(p, device, path.join(p.abs, e.name), e.name, e.isDirectory()))
      .filter(Boolean);
    // The top of the KaTuro folder also shows the outside folders added for this phone.
    if (!p.key) {
      for (const s of store.shared) {
        const level = access.levelFor(device, access.outKey(s.id));
        if (access.atLeast(level, 'view') && fs.existsSync(s.path)) items.push({ name: s.name, path: `${access.OUTSIDE}${s.name}`, kind: 'directory', access: level, outside: true });
      }
    }
    items.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));
    return { path: p.phonePath, access: p.level, items };
  }

  function read(rel, device) {
    const p = place(rel, device);
    if (!fs.existsSync(p.abs) || !fs.statSync(p.abs).isFile()) throw notFound('That file is not on this computer for your phone.');
    const size = fs.statSync(p.abs).size;
    if (size > MAX_FILE_BYTES) throw Object.assign(new Error(`This file is too big to open on the phone (${Math.round(size / 1048576)} MB; up to 25 MB). Open it on KaTuroDesk.`), { code: 'TOO_BIG' });
    return { name: path.basename(p.abs), size, data: fs.readFileSync(p.abs).toString('base64') };
  }

  const cleanName = (name) => String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 120);
  const fileBytes = (data) => {
    const bytes = Buffer.from(String(data || ''), 'base64');
    if (!bytes.length) throw Object.assign(new Error('The file is empty.'), { code: 'EMPTY' });
    if (bytes.length > MAX_UPLOAD_BYTES) throw Object.assign(new Error('This file is too big to send (up to 25 MB).'), { code: 'TOO_BIG' });
    return bytes;
  };
  const locked = (err) => (/EBUSY|EPERM|EACCES/.test(String(err?.code))
    ? Object.assign(new Error('That file is open on the computer (for example in Excel or Word). Close it there, then try again.'), { code: 'FILE_OPEN' })
    : err);
  const told = (p, abs, size, device) => onFileAdded({ path: access.phonePathOf(p, abs), name: path.basename(abs), size, phone: device?.name || 'Phone' });

  /** Saves a file from the phone into a folder the phone may add to, never over an existing file. */
  function upload({ folder, name, data } = {}, device) {
    const p = place(folder, device, 'add');
    if (!p.key) throw refused('Open a folder first, for example Lessons, then send the file there.');
    const file = cleanName(name);
    if (!file || !UPLOAD_TYPES.test(file)) throw refused('KaTuro takes documents, pictures, sound and video files only.');
    const bytes = fileBytes(data);
    fs.mkdirSync(p.abs, { recursive: true });
    const ext = path.extname(file);
    const base = file.slice(0, file.length - ext.length);
    for (let i = 1; i < 1000; i += 1) {
      const candidate = i === 1 ? file : `${base} (${i})${ext}`;
      const full = path.join(p.abs, candidate);
      try {
        fs.writeFileSync(full, bytes, { flag: 'wx' });
      } catch (err) {
        if (err.code === 'EEXIST') continue;
        throw err;
      }
      told(p, full, bytes.length, device);
      return { path: access.phonePathOf(p, full), name: candidate, size: bytes.length };
    }
    throw new Error('Too many files with this name in that folder.');
  }

  /** A file (not a folder) the phone may change: inside a "full" folder, never a top folder itself. */
  function changeable(rel, device) {
    const p = place(rel, device, 'full');
    if (!p.key || !p.rel) throw refused('KaTuro folders themselves cannot be changed from the phone.');
    if (!fs.existsSync(p.abs) || !fs.statSync(p.abs).isFile()) throw notFound('That file is not on this computer for your phone.');
    return p;
  }

  function rename({ path: rel, name } = {}, device) {
    const p = changeable(rel, device);
    const file = cleanName(name);
    const ext = path.extname(p.abs);
    if (!file) throw refused('Type a name.');
    if (path.extname(file).toLowerCase() !== ext.toLowerCase()) throw refused(`Keep the ${ext} ending.`);
    const target = path.join(path.dirname(p.abs), file);
    if (target === p.abs) return { path: access.phonePathOf(p, p.abs), name: file };
    if (fs.existsSync(target) && target.toLowerCase() !== p.abs.toLowerCase()) throw refused('A file with that name is already there.');
    try { fs.renameSync(p.abs, target); } catch (err) { throw locked(err); }
    told(p, target, fs.statSync(target).size, device);
    return { path: access.phonePathOf(p, target), name: file };
  }

  function move({ path: rel, to } = {}, device) {
    const p = changeable(rel, device);
    const dest = place(to, device, 'full');
    if (!dest.key) throw refused('Choose a folder to move it into.');
    if (dest.root !== p.root) throw refused('Files can be moved inside the same main folder only. Move it on the computer.');
    if (!fs.existsSync(dest.abs) || !fs.statSync(dest.abs).isDirectory()) throw notFound('That folder is not there any more.');
    const target = path.join(dest.abs, path.basename(p.abs));
    if (target === p.abs) return { path: access.phonePathOf(p, p.abs) };
    if (fs.existsSync(target)) throw refused('A file with that name is already in that folder.');
    try { fs.renameSync(p.abs, target); } catch (err) { throw locked(err); }
    told(p, target, fs.statSync(target).size, device);
    return { path: access.phonePathOf(p, target) };
  }

  /** Puts a file from the phone in place of an existing one; the old one goes to KaTuro Backups first. */
  function replace({ path: rel, name, data } = {}, device) {
    const p = changeable(rel, device);
    const ext = path.extname(p.abs);
    if (name && path.extname(String(name)).toLowerCase() !== ext.toLowerCase()) throw refused(`Choose a ${ext} file to put in its place.`);
    const bytes = fileBytes(data);
    const d = new Date(now());
    const pad = (n) => String(n).padStart(2, '0');
    const relDir = path.relative(p.root, path.dirname(p.abs));
    const base = path.basename(p.abs, ext);
    const backup = path.join(p.root, 'KaTuro Backups', `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, relDir, `${base} (backup ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())})${ext}`);
    const temp = `${p.abs}.katuro-new`;
    try {
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(p.abs, backup, fs.constants.COPYFILE_EXCL);
      fs.writeFileSync(temp, bytes);
      fs.renameSync(temp, p.abs);
    } catch (err) {
      try { fs.rmSync(temp, { force: true }); } catch { /* nothing written */ }
      throw locked(err);
    }
    told(p, p.abs, bytes.length, device);
    return { path: access.phonePathOf(p, p.abs), size: bytes.length, backup: access.phonePathOf(p, backup) };
  }

  const LOCAL_OPS = new Set(['hello', 'list', 'read', 'upload', 'rename', 'move', 'replace']);
  async function handle(op, args, device) {
    if (op === 'hello') {
      return { deskId: store.deskId, deskName, version: VERSION, port, addresses: addresses().map((a) => a.address), phone: device.name };
    }
    if (op === 'list') return list(args?.path || '', device);
    if (op === 'read') return read(args?.path || '', device);
    if (op === 'upload') return upload(args, device);
    if (op === 'rename') return rename(args, device);
    if (op === 'move') return move(args, device);
    if (op === 'replace') return replace(args, device);
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
      const device = { id: deviceId, name, uid: account, key: protect.encrypt(deviceKey), pairedAt: new Date(now()).toISOString(), lastSeen: new Date(now()).toISOString(), access: {} };
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
    /** What one phone may do in one folder (Settings → Phones). */
    setAccess(deviceId, key, level) {
      const device = store.devices.find((d) => d.id === deviceId);
      const folder = folders().find((f) => f.key === key);
      if (!device || !folder || !access.validLevel(level)) throw new Error('That phone or folder is not there any more.');
      if (access.LEVELS.indexOf(level) > access.LEVELS.indexOf(folder.max)) throw new Error(`${folder.name} can be set up to "${folder.max}" only.`);
      device.access = { ...(device.access || {}), [key]: level };
      save();
      onChange(status());
      return status();
    },
    /** A folder outside the KaTuro folder that phones may see (view, until the teacher changes it). */
    addShared(dir) {
      const folder = access.checkSharedFolder(dir, { home: home(), shared: store.shared, ...guard });
      store = { ...store, shared: [...store.shared, folder] };
      save();
      onChange(status());
      return status();
    },
    removeShared(id) {
      const key = access.outKey(id);
      store = { ...store, shared: store.shared.filter((s) => s.id !== id) };
      for (const d of store.devices) if (d.access) delete d.access[key];
      save();
      onChange(status());
      return status();
    },
  };
}

module.exports = { createLinkService, insideHome };
