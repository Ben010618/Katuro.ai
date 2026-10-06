/**
 * deskRelease.js — the newest KaTuroDesk installer, read from the GitHub release that
 * auto-update uses (owner/repo match package.json "build.publish"). The version is never
 * written by hand: each release updates the download button by itself.
 */

export const DESK_REPO = 'Ben010618/Katuro.ai';
export const DESK_RELEASES_URL = `https://github.com/${DESK_REPO}/releases/latest`;
const CACHE_KEY = 'kt-desk-latest-v1';
const CACHE_MS = 60 * 60 * 1000; // GitHub allows 60 unauthenticated API calls per hour per IP

/** { version, url } from a GitHub "latest release" API response, or null when it has no installer. */
export function parseDeskRelease(json) {
  const version = String(json?.tag_name || '').replace(/^v/i, '').trim();
  const asset = (json?.assets || []).find((a) => /^KaTuroDesk-Setup-.+\.exe$/i.test(String(a?.name || '')));
  if (!/^\d+\.\d+\.\d+$/.test(version) || !asset?.browser_download_url) return null;
  return { version, url: asset.browser_download_url };
}

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return c && Date.now() - c.at < CACHE_MS && c.release ? c.release : null;
  } catch {
    return null;
  }
}

function writeCache(release) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), release }));
  } catch {
    // storage unavailable: the next page load simply asks GitHub again
  }
}

/** Newest installer { version, url }, or null (then link to the releases page instead). */
export async function getLatestDeskRelease({ fetchImpl = globalThis.fetch } = {}) {
  const cached = readCache();
  if (cached) return cached;
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${DESK_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const release = parseDeskRelease(await res.json());
    if (release) writeCache(release);
    return release;
  } catch {
    return null;
  }
}
