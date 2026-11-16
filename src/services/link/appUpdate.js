/**
 * appUpdate.js — the KaTuro App updates itself online, like KaTuroDesk (no uninstall, the
 * teacher's data stays). Installed first by USB; later versions come from KaTuro's GitHub
 * releases (the same place KaTuroDesk updates from).
 *
 * The update file (published with Katuro_App/scripts/release.mjs) on the rolling release
 * "katuro-app":
 *   { "version": "1.0.1", "versionCode": 10001, "url": "https://github.com/…/KaTuro-App-1.0.1.apk",
 *     "sha256": "<64 hex>", "size": 15000000, "notes": "What is new" }
 *
 * The native KaturoUpdatePlugin downloads the APK, checks the SHA-256 and the version, and
 * opens Android's "update this app?" screen. Android installs it only when it is signed with
 * the same key as the installed app.
 */
const UPDATE_FEED = 'https://github.com/Ben010618/Katuro.ai/releases/download/katuro-app/katuro-app-latest.json';
const CHECKED_KEY = 'katuro-app-update-checked-v1';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const bridge = () => {
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  return cap?.isNativePlatform?.() && typeof cap.nativePromise === 'function' ? cap : null;
};
const call = (method, options = {}) => bridge().nativePromise('KaturoUpdate', method, options);

/** "1.2.3" → 10203 (the same rule as Katuro_App/android/app/build.gradle). */
export function versionCodeOf(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || '').trim());
  if (!m) return 0;
  const [a, b, c] = m.slice(1).map(Number);
  return b > 99 || c > 99 ? 0 : a * 10000 + b * 100 + c;
}

const GOOD_HOST = /^https:\/\/(github\.com|[a-z0-9-]+\.githubusercontent\.com)\//i;

/** The update file → a checked update, or null when it is not a valid KaTuro App update. */
export function parseUpdate(text) {
  let u;
  try {
    u = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return null;
  }
  const code = versionCodeOf(u?.version);
  if (!code || Number(u.versionCode) !== code) return null;
  if (!GOOD_HOST.test(String(u.url || '')) || !/\.apk$/i.test(String(u.url))) return null;
  if (!/^[0-9a-f]{64}$/i.test(String(u.sha256 || ''))) return null;
  return { version: u.version, versionCode: code, url: u.url, sha256: u.sha256.toLowerCase(), size: Number(u.size) || 0, notes: String(u.notes || '').slice(0, 2000) };
}

/** True on the phone app (the native updater is there). */
export const canUpdate = () => Boolean(bridge());

/** The installed app's version. → { versionName, versionCode } */
export async function installedVersion() {
  if (!bridge()) return { versionName: '', versionCode: 0 };
  try {
    return await call('current');
  } catch {
    return { versionName: '', versionCode: 0 };
  }
}

/**
 * Asks GitHub for the latest KaTuro App. → { update | null, installed } ; update is set only
 * when it is newer than the installed app. Throws (code OFFLINE) without internet.
 */
export async function checkForUpdate() {
  const installed = await installedVersion();
  const { text } = await call('fetchText', { url: UPDATE_FEED });
  try { localStorage.setItem(CHECKED_KEY, String(Date.now())); } catch { /* not kept */ }
  const update = parseUpdate(text);
  return { installed, update: update && update.versionCode > installed.versionCode ? update : null };
}

/** True once a day, for the quiet check when the app opens. */
function dueForCheck(now = Date.now()) {
  let last = 0;
  try { last = Number(localStorage.getItem(CHECKED_KEY)) || 0; } catch { /* first time */ }
  return now - last > DAY;
}

/**
 * The quiet daily check (app opened, or back in front). onUpdate(update) only when a newer
 * KaTuro App is out. Without internet it tries again in an hour, not every time the app opens.
 */
export function checkQuietly(onUpdate, now = Date.now()) {
  if (!canUpdate() || !dueForCheck(now)) return;
  checkForUpdate().then((r) => { if (r.update) onUpdate(r.update); }).catch(() => {
    try { localStorage.setItem(CHECKED_KEY, String(now - DAY + HOUR)); } catch { /* not kept */ }
  });
}

/** Downloads and opens Android's update screen. onProgress({ received, total }). */
export async function installUpdate(update, onProgress = () => {}) {
  const cap = bridge();
  const listener = cap.addListener?.('KaturoUpdate', 'progress', onProgress);
  try {
    return await call('install', { url: update.url, sha256: update.sha256, versionCode: update.versionCode });
  } finally {
    listener?.remove?.();
  }
}
