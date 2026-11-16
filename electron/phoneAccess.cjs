/**
 * phoneAccess.cjs: what a linked phone may do in each folder (Settings → Phones → What phones
 * can see). KaTuroDesk decides; the phone only asks.
 *
 *   hidden  not shown on the phone
 *   view    browse and open files
 *   add     view, and send photos and files into it
 *   full    add, and rename, move and replace files (a replaced file is backed up first)
 *
 * A level belongs to a top folder of the KaTuro folder (Records, Lessons, …) or to an outside
 * folder the teacher added for phones, and covers everything inside it. Each phone has its own
 * levels; a folder nobody set uses its default:
 *   Records view (scores go in through the checked Scores flow only) · Lessons add ·
 *   other KaTuro folders view · an outside folder view once the teacher adds it.
 * KaTuro Backups never goes above view. Files lying loose in the KaTuro folder are view.
 *
 * Phone paths: "Lessons/Week 1/Cells.pdf" inside the KaTuro folder; ":Science Dept/Quiz.docx"
 * inside the outside folder labelled "Science Dept" (":" cannot be in a Windows folder name,
 * so the two never mix).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isInsideFolder } = require('./defaultFolders.cjs');

const LEVELS = ['hidden', 'view', 'add', 'full'];
const OUTSIDE = ':';
const BACKUPS = 'katuro backups';
const MAX_SHARED = 10;
// Never on the phone: dot-files, Office lock files, Windows' own files.
const HIDDEN = /^(\.|~\$|desktop\.ini$|thumbs\.db$|\$recycle\.bin$|system volume information$)/i;

const rank = (level) => LEVELS.indexOf(level);
const atLeast = (level, min) => rank(level) >= rank(min);
const validLevel = (level) => LEVELS.includes(level);

const homeKey = (topName) => `home:${String(topName).toLowerCase()}`;
const outKey = (id) => `out:${id}`;

function defaultLevel(key) {
  if (key === 'home:records') return 'view';
  if (key === 'home:lessons') return 'add';
  return 'view';
}
const maxLevel = (key) => (key === homeKey(BACKUPS) ? 'view' : 'full');

/** The level of `key` for a phone (its own setting, or the default), never above the folder's max. */
function levelFor(device, key) {
  const own = device?.access?.[key];
  const level = validLevel(own) ? own : defaultLevel(key);
  return rank(level) > rank(maxLevel(key)) ? maxLevel(key) : level;
}

const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };

/**
 * A phone path → { root, rel, abs, key, label, phonePath } or null when it is not a place a phone
 * may name (.., hidden parts, an unknown outside folder, or a shortcut leading outside).
 * key is null for the KaTuro folder itself (its loose files are view only).
 */
