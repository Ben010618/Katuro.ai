/**
 * useDeskUpdate.js — KaTuroDesk auto-update status from the desktop app.
 * States: unsupported | idle | checking | current | downloading | ready | error.
 * On the website (no desktop API) it reports 'unsupported' and does nothing.
 */
import { useEffect, useState } from 'react';

const api = () => (typeof window !== 'undefined' ? window.katuroDeskApi : undefined);
const UNSUPPORTED = { state: 'unsupported', version: null, percent: 0, error: null };

export function useDeskUpdate() {
  const [status, setStatus] = useState(() => (api()?.getUpdateStatus ? { ...UNSUPPORTED, state: 'idle' } : UNSUPPORTED));
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    const desk = api();
    if (!desk?.getUpdateStatus) return undefined;
    let alive = true;
    desk.getUpdateStatus().then((s) => alive && s && setStatus(s)).catch(() => {});
    desk.getVersion?.().then((v) => alive && setAppVersion(v || '')).catch(() => {});
    const off = desk.onUpdateStatus?.((s) => alive && setStatus(s));
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  const check = async () => {
    const desk = api();
    if (!desk?.checkForUpdates) return;
    setStatus((s) => ({ ...s, state: 'checking', error: null }));
    try {
      setStatus(await desk.checkForUpdates());
    } catch (e) {
      setStatus((s) => ({ ...s, state: 'error', error: e.message }));
    }
  };

  const install = () => api()?.installUpdate?.();

  return { status, appVersion, check, install };
}

/** One-line description for Settings. */
export function updateStatusText(status) {
  switch (status?.state) {
    case 'checking': return 'Checking for updates…';
    case 'current': return 'You have the latest version.';
    case 'downloading': return `Downloading version ${status.version || ''}… ${status.percent || 0}%`;
    case 'ready': return `Version ${status.version} is ready. Restart KaTuroDesk to use it.`;
    case 'error': return 'Could not check for updates (no internet?). KaTuroDesk will try again later.';
    case 'idle': return 'Updates are checked automatically.';
    default: return 'Automatic updates work in the installed desktop app.';
  }
}
