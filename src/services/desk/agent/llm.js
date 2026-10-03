/**
 * llm.js — the one place KaTuroDesk talks to Gemini (through the KaTuro Cloud
 * gateway `generateAI`, which holds the API key and applies daily limits).
 *
 * - `desk_agent_run`  : the planner call, one per teacher turn
 * - `desk_agent_task` : sub-task calls inside a turn (document drafting, vision reads).
 *   Until the Cloud Function with that action is deployed, sub-tasks fall back to desk_agent_run.
 */

import { callGeminiProxy } from '../../geminiConfig';

export class AIUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AIUnavailableError';
    this.code = 'AI_UNAVAILABLE';
    this.cause = cause;
  }
}

let taskActionSupported = true;

/** Test hook: forget that the deployed gateway lacked desk_agent_task. */
export function resetTaskActionSupport() {
  taskActionSupported = true;
}

// callGeminiProxy re-throws a plain Error: the Firebase `code` is dropped and only
// message / status / dailyLimit / reason survive, so match on those (and on code for raw errors).
function isUnknownActionError(err) {
  return /unknown or missing action/i.test(err?.message || '');
}

function isDailyLimitError(err) {
  return Boolean(err?.dailyLimit || err?.details?.dailyLimit);
}

function isAuthError(err) {
  return err?.reason === 'unauthenticated' || /unauthenticated|must be signed in/i.test(`${err?.code} ${err?.message}`);
}

const TRANSIENT_RE = /internal|unavailable|deadline|aborted|network|fetch|offline|took too long|went wrong on our end|try again/i;

/**
 * Builds Gemini `contents`. The gateway has no systemInstruction field, so the
 * system prompt rides in front of the first user turn.
 * history: [{ role: 'user'|'assistant', content }]
 * parts:   extra parts for the final user turn, e.g. { inlineData: { mimeType, data } }
 */
export function buildContents({ system, history = [], prompt, parts = [] }) {
  const contents = [];
  const turns = history.filter((m) => m && m.content && (m.role === 'user' || m.role === 'assistant'));
  // Gemini requires the conversation to start with a user turn.
  while (turns.length && turns[0].role !== 'user') turns.shift();

  for (const m of turns) {
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content).slice(0, 4000) }] });
  }
  contents.push({ role: 'user', parts: [{ text: prompt }, ...parts] });

  if (system) {
    const first = contents[0];
    first.parts = [{ text: `${system}\n\n---\n\n${first.parts[0].text}` }, ...first.parts.slice(1)];
  }

  // Merge accidental consecutive same-role turns (Gemini rejects them).
  return contents.reduce((acc, c) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.role === c.role) prev.parts.push(...c.parts);
    else acc.push(c);
    return acc;
  }, []);
}

