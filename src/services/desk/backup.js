/**
 * backup.js — when KaTuroDesk gently reminds the teacher to back up the KaTuro folder to a USB
 * drive or another folder (Settings → Backup). The copy itself is made by electron/folderBackup.cjs.
 */
const REMIND_AFTER_DAYS = 7;
const DAY = 86400000;

/** True when there is no backup yet, or the last one is older than 7 days. */
export function backupDue(last, now = Date.now()) {
  const at = last?.at ? new Date(last.at).getTime() : NaN;
  return !Number.isFinite(at) || now - at > REMIND_AFTER_DAYS * DAY;
}

/** "today", "yesterday", "5 days ago" */
export function backupAge(last, now = Date.now()) {
  const at = last?.at ? new Date(last.at).getTime() : NaN;
  if (!Number.isFinite(at)) return 'never';
  const days = Math.floor((now - at) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
