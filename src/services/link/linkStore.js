/**
 * linkStore.js — the KaTuro App remembers which KaTuroDesk it is linked to, on this phone only.
 * { deskId, deskName, deviceId, key, hosts, port, pairedAt }. Never sent to the cloud.
 */
const KEY = 'katuro-link-v1';

export function loadLink() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v?.deviceId && v?.key && Array.isArray(v.hosts) && v.port ? v : null;
  } catch {
    return null;
  }
}

export function saveLink(link) {
  try {
    localStorage.setItem(KEY, JSON.stringify(link));
  } catch {
    // Storage full or blocked: the link works until the app closes.
  }
}

export function forgetLink() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing saved
  }
}
