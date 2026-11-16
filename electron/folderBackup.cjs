/**
 * folderBackup.cjs — a copy of the teacher's KaTuro folder (Records, Lessons and every other
 * folder in it) on a USB drive or another folder the teacher chooses. Never the cloud.
 *
 *   <chosen folder>\KaTuro Backup 2026-11-16 1432\   (" (2)" when that name is taken)
 *
 * Excel's lock files (~$…) and Windows' desktop.ini / Thumbs.db are left out. A destination
 * inside the KaTuro folder itself is refused (the copy would copy itself).
 * Testable without Electron, like defaultFolders.cjs.
 */
const fs = require('fs');
const path = require('path');

const SKIP = /^(~\$|desktop\.ini$|thumbs\.db$)/i;
const pad = (n) => String(n).padStart(2, '0');

/** "KaTuro Backup 2026-11-16 1432" */
function backupName(d = new Date()) {
  return `KaTuro Backup ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** True when `dir` is the KaTuro folder or inside it (path.relative ignores letter case on Windows). */
function isInside(dir, home) {
  const rel = path.relative(path.resolve(home), path.resolve(dir));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Copies `home` into a new dated folder in `dest`.
 * → Promise of { path, files, bytes }; rejects (code 'INSIDE_HOME' / 'NO_DESTINATION') when it cannot.
 * Copied without blocking KaTuroDesk (the window keeps working and shows the progress).
 */
async function backupFolder({ home, dest, now = new Date(), onProgress = () => {} }) {
  if (!dest || !fs.existsSync(dest) || !fs.statSync(dest).isDirectory()) {
    throw Object.assign(new Error('That folder or drive cannot be found. Plug in the USB drive and choose it again.'), { code: 'NO_DESTINATION' });
  }
  if (isInside(dest, home)) {
    throw Object.assign(new Error('Choose a folder outside your KaTuro folder, for example a USB drive.'), { code: 'INSIDE_HOME' });
  }
  const base = backupName(now);
  let target = path.join(dest, base);
  for (let i = 2; fs.existsSync(target); i += 1) target = path.join(dest, `${base} (${i})`);

  let files = 0;
  let bytes = 0;
  await fs.promises.cp(home, target, {
    recursive: true,
    errorOnExist: true,
    force: false,
    filter: async (src) => {
      if (SKIP.test(path.basename(src))) return false;
      const st = await fs.promises.stat(src);
      if (st.isFile()) {
        files += 1;
        bytes += st.size;
        if (files % 25 === 0) onProgress({ files, bytes });
      }
      return true;
    },
  });
  onProgress({ files, bytes });
  return { path: target, files, bytes };
}

module.exports = { backupFolder, backupName, isInside };
