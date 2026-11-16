/**
 * defaultFolders.cjs — the teacher's KaTuro home folder, made the first time KaTuroDesk runs.
 *
 *   Documents\KaTuro\
 *     Records\   Excel class records for every class the teacher handles
 *     Lessons\   PDFs, Word, PowerPoint and other learning materials
 *
 * Records and Lessons are the two main folders KaTuroDesk and the KaTuro App work on
 * together. Teachers can add more folders; those are managed in KaTuroDesk.
 *
 * Made on first launch instead of by the installer: Documents is per user and is often moved
 * into OneDrive, and only the running app knows the real place (app.getPath('documents')).
 * Safe to call any number of times: it only creates what is missing and never touches files.
 */
const fs = require('fs');
const path = require('path');

const HOME_NAME = 'KaTuro';
const MAIN_FOLDERS = Object.freeze(['Records', 'Lessons']);

const homeFolderIn = (documentsDir) => path.join(documentsDir, HOME_NAME);

/** Makes Documents\KaTuro and its main folders if they are missing. → the home folder's path. */
function ensureHomeFolder(documentsDir) {
  const home = homeFolderIn(documentsDir);
  for (const name of MAIN_FOLDERS) {
    fs.mkdirSync(path.join(home, name), { recursive: true });
  }
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
function isHomeFolder(dir, documentsDir) {
  const a = path.resolve(dir);
  const b = path.resolve(homeFolderIn(documentsDir));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

module.exports = { MAIN_FOLDERS, ensureHomeFolder, isHomeFolder, isInsideFolder };
