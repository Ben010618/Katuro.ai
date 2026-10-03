/**
 * staleChunk.js — recovering from "Failed to fetch dynamically imported module".
 *
 * After a deploy, a tab that was already open still names the OLD hashed files
 * (e.g. /assets/AdminDashboard-CLPOlrP3.js), which no longer exist. Reloading
 * fetches the current page, which names the files that are deployed now.
 *
 * Guard: at most one automatic reload per 60 s, so a deploy that is genuinely
 * broken shows the error (and gets reported) instead of reloading forever.
 * The old guard was a sessionStorage flag that never cleared, so a tab that
 * had reloaded once could never recover from the NEXT deploy.
 */

const KEY = 'kt_stale_chunk_reload_at';
const GUARD_MS = 60 * 1000;

const STALE_CHUNK_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading chunk [\w-]+ failed|ChunkLoadError/i;

export function isStaleChunkError(err) {
  return STALE_CHUNK_RE.test(String(err?.message || err || ''));
}

/** Reloads once to pick up the current deploy. Returns false when it already tried recently. */
export function reloadForNewVersion(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return false;
  try {
    const last = Number(win.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < GUARD_MS) return false;
    win.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage blocked (some private modes): without the timestamp we can't detect a loop,
    // so only reload if this page has been open for at least a minute.
    if (win.performance && win.performance.now() < GUARD_MS) return false;
  }
  win.location.reload();
  return true;
}
