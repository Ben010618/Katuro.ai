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
import { assertHeaderSafeKey } from './nvidiaConfig';

const CONFIG_REF  = doc(db, 'adminConfig', 'gemini');
const CACHE_TTL   = 5 * 60 * 1000; // 5 minutes

let _key       = null;
let _fetchedAt = 0;
let _deskKey   = null;
let _deskFetchedAt = 0;

export async function getGeminiKey(isDesk = false) {
  if (isDesk) {
    if (_deskKey && Date.now() - _deskFetchedAt < CACHE_TTL) return _deskKey;
    try {
      const snap = await getDoc(CONFIG_REF);
      if (snap.exists()) {
        const data = snap.data();
        if (data?.deskApiKey) {
          _deskKey = data.deskApiKey;
          _deskFetchedAt = Date.now();
          return _deskKey;
        }
        if (data?.apiKey) {
          _deskKey = data.apiKey;
          _deskFetchedAt = Date.now();
          return _deskKey;
        }
      }
    } catch {
      // offline / rules error
    }
    const envDeskKey = import.meta.env.VITE_KATURO_DESK_GEMINI_KEY || import.meta.env.VITE_GEMINI_API_KEY;
    if (envDeskKey) return envDeskKey;
    throw new Error('KaTuroDesk Gemini API key is not configured.');
  }

  // In-memory cache for Web key
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
  _key           = null;
  _fetchedAt     = 0;
  _deskKey       = null;
  _deskFetchedAt = 0;
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
 * something that won't clear up in the next few seconds. The original Firebase
 * error `code` (e.g. 'functions/resource-exhausted') and `details` are also
 * attached as `e.code` / `e.details`.
 *
 * Opt-in options (omit them and the call is exactly what it always was):
 *   tier     'fast' | 'standard' — forwarded; 'fast' makes the server prefer a
 *            flash-lite model (small JSON jobs). An older deployed function
 *            ignores it.
 *   stream + onChunk(deltaText, fullTextSoFar) — streams the reply through
 *            httpsCallable(...).stream(); still resolves { text, finishReason }.
 *            Falls back to the normal call when streaming is unavailable. An
 *            older deployed function simply sends no chunks, only the result.
 *   region   default 'us-central1'. Any other region (e.g. 'asia-southeast1')
 *            is tried first; if the function isn't deployed there, the call is
 *            retried once on us-central1 and that region is skipped for the
 *            rest of the session.
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

// Regions where generateAI turned out not to be deployed this session (see
// the `region` option). Module-level on purpose: one discovery per page load.
const _unavailableRegions = new Set();
const DEFAULT_REGION = 'us-central1';

const STREAM_NO_RESULT = Symbol('stream-no-result');

/** Firebase-shaped error (the catch path only reads code/message/details). */
function callableError(code, message, details) {
  const e = new Error(message || code.replace('functions/', ''));
  e.code = code;
  if (details !== undefined) e.details = details;
  return e;
}

function isFunctionsError(err) {
  return typeof err?.code === 'string' && err.code.startsWith('functions/');
}

/**
 * Did this failure come from the function simply not existing in that region?
 *   not-found — the callable endpoint 404'd: certainly never reached the handler.
 *   internal/unavailable with a bare code-shaped message — no error body came
 *     back (a missing function's 404 page carries no CORS headers, so the SDK
 *     sees a network failure). Ambiguous: could also be a crash, see below.
 * Errors our handler raises always carry a descriptive message, so they never
 * match and are never retried in another region.
 */
function looksLikeMissingRegion(err) {
  const code = err?.code || '';
  if (code === 'functions/not-found') return true;
  const raw = (err?.message || '').toLowerCase();
  const generic = !raw || raw === code.replace('functions/', '').toLowerCase();
  return (code === 'functions/internal' || code === 'functions/unavailable') && generic;
}

/**
 * Accuracy rules sent with every web AI request (lesson plans, DLL, COT, tests,
 * action research, scanning...). Generators may write NEW teaching content, but
 * must never present invented facts as real. KaTuroDesk sends its own stricter
 * rules (services/desk/agent/grounding.js), so desk actions are skipped.
 */
export const WEB_ACCURACY_RULES = `ACCURACY RULES (kaTuro) — follow these with every instruction below:
1. You may write new teaching content when asked (activities, questions, explanations, rubrics).
2. Never invent facts and present them as real: DepEd/MATATAG competency codes, DepEd Order or memo numbers, laws, statistics, research citations, names of learners/teachers/schools/officials, scores, or dates.
3. Copy a competency code only if it appears in this request; otherwise leave the code empty.
4. If something you need is missing or unreadable (including marks on a scanned sheet), leave it empty or say it is missing. Never fill a gap with a typical or example value.
5. Keep exactly the output format requested below.`;

const SKIP_ACCURACY_RULES = new Set(['desk_agent_run', 'desk_agent_task', 'desk_voice']);

/** Puts WEB_ACCURACY_RULES in front of the first user message (once). Never mutates the input. */
export function withAccuracyRules(action, contents) {
  if (SKIP_ACCURACY_RULES.has(action) || !Array.isArray(contents) || !contents.length) return contents;
  const firstUser = contents.findIndex((c) => (c?.role || 'user') === 'user' && Array.isArray(c?.parts));
  if (firstUser === -1) return contents;
  const parts = contents[firstUser].parts;
  if (parts.some((p) => typeof p?.text === 'string' && p.text.startsWith('ACCURACY RULES (kaTuro)'))) return contents;
  const copy = contents.slice();
  copy[firstUser] = { ...contents[firstUser], parts: [{ text: WEB_ACCURACY_RULES }, ...parts] };
  return copy;
}

export async function callGeminiProxy({ action, contents: rawContents, temperature, maxTokens, responseMimeType, isRetry, unitCount, timeoutMs, tier, stream = false, onChunk, region }) {
  const contents = withAccuracyRules(action, rawContents);
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  // BUG-FIX: the client used to give up after 50s on every non-COT action.
  // That is SHORTER than the time the server legitimately needs to write a
  // 3-4k-token DLL / ILAW session / test-item payload, so the callable aborted
  // a generation that was still running fine and reported deadline-exceeded —
  // one half of why DLL, ILAW and Test Builder stopped working. The client
  // budget must always outlast the server's own budget for the same request
  // (see geminiBudgetMs in functions/index.js) plus its NVIDIA fallback.
  const isHeavy = action === 'cot_gen' || action === 'action_research_ai' || action === 'expand_slides' || action === 'desk_agent_run' || action === 'desk_agent_task';
  const serverBudgetMs = Math.min(180000, Math.max(45000, 30000 + (Number(maxTokens) || 2048) * 10));
  const effectiveTimeout = timeoutMs
    ?? (isHeavy ? 300000 : Math.min(300000, serverBudgetMs + 100000));

  const wantStream = stream === true && typeof onChunk === 'function';
  // New fields are only added when used, so a legacy call sends exactly the
  // same payload as before.
  const payload = { action, contents, temperature, maxTokens, responseMimeType, isRetry, unitCount };
  if (tier) payload.tier = tier;
  if (wantStream) payload.stream = true;

  // Streaming path. Returns { text, finishReason }, or { unavailable: true,
  // data } when the normal call should be used instead (with the payload to
  // send — isRetry is forced on if the stream attempt may already have been
  // charged). Throws Firebase-shaped errors
  // (code/message/details) so the shared catch below treats them exactly like
  // a non-streaming failure.
  const callStreaming = async (call, data) => {
    if (typeof call.stream !== 'function' || typeof ReadableStream === 'undefined') {
      return { unavailable: true, data };
    }
    // .stream() ignores the callable's `timeout` option, so enforce the same
    // budget with an AbortSignal and report it the way the SDK reports a
    // non-streaming timeout (deadline-exceeded).
    const timeoutCtl = new AbortController();
    const timer = setTimeout(() => timeoutCtl.abort(), effectiveTimeout);
    let full = '';
    let gotChunk = false;
    const fail = (err) => {
      if (timeoutCtl.signal.aborted) return callableError('functions/deadline-exceeded', 'deadline-exceeded');
      if (gotChunk) err.afterChunk = true; // the function exists: never retry another region
      return err;
    };
    try {
      let result;
      try {
        result = await call.stream(data, { signal: timeoutCtl.signal });
      } catch (err) {
        if (isFunctionsError(err) || timeoutCtl.signal.aborted) throw fail(err);
        // Non-HTTP failure (old SDK shape, no response body support...). The
        // request may already have reached the server, so the normal call is
        // marked isRetry: worst case one call goes uncharged, never twice.
        console.warn('[callGeminiProxy] Streaming unavailable, using the normal call:', err);
        return { unavailable: true, data: { ...data, isRetry: true } };
      }
      const finalData = Promise.resolve(result.data);
      finalData.catch(() => {}); // observed below; avoid an unhandled rejection if we bail early
      try {
        for await (const chunk of result.stream) {
          const delta = typeof chunk?.text === 'string' ? chunk.text : '';
          if (!delta) continue;
          full += delta;
          gotChunk = true;
          try {
            onChunk(delta, full);
          } catch (cbErr) {
            // A rendering bug in the caller must not abort the generation.
            console.warn('[callGeminiProxy] onChunk threw:', cbErr);
          }
        }
      } catch (err) {
        if (isFunctionsError(err) || timeoutCtl.signal.aborted || gotChunk) {
          throw fail(isFunctionsError(err) ? err : callableError('functions/internal', err?.message || 'internal'));
        }
        console.warn('[callGeminiProxy] Stream failed before any data, using the normal call:', err);
        return { unavailable: true, data: { ...data, isRetry: true } };
      }
      // The SDK settles `data` while reading the final SSE line, i.e. before the
      // stream closes. If the response was not an SSE callable response at all
      // (e.g. a proxy's HTML page) it never settles, so don't wait forever.
      const final = await Promise.race([
        finalData,
        new Promise((r) => setTimeout(() => r(STREAM_NO_RESULT), 50)),
      ]).catch((err) => { throw fail(err); });
      if (final === STREAM_NO_RESULT) {
        if (gotChunk) throw fail(callableError('functions/internal', 'The AI reply stream ended unexpectedly. Please try again.'));
        return { unavailable: true, data: { ...data, isRetry: true } };
      }
      return { text: final?.text ?? full, finishReason: final?.finishReason ?? null };
    } finally {
      clearTimeout(timer);
    }
  };

  const invoke = async (rgn, data) => {
    const call = httpsCallable(getFunctions(app, rgn), 'generateAI', { timeout: effectiveTimeout });
    let body = data;
    if (wantStream) {
      const r = await callStreaming(call, data);
      if (!r.unavailable) return r;
      body = { ...r.data };
      delete body.stream; // plain call: let the server take its non-streaming path
    }
    const res = await call(body);
    return { text: res.data?.text ?? '', finishReason: res.data?.finishReason ?? null };
  };

  const primary = region && region !== DEFAULT_REGION && !_unavailableRegions.has(region) ? region : DEFAULT_REGION;

  try {
    try {
      return await invoke(primary, payload);
    } catch (regionErr) {
      if (primary === DEFAULT_REGION || regionErr?.afterChunk || !looksLikeMissingRegion(regionErr)) throw regionErr;
      _unavailableRegions.add(primary);
      console.warn(`[callGeminiProxy] generateAI unavailable in ${primary} (${regionErr.code}); using ${DEFAULT_REGION} for this session.`);
      // Daily-usage safety: a 404 never reached the handler (nothing was
      // counted), so the retry is charged normally. The bare internal/unavailable
      // case is ambiguous — it could have been a crash AFTER the count — so that
      // retry is sent as isRetry: at worst one uncharged call per session, never
      // a double charge.
      const retryPayload = regionErr.code === 'functions/not-found' ? payload : { ...payload, isRetry: true };
      return await invoke(DEFAULT_REGION, retryPayload);
    }
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
        const isDesk = action === 'desk_agent_run' || action === 'desk_agent_task';
        const apiKey = await getGeminiKey(isDesk);
        if (apiKey) {
          console.log(`[callGeminiProxy] Swapping to direct Gemini client fallback...`);
          let models = [];
          try {
            models = await candidateModels(apiKey);
          } catch (listErr) {
            throw new Error('Could not determine a usable Gemini model for the direct fallback.', { cause: listErr });
          }
          const model = models[0];
          // cause is the original callable failure that sent us down the fallback path.
          if (!model) throw new Error('No usable Gemini model available for this key.', { cause: err });
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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
    // Google-side "high demand" (details.busy) is not a kaTuro bug and the server
    // already retried every model; reporting it only buried real errors in the inbox.
    if (!err?.details?.busy && (code === 'functions/internal' || code === 'functions/unavailable' || code === 'functions/deadline-exceeded')) {
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
    // Additive: callers used to lose the Firebase code entirely.
    if (code) e.code = code;
    if (err?.details !== undefined) e.details = err.details;
    if (code === 'functions/resource-exhausted') {
      e.status = 429;
      if (err?.details?.dailyLimit) e.dailyLimit = true;
      // Google's per-day cap: retrying cannot clear it before midnight, so
      // callers must stop rather than burn attempts (and the user's in-app
      // daily allowance) on something that can only fail.
      if (err?.details?.quotaExhausted) e.quotaExhausted = true;
      // Google's own retry delay, when it gave one. Callers previously read
      // e.retryAfter and nothing ever set it, so every backoff silently fell
      // back to a hardcoded 30s.
      if (err?.details?.retryAfter) e.retryAfter = err.details.retryAfter;
    } else if (code === 'functions/unauthenticated') {
      e.reason = 'unauthenticated';
    } else if (isDeadline) {
      e.status = 408;
    }
    throw e;
  }
}

/**
 * Pick a model this key can actually use, newest flash first.
 *
 * Never hardcode a model name here. Both call sites below used to pin
 * gemini-2.0-flash; Google retired it, which silently killed the direct-Gemini
 * fallback AND made the admin "Test" button report a perfectly valid key as
 * broken ("models/gemini-2.0-flash is no longer available").
 */
async function candidateModels(apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} — the key may be invalid.`);
  const data = await res.json();
  const rank = (id) => {
    const m = /^gemini-(\d+)(?:\.(\d+))?-flash(-lite)?$/.exec(id);
    return m ? { major: +m[1], minor: +(m[2] || 0), lite: !!m[3] } : null;
  };
  return (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => String(m.name).replace('models/', ''))
    .filter(id => !/(preview|-exp|experimental|tts|image|audio|live|embedding|vision|learnlm)/i.test(id))
    .map(id => ({ id, r: rank(id) }))
    .filter(x => x.r)
    .sort((a, b) => b.r.major - a.r.major || b.r.minor - a.r.minor || (a.r.lite ? 1 : 0) - (b.r.lite ? 1 : 0))
    .map(x => x.id);
}

/** Admin-only: save a new Web Gemini key to Firestore */
export async function saveGeminiKey(apiKey, adminUid) {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) throw new Error('API key cannot be empty.');
  assertHeaderSafeKey(trimmed, 'Gemini API key');

  const preview = trimmed.slice(0, 8) + '•'.repeat(16) + trimmed.slice(-4);

  await setDoc(CONFIG_REF, {
    apiKey:    trimmed,
    preview,
    hasKey:    true,
    updatedAt: new Date(),
    updatedBy: adminUid,
  }, { merge: true });

  invalidateKeyCache();
}

/** Admin-only: save a dedicated KaTuroDesk Gemini key to Firestore */
export async function saveDeskGeminiKey(apiKey, adminUid) {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) throw new Error('KaTuroDesk API key cannot be empty.');
  assertHeaderSafeKey(trimmed, 'KaTuroDesk Gemini API key');

  const deskPreview = trimmed.slice(0, 8) + '•'.repeat(16) + trimmed.slice(-4);

  await setDoc(CONFIG_REF, {
    deskApiKey:    trimmed,
    deskPreview,
    hasDeskKey:    true,
    deskUpdatedAt: new Date(),
    deskUpdatedBy: adminUid,
  }, { merge: true });

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

/** Admin-only: read Web display info (never exposes the full key) */
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

/** Admin-only: read KaTuroDesk display info (never exposes the full key) */
export async function getDeskGeminiKeyStatus() {
  try {
    const snap = await getDoc(CONFIG_REF);
    if (!snap.exists()) return { hasKey: false };
    const d = snap.data();
    if (!d.deskApiKey && !d.hasDeskKey) return { hasKey: false };
    return {
      hasKey:    true,
      preview:   d.deskPreview || '••••••••••••••••••••••••••••',
      updatedAt: d.deskUpdatedAt ?? null,
    };
  } catch {
    return { hasKey: false, error: true };
  }
}

/** Quick validity test: send a tiny prompt to Gemini */
export async function testGeminiKey(apiKey) {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) throw new Error('API key is required.');
  assertHeaderSafeKey(trimmed, 'Gemini API key');

  // Walk the key's own catalogue rather than pinning one model. A single model
  // can be temporarily congested (gemini-3.7-flash returns 503 under load), and
  // that says nothing about whether the KEY is good — which is the only thing
  // this button is meant to answer. Pass if any model accepts the key.
  const models = await candidateModels(trimmed);
  if (models.length === 0) throw new Error('This key cannot reach any Gemini generation model.');

  let lastErr = 'unknown error';
  for (const model of models.slice(0, 4)) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${trimmed}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }],
          // Generous because 3.x models spend part of the budget "thinking";
          // 8 tokens was never enough to get an answer back.
          generationConfig: { maxOutputTokens: 2610, temperature: 0 },
        }),
      }
    );
    if (res.ok) return { ok: true, model };
    const err = await res.json().catch(() => ({}));
    lastErr = err?.error?.message ?? `HTTP ${res.status}`;
    // 503 means that model is busy, not that the key is bad — try the next one.
    // Anything else (401/403/400) is about the key, so stop and report it.
    if (res.status !== 503) throw new Error(lastErr);
  }
  throw new Error(`Every model is busy right now, so the key could not be confirmed. Last response: ${lastErr}`);
}
