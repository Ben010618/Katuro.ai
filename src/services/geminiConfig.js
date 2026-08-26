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
    // An aborted request must not be retried: `opts.signal` is a one-shot
    // AbortSignal, so every retry would reuse the already-aborted signal and
    // reject instantly, burning the full backoff ladder for nothing.
    if (opts?.signal?.aborted) {
      const err = new Error('The AI request took too long and was stopped. Please try again.');
      err.reason = 'timeout';
      throw err;
    }
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
function extractPrompt(contents) {
  if (typeof contents === 'string') return contents;
  if (!Array.isArray(contents)) return '';
  return contents
    .map((c) => {
      if (typeof c === 'string') return c;
      if (Array.isArray(c?.parts)) {
        return c.parts.map((p) => (typeof p === 'string' ? p : p?.text || '')).filter(Boolean).join('\n');
      }
      if (c?.text) return c.text;
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

export async function callGeminiProxy({ action, contents, temperature, maxTokens, responseMimeType, isRetry, unitCount, timeoutMs }) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  // BUG-FIX: the client used to give up after 50s on every non-COT action.
  // That is SHORTER than the time the server legitimately needs to write a
  // 3-4k-token DLL / ILAW session / test-item payload, so the callable aborted
  // a generation that was still running fine and reported deadline-exceeded —
  // one half of why DLL, ILAW and Test Builder stopped working. The client
  // budget must always outlast the server's own budget for the same request
  // (see geminiBudgetMs in functions/index.js) plus its NVIDIA fallback.
  const isHeavy = action === 'cot_gen' || action === 'action_research_ai' || action === 'expand_slides';
  const serverBudgetMs = Math.min(180000, Math.max(45000, 30000 + (Number(maxTokens) || 2048) * 10));
  const effectiveTimeout = timeoutMs
    ?? (isHeavy ? 300000 : Math.min(300000, serverBudgetMs + 100000));
  const call = httpsCallable(getFunctions(app, 'us-central1'), 'generateAI', { timeout: effectiveTimeout });
  try {
    const res = await call({ action, contents, temperature, maxTokens, responseMimeType, isRetry, unitCount });
    return { text: res.data?.text ?? '', finishReason: res.data?.finishReason ?? null };
  } catch (err) {
    // Only a transient backend failure is worth re-trying through a client-side
    // engine. A bad request, a missing key, a daily limit or a signed-out user
    // will fail exactly the same way twice, and running the fallbacks anyway
    // replaced the real, actionable message with a generic one.
    const TRANSIENT = new Set([
      'functions/internal',
      'functions/unavailable',
      'functions/deadline-exceeded',
      'functions/aborted',
      'functions/cancelled',
      'functions/resource-exhausted',
    ]);
    if (!err?.details?.dailyLimit && TRANSIENT.has(err?.code)) {
      // 1. Try NVIDIA NIM fallback
      try {
        const { getNvidiaConfig, callNvidiaChat } = await import('./nvidiaConfig');
        const nvidiaConfig = await getNvidiaConfig();
        if (nvidiaConfig?.apiKey) {
          console.log(`[callGeminiProxy] Cloud Function error (${err.message || err.code}). Swapping to client NVIDIA NIM fallback...`);
          const promptText = extractPrompt(contents);
          const responseFormat = responseMimeType === 'application/json' ? { type: 'json_object' } : undefined;
          // BUG-FIX: a 4096 cap silently truncated every COT plan (which asks
          // for 16384) into unparseable JSON, so this fallback could never
          // actually rescue a COT generation. Matches the server-side cap.
          const nvidiaMaxTokens = Math.min(maxTokens || 4096, 12288);
          const text = await callNvidiaChat({
            messages: [{ role: 'user', content: promptText }],
            temperature: temperature ?? 0.5,
            maxTokens: nvidiaMaxTokens,
            responseFormat,
          });
          return { text, finishReason: 'STOP', engine: 'nvidia' };
        }
      } catch (nvidiaErr) {
        console.warn('[callGeminiProxy] Client NVIDIA NIM fallback failed:', nvidiaErr);
      }

      // 2. Try Client Direct Gemini API fallback
      try {
        const apiKey = await getGeminiKey();
        if (apiKey) {
          console.log(`[callGeminiProxy] Swapping to direct Gemini client fallback...`);
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
          const res = await geminiWithRetry(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              generationConfig: {
                temperature: temperature ?? 0.5,
                maxOutputTokens: maxTokens || 2048,
                ...(responseMimeType ? { responseMimeType } : {}),
              },
            }),
            // This last-resort fetch had no timeout at all — a stalled
            // connection here left the Generate button spinning forever.
            signal: AbortSignal.timeout(serverBudgetMs),
          });
          if (res.ok) {
            const data = await res.json();
            const candidate = data.candidates?.[0];
            const parts = candidate?.content?.parts ?? [];
            const text = parts.map((p) => p.text ?? '').join('');
            return { text, finishReason: candidate?.finishReason ?? null, engine: 'gemini_direct' };
          }
        }
      } catch (directErr) {
        console.warn('[callGeminiProxy] Direct Gemini client fallback failed:', directErr);
      }
    }

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

    const isDeadline = code === 'functions/deadline-exceeded';
    const message = isUnexplainedFailure
      ? 'Something went wrong on our end. We’ve been notified — please try again shortly.'
      : isDeadline
        ? 'The request took too long to complete. Please try again (our backup engine is ready).'
        : (rawMessage || 'The AI service is unavailable right now. Please try again.');

    const e = new Error(message);
    if (code === 'functions/resource-exhausted') {
      e.status = 429;
      if (err?.details?.dailyLimit) e.dailyLimit = true;
    } else if (code === 'functions/unauthenticated') {
      e.reason = 'unauthenticated';
    } else if (isDeadline) {
      e.status = 408;
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

/**
 * Admin-only: list the models this key can reach, for the model-pin dropdown.
 *
 * Caveat worth knowing when reading the result: appearing here does NOT mean a
 * model can serve real work. gemini-3.7-flash was listed, answered a trivial
 * ping in 1.6s, and still returned 503 on every production-sized generation for
 * three days running. The server's resolver benches models that fail in use;
 * this list is only what the API advertises.
 */
export async function listAvailableGeminiModels() {
  const key = await getGeminiKey();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`Could not list models (HTTP ${res.status}).`);
  const data = await res.json();
  return (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => String(m.name).replace('models/', ''))
    .filter(id => !/(preview|-exp|experimental|tts|image|audio|live|embedding|vision|learnlm)/i.test(id))
    .sort();
}

/**
 * Admin-only: pin generation to a specific model, or pass '' to go back to
 * automatic resolution. The server reads this before consulting ListModels.
 */
export async function saveGeminiModelPin(model, adminUid) {
  await setDoc(CONFIG_REF, {
    model:     (model || '').trim(),
    updatedAt: new Date(),
    updatedBy: adminUid ?? null,
  }, { merge: true });
}

/** Admin-only: read the current pin ('' when automatic). */
export async function getGeminiModelPin() {
  try {
    const snap = await getDoc(CONFIG_REF);
    return snap.exists() ? (snap.data().model || '') : '';
  } catch {
    return '';
  }
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${trimmed}`;
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
