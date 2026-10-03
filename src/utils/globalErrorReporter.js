/**
 * globalErrorReporter.js — reports errors that happen OUTSIDE React rendering
 * (event handlers, timers, promises nobody awaited). The ErrorBoundary only sees
 * render crashes, so these used to fail silently for teachers and admins alike.
 *
 * Noise control: each distinct message is reported once per page load, at most
 * MAX_PER_SESSION in total; stale-file errors (handled by a reload) and
 * browser-extension noise are ignored.
 */
import { isStaleChunkError } from './staleChunk';

const MAX_PER_SESSION = 5;
const IGNORE_RE = /ResizeObserver loop|Script error\.?$|Non-Error promise rejection|chrome-extension:\/\/|moz-extension:\/\/|NetworkError when attempting to fetch|Load failed$|The user aborted a request|AbortError/i;

export function createGlobalErrorReporter(report) {
  const seen = new Set();
  let sent = 0;

  return function handle(kind, error) {
    const message = String(error?.message || error || '').trim();
    if (!message || IGNORE_RE.test(message) || isStaleChunkError(error)) return false;
    if (error?.details?.busy || error?.dailyLimit) return false; // already explained to the teacher
    const key = message.slice(0, 200);
    if (seen.has(key) || sent >= MAX_PER_SESSION) return false;
    seen.add(key);
    sent += 1;
    Promise.resolve()
      .then(() => report({ feature: kind, errorMessage: key, inputContext: { stack: String(error?.stack || '').slice(0, 1500), page: typeof location !== 'undefined' ? location.pathname : '' } }))
      .catch(() => {});
    return true;
  };
}

/** Wires window 'error' and 'unhandledrejection' to the admin's AI Error Reports. */
export function installGlobalErrorReporter(win, report) {
  const handle = createGlobalErrorReporter(report);
  win.addEventListener('error', (e) => handle('app-error', e?.error || e?.message));
  win.addEventListener('unhandledrejection', (e) => handle('app-unhandled-promise', e?.reason));
  return handle;
}