function resolvePhonePath(phonePath, { home, shared = [] }) {
  const clean = String(phonePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const parts = clean ? clean.split('/') : [];
  let root;
  let key;
  let label = '';
  let inner;
  if (parts[0]?.startsWith(OUTSIDE)) {
    const name = parts[0].slice(OUTSIDE.length).toLowerCase();
    const folder = shared.find((s) => s.name.toLowerCase() === name);
    if (!folder) return null;
    root = folder.path;
    key = outKey(folder.id);
    label = folder.name;
    inner = parts.slice(1);
  } else {
    root = home;
    key = parts.length ? homeKey(parts[0]) : null;
    inner = parts;
  }
  if (inner.some((p) => p === '..' || p === '.' || HIDDEN.test(p))) return null;
  const abs = path.resolve(root, ...inner);
  if (!isInsideFolder(abs, root)) return null;
  // A shortcut (junction or link) inside the folder must not lead out of it.
  if (fs.existsSync(abs) && !isInsideFolder(real(abs), real(root))) return null;
  const rel = inner.join('/');
  // Inside an outside folder, its own KaTuro Backups is view only as well.
  if (label && inner[0]?.toLowerCase() === BACKUPS) key = `${key}|backups`;
  return { root, rel, abs, key, label, phonePath: label ? [`${OUTSIDE}${label}`, ...inner].join('/') : rel };
}

/** The level a phone has at a resolved place. */
function levelAt(device, place) {
  if (!place.key) return 'view';
  if (place.key.endsWith('|backups')) {
    const outer = levelFor(device, place.key.slice(0, -'|backups'.length));
    return atLeast(outer, 'view') ? 'view' : 'hidden';
  }
  return levelFor(device, place.key);
}

/** An absolute path inside a place's root → its phone path. */
function phonePathOf(place, abs) {
  const rel = path.relative(place.root, abs).split(path.sep).join('/');
  return place.label ? (rel ? `${OUTSIDE}${place.label}/${rel}` : `${OUTSIDE}${place.label}`) : rel;
}

/** The KaTuro folder's top folders (for Settings), Backups last. */
function homeFolders(home) {
  let names = [];
  try {
    names = fs.readdirSync(home, { withFileTypes: true }).filter((e) => e.isDirectory() && !HIDDEN.test(e.name)).map((e) => e.name);
  } catch { /* the KaTuro folder is made on start; empty until then */ }
  const order = (n) => (n.toLowerCase() === 'records' ? 0 : n.toLowerCase() === 'lessons' ? 1 : n.toLowerCase() === BACKUPS ? 3 : 2);
  return names.sort((a, b) => order(a) - order(b) || a.localeCompare(b));
}

/**
 * Checks a folder the teacher wants phones to see. → { id, name, path } or throws with a plain
 * reason. Refused: drive roots, Windows and program folders, app data, the teacher's whole user
 * folder (or one holding it), the KaTuro folder itself (it is already there) and folders that
 * overlap one already added.
 */
function checkSharedFolder(dir, { home, shared = [], profile, protectedPaths = [], systemPaths = [] }) {
  const fail = (msg) => { throw Object.assign(new Error(msg), { code: 'NOT_ALLOWED' }); };
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) fail('That folder cannot be found.');
  if (shared.length >= MAX_SHARED) fail(`Up to ${MAX_SHARED} folders can be added for phones.`);
  const abs = path.resolve(dir);
  const both = [abs, real(abs)];
  const overlaps = (a, b) => isInsideFolder(a, b) || isInsideFolder(b, a);
  if (both.some((p) => path.parse(p).root === p)) fail('Choose a folder, not a whole drive.');
  for (const sys of systemPaths.filter(Boolean)) if (both.some((p) => isInsideFolder(p, sys))) fail('Windows and program folders cannot be shown on the phone.');
  for (const keep of protectedPaths.filter(Boolean)) if (both.some((p) => isInsideFolder(keep, p))) fail('That folder holds KaTuroDesk\'s own files. Choose a folder with your school files.');
  if (profile && both.some((p) => isInsideFolder(profile, p))) fail('That is your whole user folder. Choose a folder inside it, for example Documents\\Science.');
  if (home && both.some((p) => overlaps(p, home) || overlaps(p, real(home)))) fail('Your KaTuro folder is already on the phone. Set its folders\' levels in the list.');
  for (const s of shared) if (both.some((p) => overlaps(p, s.path))) fail(`That folder overlaps "${s.name}", which phones can already see.`);
  const base = path.basename(abs).replace(/[/:]/g, ' ').trim() || 'Folder';
  const taken = new Set(shared.map((s) => s.name.toLowerCase()));
  let name = base;
  for (let i = 2; taken.has(name.toLowerCase()); i += 1) name = `${base} (${i})`;
  return { id: crypto.randomBytes(6).toString('base64url'), name, path: abs, addedAt: new Date().toISOString() };
}

module.exports = { LEVELS, OUTSIDE, HIDDEN, atLeast, validLevel, homeKey, outKey, defaultLevel, maxLevel, levelFor, levelAt, resolvePhonePath, phonePathOf, homeFolders, checkSharedFolder };