/** Pulls a JSON value out of a model reply (tolerates ```json fences and chatter). */
export function parseJsonReply(text) {
  if (text && typeof text === 'object') return text;
  const s = String(text || '').trim();
  try {
    return JSON.parse(s);
  } catch {
    // fall through
  }
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // fall through
    }
  }
  const start = s.search(/[{[]/);
  if (start >= 0) {
    const open = s[start];
    const close = open === '{' ? '}' : ']';
    const end = s.lastIndexOf(close);
    if (end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
  }
  throw new Error('The AI reply was not valid JSON.');
}

// KaTuroDesk calls prefer the Singapore deployment (closest to PH); the gateway
// falls back to us-central1 by itself when asia-southeast1 isn't deployed yet.
export const DESK_REGION = 'asia-southeast1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Short-lived Gemini/gateway throttling (not the teacher's daily limit). */
function isRateLimited(err) {
  // quotaExhausted = Google's own per-day cap: retrying can't help before midnight.
  return (err?.status === 429 || err?.code === 'functions/resource-exhausted') && !isDailyLimitError(err) && !err?.quotaExhausted;
}

async function proxyCall({ action, contents, json, maxTokens, temperature, isRetry, tier, onText }) {
  const res = await callGeminiProxy({
    action,
    contents,
    temperature,
    maxTokens,
    tier,
    region: DESK_REGION,
    ...(json ? { responseMimeType: 'application/json' } : {}),
    ...(isRetry ? { isRetry: true } : {}),
    ...(typeof onText === 'function' ? { stream: true, onChunk: (_delta, full) => onText(full) } : {}),
  });
  const text = typeof res === 'string' ? res : res?.text || '';
  if (!text.trim()) throw new Error('The AI returned an empty reply.');
  return { text, finishReason: res?.finishReason || null };
}

/**
 * Calls the model. Returns text, or parsed JSON when `json` is true.
 * Retries once on malformed JSON / truncation (marked isRetry so it doesn't burn a daily unit).
 * Throws AIUnavailableError when the gateway can't be reached at all.
 */
export async function callDeskLLM({
  system,
  history,
  prompt,
  parts,
  json = false,
  maxTokens = 4096,
  temperature = 0.4,
  kind = 'task', // 'plan' | 'task'
  tier, // 'fast' (flash-lite, small JSON jobs) | 'standard'; planner defaults to fast
  onText, // optional: receives the reply text as it streams in
}) {
  const contents = buildContents({ system, history, prompt, parts });
  let action = kind === 'plan' || !taskActionSupported ? 'desk_agent_run' : 'desk_agent_task';
  const effectiveTier = tier || (kind === 'plan' ? 'fast' : 'standard');

  let lastErr = null;
  let rateRetries = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text, finishReason } = await proxyCall({ action, contents, json, maxTokens, temperature, isRetry: attempt > 0 || rateRetries > 0, tier: effectiveTier, onText });
      if (!json) return text;
      try {
        return parseJsonReply(text);
      } catch (parseErr) {
        lastErr = finishReason === 'MAX_TOKENS'
          ? new Error('The AI reply was cut off (too long). Try asking for a shorter document.')
          : parseErr;
        continue;
      }
    } catch (err) {
      if (action === 'desk_agent_task' && isUnknownActionError(err)) {
        taskActionSupported = false;
        action = 'desk_agent_run';
        attempt -= 1;
        continue;
      }
      if (isDailyLimitError(err)) {
        const e = new AIUnavailableError(err?.message || "You've reached today's KaTuroDesk AI limit. It resets tomorrow.", err);
        e.dailyLimit = true;
        throw e;
      }
      // Throttling clears in seconds: back off 1s, 2s, 4s before giving up.
      if (isRateLimited(err) && rateRetries < 3) {
        await sleep(1000 * 2 ** rateRetries);
        rateRetries += 1;
        attempt -= 1;
        continue;
      }
      if (isAuthError(err)) {
        throw new AIUnavailableError('Please sign in to your KaTuro account to use the AI features.', err);
      }
      lastErr = err;
      const transient = TRANSIENT_RE.test(`${err?.code} ${err?.message}`) || err?.status === 408;
      if (!transient) break;
    }
  }
  if (lastErr && !(lastErr instanceof AIUnavailableError) && (TRANSIENT_RE.test(`${lastErr.code} ${lastErr.message}`) || lastErr.status === 408)) {
    throw new AIUnavailableError('The KaTuro AI service could not be reached. Check your internet connection.', lastErr);
  }
  throw lastErr || new Error('AI call failed.');
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

/**
 * Shrinks large photos before sending them to the vision model (phone photos are
 * often 4–8 MB; the gateway payload limit is ~10 MB). Browser only; returns input unchanged elsewhere.
 */
export async function prepareImageForVision(bytes, mimeType, { maxDim = 2000, maxBytes = 1_500_000 } = {}) {
  if (bytes.length <= maxBytes || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    return { mimeType, data: bytesToBase64(bytes) };
  }
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    return { mimeType: 'image/jpeg', data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
  } catch {
    return { mimeType, data: bytesToBase64(bytes) };
  }
}
