/**
 * Gemini API key manager.
 *
 * The key lives in Firestore at adminConfig/gemini.apiKey — protected by
 * security rules so ONLY admin accounts can read/write it. Regular teacher
 * accounts cannot access this document.
 *
 * In-memory cache (5 min TTL) avoids a Firestore read on every AI call.
 * Falls back to VITE_GEMINI_API_KEY env var for local development.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import app, { db, auth } from '../firebase';
import { reportAIError } from './db';

const CONFIG_REF  = doc(db, 'adminConfig', 'gemini');
const CACHE_TTL   = 5 * 60 * 1000; // 5 minutes

let _key       = null;
let _fetchedAt = 0;

export async function getGeminiKey() {
  // In-memory cache
  if (_key && Date.now() - _fetchedAt < CACHE_TTL) return _key;

  // Try Firestore (admin-managed key, works in production)
  try {
    const snap = await getDoc(CONFIG_REF);
    if (snap.exists() && snap.data()?.apiKey) {
      _key       = snap.data().apiKey;
      _fetchedAt = Date.now();
      return _key;
    }
  } catch {
    // Firestore read failed (offline, rules, etc.) — fall through to env fallback
  }

  // Dev fallback: .env file
  const envKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (envKey) {
    _key       = envKey;
    _fetchedAt = Date.now();
    return _key;
  }

  throw new Error(
    'Gemini API key is not configured. Ask your administrator to set it in Admin → API Settings.'
  );
}

export function invalidateKeyCache() {
  _key       = null;
  _fetchedAt = 0;
}

/**
 * Wraps a Gemini fetch call with exponential backoff retry.
 * Retries up to 4 times on 429 (rate limit) or 503 (overloaded).
 * Delays: ~1s, ~2s, ~4s, ~8s (+ random jitter to avoid thundering herd).
 *
 * Usage: replace `await fetch(url, opts)` with `await geminiWithRetry(url, opts)`
 */
export async function geminiWithRetry(url, opts, attempt = 0) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    // fetch() itself throws (TypeError: Failed to fetch) on network failures —
    // offline, DNS hiccup, dropped connection, CORS — rather than resolving
    // with a bad status. These are almost always transient, so retry them
    // the same way as a 503 instead of letting the raw browser error surface.
    if (attempt < 4) {
      const delay = (2 ** attempt) * 1000 + Math.random() * 600;
      await new Promise(r => setTimeout(r, delay));
      return geminiWithRetry(url, opts, attempt + 1);
    }
    const err = new Error('Could not reach the AI service. Check your internet connection and try again.');
    err.reason = 'network_error';
    throw err;
  }

  if ((res.status === 429 || res.status === 503) && attempt < 4) {
    const delay = (2 ** attempt) * 1000 + Math.random() * 600;
    await new Promise(r => setTimeout(r, delay));
    return geminiWithRetry(url, opts, attempt + 1);
  }

  if (!res.ok && res.status === 429) {
    const err = new Error('The AI service is busy right now. Please try again in a moment.');
    err.status = 429;
    err.reason = 'rate_limited';
    throw err;
  }

  return res;
}

/**
 * Runs a Gemini call through the `generateAI` Cloud Function instead of
 * calling Gemini directly from the browser. The key never reaches the
 * client, and the server enforces a per-user daily limit for `action`.
 *
 * `contents` is the exact Gemini `contents` array a caller would otherwise
 * have sent straight to the API (text-only or with inlineData images) — the
 * prompt itself is untouched, only the network hop moves server-side.
 *
 * Returns `{ text, finishReason }` — finishReason (e.g. "MAX_TOKENS",
 * "SAFETY") lets a caller distinguish a truncated response from a genuinely
 * malformed one, same as the raw Gemini payload used to.
 *
 * Pass `isRetry: true` when this call is an automatic retry of a request the
 * caller already made (not a new user-initiated generation) — the server
 * skips the daily-limit charge in that case, so a generation that needed 2
 * internal retries costs 1 unit of the daily budget, not 3.
 *
 * Pass `unitCount` for an action whose per-call "size" (e.g. ILAW's number of
 * teaching days) is meant to be bounded — the server validates it against
 * that action's documented max independently of the UI, so a modified/
 * replayed request can't ask for more than the UI would ever allow. Omit it
 * for actions with no such per-call size limit.
 *
 * Throws an Error shaped like geminiWithRetry's: `.status === 429` for both
 * "Gemini is rate-limited" and "you've hit today's limit" (existing retry
 * loops already treat 429 as "back off, maybe retry"), plus `.dailyLimit ===
 * true` specifically for the daily-limit case so a caller can skip retrying
 * something that won't clear up in the next few seconds.
 */
