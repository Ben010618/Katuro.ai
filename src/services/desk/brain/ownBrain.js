/**
 * ownBrain.js — KaTuroDesk's first brain when the teacher saved their own AI key
 * (hidden Settings tab). Every AI request tries the teacher's key first; when it is
 * off, missing, out of credit or fails in any way, the KaTuro system AI answers
 * instead (the second brain), exactly as before. The key itself stays in the
 * desktop app's main process (electron/customBrain.cjs).
 */

const api = () => (typeof window !== 'undefined' ? window.katuroDeskApi?.brain : null) || null;

let cached = null; // last status from the app
let cachedAt = 0;
const STATUS_TTL_MS = 30000;
const listeners = new Set();
let last = { at: 0, ok: null, message: '' }; // the last request through the teacher's key

export function onOwnBrainChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn({ status: cached, last }));

export function lastOwnBrainResult() {
  return last;
}

/** → status { provider, model, baseUrl, enabled, label, hasKey, keyHint, canEncrypt } or null (not the desktop app). */
export async function ownBrainStatus(force = false) {
  const a = api();
  if (!a) return null;
  if (!force && cached && Date.now() - cachedAt < STATUS_TTL_MS) return cached;
  const s = await a.status().catch(() => null);
  cached = s && !s.error ? s : null;
  cachedAt = Date.now();
  notify();
  return cached;
}

/** After the hidden tab saves or removes the key. */
export function setOwnBrainStatus(s) {
  cached = s && !s.error ? s : null;
  cachedAt = Date.now();
  notify();
}

const ready = (s) => Boolean(s?.enabled && s.provider && s.model && (s.hasKey || (s.provider === 'openai' && s.baseUrl)));
const hasAudio = (contents) => (contents || []).some((c) => (c?.parts || []).some((p) => /^audio\//i.test(p?.inlineData?.mimeType || '')));

/**
 * One AI request through the teacher's key.
 * → { text, finishReason, engine: 'own' }, or null when the system AI should answer instead.
 */
export async function tryOwnBrain({ contents, temperature, maxTokens, responseMimeType, onChunk }) {
  const a = api();
  if (!a) return null;
  const s = await ownBrainStatus();
  if (!ready(s)) return null;
  // Voice clips: only Gemini hears audio reliably; other services leave voice to KaTuro's AI.
  if (hasAudio(contents) && s.provider !== 'gemini') return null;
  const res = await a.call({ contents, temperature, maxTokens, responseMimeType }).catch((err) => ({ error: String(err?.message || err) }));
  if (!res || res.error || typeof res.text !== 'string' || (!res.text.trim() && res.finishReason !== 'MAX_TOKENS')) {
    last = { at: Date.now(), ok: false, message: res?.error || 'Your key gave an empty answer.' };
    notify();
    return null;
  }
  last = { at: Date.now(), ok: true, message: '' };
  notify();
  if (typeof onChunk === 'function') {
    try { onChunk(res.text, res.text); } catch { /* the chat view only */ }
  }
  return { text: res.text, finishReason: res.finishReason || 'STOP', engine: 'own' };
}
