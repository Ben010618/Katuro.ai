/**
 * folderBackup.cjs — a copy of the teacher's KaTuro folder (Records, Lessons and every other
 * folder in it) on a USB drive or another folder the teacher chooses. Never the cloud.
 *
 *   <chosen folder>\KaTuro Backup 2026-11-16 1432\   (" (2)" when that name is taken)
 *
 * Excel's lock files (~$…) and Windows' desktop.ini / Thumbs.db are left out. A destination
 * inside the KaTuro folder itself is refused (the copy would copy itself).
 *
 * The copy goes into "<name> (incomplete)" and gets its real name only when everything is
 * copied. If it fails (USB pulled, drive full, a OneDrive file not on the computer), the
 * half-done folder is removed, so a dated backup on the drive is always a whole one. One left
 * by a KaTuroDesk that was closed mid-copy is cleared by the next backup.
 * Testable without Electron, like defaultFolders.cjs.
 */
const fs = require('fs');
const path = require('path');
const { isInsideFolder } = require('./defaultFolders.cjs');

const SKIP = /^(~\$|desktop\.ini$|thumbs\.db$)/i;
const pad = (n) => String(n).padStart(2, '0');

/** "KaTuro Backup 2026-11-16 1432" */
function backupName(d = new Date()) {
  return `KaTuro Backup ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * Copies `home` into a new dated folder in `dest`.
 * → Promise of { path, files, bytes }; rejects (code 'INSIDE_HOME' / 'NO_DESTINATION') when it cannot.
 * Copied without blocking KaTuroDesk (the window keeps working and shows the progress).
 */
async function backupFolder({ home, dest, now = new Date(), onProgress = () => {}, copy = fs.promises.cp }) {
  if (!dest || !fs.existsSync(dest) || !fs.statSync(dest).isDirectory()) {
    throw Object.assign(new Error('That folder or drive cannot be found. Plug in the USB drive and choose it again.'), { code: 'NO_DESTINATION' });
  }
  // Real paths too, so a shortcut (junction) into the KaTuro folder is caught.
  const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
  if (isInsideFolder(dest, home) || isInsideFolder(real(dest), real(home))) {
    throw Object.assign(new Error('Choose a folder outside your KaTuro folder, for example a USB drive.'), { code: 'INSIDE_HOME' });
  }
  const base = backupName(now);
  let target = path.join(dest, base);
  for (let i = 2; fs.existsSync(target); i += 1) target = path.join(dest, `${base} (${i})`);

  const partial = `${target} (incomplete)`;
  await clearIncomplete(dest);
  let files = 0;
  let bytes = 0;
  try {
    await copy(home, partial, {
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
    await renameWithRetry(partial, target);
  } catch (err) {
    await fs.promises.rm(partial, { recursive: true, force: true }).catch(() => {});
    const why = /ENOSPC/.test(String(err?.code || err?.message)) ? 'the drive is full'
      : /ENOENT|EIO|ENODEV|EBUSY|EPERM|EACCES/.test(String(err?.code || err?.message)) ? 'a file or the drive could not be read or written (was the USB drive removed, or is a file only online in OneDrive?)'
        : 'something went wrong while copying';
    throw Object.assign(new Error(`The backup could not finish: ${why}. Nothing half-done was left on the drive. Check the drive and try again.`), { code: 'COPY_FAILED', cause: err });
  }
  onProgress({ files, bytes });
  return { path: target, files, bytes };
}

/**
 * Removes half-done copies left in `dest` by an earlier backup that stopped: only names this
 * file makes ("KaTuro Backup 2026-11-16 1432 (incomplete)", "… 1432 (2) (incomplete)"), never
 * a folder of the teacher's that only looks alike.
 */
async function clearIncomplete(dest) {
  const names = await fs.promises.readdir(dest).catch(() => []);
  await Promise.all(names.filter((n) => /^KaTuro Backup \d{4}-\d{2}-\d{2} \d{4}(?: \(\d+\))? \(incomplete\)$/.test(n))
    .map((n) => fs.promises.rm(path.join(dest, n), { recursive: true, force: true }).catch(() => {})));
}

/** Antivirus or the Windows indexer can hold a just-copied folder for a moment: try again. */
async function renameWithRetry(from, to, tries = 5) {
  for (let i = 1; ; i += 1) {
    try {
      await fs.promises.rename(from, to);
      return;
    } catch (err) {
      if (i >= tries || !/EPERM|EBUSY|EACCES/.test(String(err?.code))) throw err;
      await new Promise((r) => setTimeout(r, 200 * i));
    }
  }
}

module.exports = { backupFolder, backupName, renameWithRetry };