export async function callGeminiProxy({ action, contents, temperature, maxTokens, responseMimeType, isRetry, unitCount }) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  // BUG-FIX: Raised from 150000 (150s) to 320000 (320s) so the client never
  // times out before the server does. The server generateAI function was raised
  // to 300s; this leaves a 20s buffer above that so teachers see the server's
  // own error message rather than a generic client-side disconnect.
  const call = httpsCallable(getFunctions(app, 'us-central1'), 'generateAI', { timeout: 320000 });
  try {
    const res = await call({ action, contents, temperature, maxTokens, responseMimeType, isRetry, unitCount });
    return { text: res.data?.text ?? '', finishReason: res.data?.finishReason ?? null };
  } catch (err) {
    const code = err?.code || '';
    const rawMessage = err?.message || '';
    // A bare code-shaped message ("internal", "unavailable"...) means the
    // client SDK never got a real error body back — the request likely never
    // reached our function code at all (e.g. a lost Cloud Run invoker IAM
    // binding, like the expandSlides outage this was added after). A
    // descriptive message (e.g. "Gemini 500: ...") means our code DID run and
    // already explains what happened — leave it alone.
    const looksGeneric = !rawMessage || rawMessage.toLowerCase() === code.replace('functions/', '').toLowerCase();
    const isUnexplainedFailure = (code === 'functions/internal' || code === 'functions/unavailable') && looksGeneric;

    // Report any real backend failure (not rate limits / daily limits / bad
    // input, which are expected and already user-facing) so an admin sees it
    // in the AI Error inbox instead of it failing silently for days.
    if (code === 'functions/internal' || code === 'functions/unavailable' || code === 'functions/deadline-exceeded') {
      reportAIError({
        uid: auth.currentUser?.uid,
        feature: action,
        errorMessage: `[${code || 'no-code'}]${isUnexplainedFailure ? ' (unexplained — possible deploy/IAM issue)' : ''} ${rawMessage}`,
        inputContext: { isRetry: !!isRetry },
      }).catch(() => {});
    }

    const message = isUnexplainedFailure
      ? 'Something went wrong on our end. We’ve been notified — please try again shortly.'
      : (rawMessage || 'The AI service is unavailable right now. Please try again.');

    const e = new Error(message);
    if (code === 'functions/resource-exhausted') {
      e.status = 429;
      if (err?.details?.dailyLimit) e.dailyLimit = true;
    } else if (code === 'functions/unauthenticated') {
      e.reason = 'unauthenticated';
    }
    throw e;
  }
}

/** Admin-only: save a new key to Firestore */
export async function saveGeminiKey(apiKey, adminUid) {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) throw new Error('API key cannot be empty.');

  const preview = trimmed.slice(0, 8) + '•'.repeat(16) + trimmed.slice(-4);

  await setDoc(CONFIG_REF, {
    apiKey:    trimmed,
    preview,
    hasKey:    true,
    updatedAt: new Date(),
    updatedBy: adminUid,
  });

  invalidateKeyCache();
}

/** Admin-only: read display info (never exposes the full key) */
export async function getGeminiKeyStatus() {
  try {
    const snap = await getDoc(CONFIG_REF);
    if (!snap.exists() || !snap.data().hasKey) return { hasKey: false };
    const d = snap.data();
    return {
      hasKey:    true,
      preview:   d.preview   || '••••••••••••••••••••••••••••',
      updatedAt: d.updatedAt ?? null,
    };
  } catch {
    return { hasKey: false, error: true };
  }
}

/** Quick validity test: send a tiny prompt to Gemini */
export async function testGeminiKey(apiKey) {
  const trimmed = (apiKey || '').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${trimmed}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }],
      generationConfig: { maxOutputTokens: 8, temperature: 0 },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status} — key may be invalid or quota exceeded.`);
  }
  return true;
}
