/**
 * shareTarget.js — files shared to the KaTuro App from other apps (Android: Share → KaTuro).
 * Talks to the native KaturoSharePlugin (Katuro_App/android/.../KaturoSharePlugin.java)
 * through the Capacitor bridge, without the Capacitor JS package in src/.
 */
import { base64ToBytes } from './linkClient.js';

const bridge = () => {
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  return cap?.isNativePlatform?.() && typeof cap.nativePromise === 'function' ? cap : null;
};

/** The files waiting since the last call. → { files: [{ name, mimeType, bytes }], skipped: [{ name, reason }] } */
export async function takeSharedFiles() {
  const cap = bridge();
  if (!cap) return { files: [], skipped: [] };
  try {
    const r = await cap.nativePromise('KaturoShare', 'take', {});
    return {
      files: (r?.files || []).map((f) => ({ name: f.name, mimeType: f.mimeType || '', bytes: base64ToBytes(f.data) })),
      skipped: r?.skipped || [],
    };
  } catch {
    return { files: [], skipped: [] };
  }
}

/** Calls `callback` when something is shared while the app is open. → stop() */
export function onFilesShared(callback) {
  const cap = bridge();
  if (!cap?.addListener) return () => {};
  const handle = cap.addListener('KaturoShare', 'shared', () => callback());
  return () => { handle?.remove?.(); };
}
