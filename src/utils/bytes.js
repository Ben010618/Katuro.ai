/** bytes.js — file sizes and base64, shared by Messages, KaTuroDesk's AI calls and the KaTuro App. */

/** 2_400_000 → "2.3 MB", 5_000 → "5 KB" */
export function formatBytes(n) {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Base64-encodes bytes in chunks (safe for multi-MB files). */
export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return typeof btoa === 'function' ? btoa(binary) : globalThis.Buffer.from(bytes).toString('base64');
}

/** Base64 (standard) → bytes. */
export function base64ToBytes(b64) {
  const bin = typeof atob === 'function' ? atob(String(b64 || '')) : globalThis.Buffer.from(String(b64 || ''), 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** SHA-256 of bytes, as hex: tells whether a file changed, and finds exact duplicates. */
export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
