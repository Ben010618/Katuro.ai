/**
 * defaultFolders.cjs — the teacher's KaTuro home folder, made the first time KaTuroDesk runs.
 *
 *   Desktop\Katuro Teaching Assistant\
 *     Records\   Excel class records for every class the teacher handles
 *     Lessons\   PDFs, Word, PowerPoint and other learning materials
 *
 * Records and Lessons are the two main folders KaTuroDesk and the KaTuro App work on
 * together. Teachers can add more folders, and can move the whole home folder anywhere
 * (Settings → Documents → KaTuro folder location). The chosen place is saved in a small
 * settings file in the app's data folder.
 *
 * Earlier versions used Documents\KaTuro. A teacher who already has files there keeps it;
 * an empty one is tidied away and the new Desktop folder is used instead.
 *
 * Made on first launch instead of by the installer: Desktop and Documents are per user and
 * are often moved into OneDrive, and only the running app knows the real place.
 * Safe to call any number of times: it only creates what is missing and never touches files.
 */
const fs = require('fs');
const path = require('path');

const HOME_NAME = 'Katuro Teaching Assistant';
const LEGACY_NAME = 'KaTuro';
const MAIN_FOLDERS = Object.freeze(['Records', 'Lessons']);

const samePath = (a, b) => {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
};

/** Makes the home folder and its main folders if they are missing. → the home folder's path. */
function ensureHomeFolder(home) {
  for (const name of MAIN_FOLDERS) {
    fs.mkdirSync(path.join(home, name), { recursive: true });
  }
  return home;
}

/** True when the old Documents\KaTuro holds anything of the teacher's (a file anywhere, or another folder). */
function hasTeacherFiles(dir) {
  const walk = (d, depth) => {
    let items;
    // A folder that cannot be read may hold files: keep using it rather than hide them.
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return true; }
    for (const it of items) {
      if (it.name === 'desktop.ini' || it.name === 'Thumbs.db') continue;
      if (!it.isDirectory()) return true;
      if (depth === 0 && !MAIN_FOLDERS.includes(it.name)) return true;
      if (depth > 12 || walk(path.join(d, it.name), depth + 1)) return true;
    }
    return false;
  };
  return walk(dir, 0);
}

function readSaved(settingsFile) {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    if (typeof saved?.path === 'string' && path.isAbsolute(saved.path)) return path.resolve(saved.path);
  } catch { /* none saved yet */ }
  return null;
}

function saveHome(settingsFile, home) {
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify({ path: path.resolve(home) }));
}

/**
 * Where the home folder is: the saved place; otherwise (first run) Desktop\Katuro Teaching
 * Assistant, or the old Documents\KaTuro when it already has the teacher's files. Saves the
 * choice. Does not create the folder (ensureHomeFolder does).
 */
function chooseHome({ settingsFile, desktopDir, documentsDir }) {
  const saved = readSaved(settingsFile);
  if (saved) return saved;
  let home = path.join(desktopDir, HOME_NAME);
  const legacy = documentsDir ? path.join(documentsDir, LEGACY_NAME) : null;
  if (legacy && fs.existsSync(legacy)) {
    if (hasTeacherFiles(legacy)) {
      home = legacy;
    } else {
      // Only empty folders are removed; rmdirSync refuses anything with a file in it.
      for (const name of MAIN_FOLDERS) { try { fs.rmdirSync(path.join(legacy, name)); } catch { /* keep */ } }
      try { fs.rmdirSync(legacy); } catch { /* keep */ }
    }
  }
  try { saveHome(settingsFile, home); } catch { /* chosen again next time */ }
  return home;
}

/**
 * True when `target` is `folder` itself or inside it. path.relative ignores letter case on
 * Windows; a name starting with ".." ("..cache") is still inside. Shared by the phone link,
 * the file access of the KaTuroDesk window and the backup.
 */
function isInsideFolder(target, folder) {
  const rel = path.relative(path.resolve(folder), path.resolve(target));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** True when `dir` is the KaTuro home folder (any letter case, as Windows treats it). */
function isHomeFolder(dir, home) {
  return samePath(dir, home);
}

/**
 * Folders that are never renamed or deleted from KaTuroDesk: the home folder (and anything
 * holding it), its Records and Lessons, and the folder that is open (`roots`).
 */
function isProtectedPath(target, { home, roots = [] }) {
  if (home && isInsideFolder(home, target)) return true;
  if (home && MAIN_FOLDERS.some((name) => samePath(target, path.join(home, name)))) return true;
  return roots.some((r) => samePath(target, r));
}

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
/** A file or folder name Windows accepts (no folders in it). → the trimmed name, or throws. */
function cleanName(name) {
  const n = String(name ?? '').trim();
  if (!n || n === '.' || n === '..') throw new Error('Type a name.');
  if (n.length > 200) throw new Error('That name is too long.');
  if (/[<>:"/\\|?*\x00-\x1f]/.test(n)) throw new Error('A name cannot have any of these: \\ / : * ? " < > |');
  if (/[. ]$/.test(n)) throw new Error('A name cannot end with a dot or a space.');
  if (RESERVED.test(n)) throw new Error('Windows keeps that name for itself. Choose another.');
  return n;
}

async function countTree(dir) {
  let files = 0;
  let bytes = 0;
  const walk = async (d) => {
    for (const it of await fs.promises.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, it.name);
      if (it.isDirectory()) await walk(p);
      else if (it.isFile()) { files += 1; bytes += (await fs.promises.stat(p)).size; }
    }
  };
  await walk(dir);
  return { files, bytes };
}

const friendly = (err) => {
  if (['EPERM', 'EBUSY', 'EACCES'].includes(err?.code)) {
    return Object.assign(new Error('A file in your KaTuro folder is open in another program (Word, Excel...) or Windows would not allow the move. Close those files and try again.'), { code: 'BUSY' });
  }
  return err;
};

/**
 * Moves the home folder into `toParent` (keeping its name). Same drive: one rename. Another
 * drive: copy, check every file arrived, then remove the old folder. → the new home path.
 */
async function moveHome(from, toParent) {
  const src = path.resolve(from);
  const dest = path.join(path.resolve(toParent), path.basename(src));
  if (samePath(dest, src)) throw Object.assign(new Error('Your KaTuro folder is already there.'), { code: 'SAME' });
  if (isInsideFolder(dest, src)) throw Object.assign(new Error('Choose a place outside your KaTuro folder.'), { code: 'INSIDE' });
  if (!fs.existsSync(toParent) || !fs.statSync(toParent).isDirectory()) throw Object.assign(new Error('That folder was not found.'), { code: 'MISSING' });
  if (fs.existsSync(dest)) throw Object.assign(new Error(`There is already a folder named "${path.basename(src)}" there. Choose another place, or rename that folder first.`), { code: 'EXISTS' });
  if (!fs.existsSync(src)) {
    ensureHomeFolder(dest);
    return dest;
  }
  try {
    await fs.promises.rename(src, dest);
    return dest;
  } catch (err) {
    if (err.code !== 'EXDEV') throw friendly(err);
  }
  const before = await countTree(src);
  try {
    await fs.promises.cp(src, dest, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    const after = await countTree(dest);
    if (after.files !== before.files || after.bytes !== before.bytes) throw new Error('Not every file was copied. Your KaTuro folder was left where it was.');
    // Something changed in the old place while copying: start again rather than lose it.
    const now = await countTree(src);
    if (now.files !== before.files || now.bytes !== before.bytes) throw new Error('Files changed in your KaTuro folder during the move. It was left where it was; try again.');
  } catch (err) {
    await fs.promises.rm(dest, { recursive: true, force: true }).catch(() => {});
    throw friendly(err);
  }
  // The copy is complete; a file that will not delete just stays behind in the old place.
  await fs.promises.rm(src, { recursive: true, force: true }).catch(() => {});
  return dest;
}

module.exports = {
  HOME_NAME,
  MAIN_FOLDERS,
  chooseHome,
  saveHome,
  ensureHomeFolder,
  isHomeFolder,
  isInsideFolder,
  isProtectedPath,
  cleanName,
  moveHome,
  samePath,
};
