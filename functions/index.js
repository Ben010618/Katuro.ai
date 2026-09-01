/**
 * kaTuro AI — Firebase Cloud Functions
 *
 * Before deploying, set the Gemini key as a secret:
 *   firebase functions:secrets:set GEMINI_API_KEY
 *
 * Deploy:
 *   cd functions && npm install
 *   cd .. && firebase deploy --only functions
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule }         = require('firebase-functions/v2/scheduler');
const { onDocumentCreated }  = require('firebase-functions/v2/firestore');
const admin                  = require('firebase-admin');
const crypto                 = require('crypto');

admin.initializeApp();
const db = admin.firestore();

// ── Model resolution ─────────────────────────────────────────────────────────
// BUG-FIX (2026-08-24): the model name used to be two hardcoded constants,
// 'gemini-2.0-flash' with 'gemini-1.5-flash' as backup. Google retired BOTH,
// so every generator 404'd — and the "backup" was just as dead as the primary,
// because a hardcoded fallback rots on exactly the same schedule as what it is
// backing up. Instead of swapping in another name that will age out the same
// way, ask the API which models actually exist and pick the best one.
//
// Order of authority:
//   1. adminConfig/gemini.model  — explicit pin, for when an admin needs a
//      specific model (set from Admin -> API Settings, no redeploy needed)
//   2. ListModels                — newest usable flash model the key can reach
//   3. STATIC_FALLBACK_MODELS    — only if ListModels itself is unreachable
// Verified working against the live API on 2026-08-25. Only consulted when
// ListModels itself is unreachable — never as a silent default, since this is
// the exact kind of list that rots.
const STATIC_FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-lite-latest'];
const MODEL_CACHE_TTL = 60 * 60 * 1000; // 1h per instance

let _modelCache = { name: null, at: 0 };

// ListModels is NOT proof a model is usable. Two distinct failures were seen
// on 2026-08-25, both from models the API happily listed:
//   404 - 'gemini-2.5-flash is no longer available to new users' (retired)
//   503 - 'gemini-3.7-flash is experiencing high demand'         (congested)
// The newest model is often the most congested, so ranking purely by version
// would keep steering every request into the one model that cannot serve it.
// A model that fails this way is benched, and resolution skips it until the
// cooldown expires — 24h for a retirement, 10min for a capacity blip.
const RETIRED_COOLDOWN_MS   = 24 * 60 * 60 * 1000;
const CONGESTED_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_COOLDOWN_MS       = 6 * 60 * 60 * 1000;
const _benched = new Map();     // model -> benched-until timestamp
const _benchStrikes = new Map(); // model -> consecutive bench count

function invalidateModelCache() {
  _modelCache = { name: null, at: 0 };
}

/**
 * Bench a model. A repeat offender is benched for longer each time.
 *
 * A flat cooldown re-probes a persistently bad model forever: gemini-3.7-flash
 * answered a trivial ping in 1.6s but returned 503 on every real generation
 * workload across 2026-08-25 and 08-26, so a fixed 10min bench meant one
 * unlucky teacher every 10 minutes paid ~19-35s discovering that again.
 * Doubling per strike drops a genuinely broken model out of rotation while
 * still letting a briefly-congested one back in quickly.
 *
 * Strike counts live in instance memory, so a cold start forgives them — which
 * is the right bias: better to occasionally re-probe a recovered model than to
 * permanently exile one on stale evidence.
 */
// Bench windows are mirrored to Firestore. Cloud Run cycles instances
// constantly, and an in-memory-only bench means every fresh instance
// re-discovers the same broken model at full price — gemini-3.7-flash was
// taking 148s to admit it was congested, so each cold start burned ~100s of a
// teacher's wait before switching. Sharing the window means one instance pays
// that once and the rest skip straight to a model that works.
//
// Only the window is shared, not the strike count: strikes stay per-instance so
// a cold start still forgives them, which keeps the bias toward re-probing a
// recovered model rather than exiling one on stale evidence.
const MODEL_HEALTH_DOC = 'adminConfig/modelHealth';
const HEALTH_TTL_MS    = 60000;
let _healthLoadedAt    = 0;

async function loadSharedBench() {
  if (Date.now() - _healthLoadedAt < HEALTH_TTL_MS) return;
  _healthLoadedAt = Date.now();
  try {
    const snap = await db.doc(MODEL_HEALTH_DOC).get();
    const data = snap.exists ? (snap.data()?.benched ?? {}) : {};
    for (const [model, until] of Object.entries(data)) {
      const ts = Number(until) || 0;
      // Keep whichever window runs longer — a local strike may be harsher than
      // what another instance recorded.
      if (ts > (_benched.get(model) ?? 0)) _benched.set(model, ts);
    }
  } catch {
    // A health-doc read failure must never block generation.
  }
}

function benchModel(model, baseMs) {
  const strikes = (_benchStrikes.get(model) ?? 0) + 1;
  _benchStrikes.set(model, strikes);
  const ms    = Math.min(MAX_COOLDOWN_MS, baseMs * (2 ** (strikes - 1)));
  const until = Date.now() + ms;
  _benched.set(model, until);
  invalidateModelCache();
  console.warn(`[benchModel] ${model} benched for ${Math.round(ms / 60000)}min (strike ${strikes})`);
  // Fire-and-forget: sharing the bench is an optimisation, not a correctness
  // requirement, so a write failure must not fail the generation.
  db.doc(MODEL_HEALTH_DOC)
    .set({ benched: { [model]: until }, updatedAt: new Date() }, { merge: true })
    .catch(() => {});
}

/** A model that served a request successfully has earned its record back. */
function clearBenchStrikes(model) {
  if (_benchStrikes.delete(model)) {
    console.info(`[benchModel] ${model} succeeded — strike count reset`);
    // Clear the shared window too, so other instances stop skipping a model
    // that has demonstrably recovered.
    _benched.delete(model);
    db.doc(MODEL_HEALTH_DOC)
      .set({ benched: { [model]: 0 }, updatedAt: new Date() }, { merge: true })
      .catch(() => {});
  }
}

function isBenched(model) {
  const until = _benched.get(model);
  if (!until) return false;
  if (Date.now() > until) { _benched.delete(model); return false; }
  return true;
}

// 'gemini-2.5-flash' -> {major:2, minor:5, lite:false}; null if not a flash model.
function scoreFlashModel(id) {
  const m = /^gemini-(\d+)(?:\.(\d+))?-flash(-lite)?$/.exec(id);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2] || 0), lite: !!m[3] };
}

async function listGeminiModels(key) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`ListModels ${res.status}`);
  const data = await res.json();
  return (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => String(m.name).replace('models/', ''))
    // Preview/experimental builds get withdrawn without notice, and the
    // specialised variants can't serve general text generation.
    .filter(id => !/(preview|-exp|experimental|tts|image|audio|live|embedding|vision|learnlm)/i.test(id));
}

/**
 * Resolve the model to use, preferring the newest non-lite flash model the key
 * can actually reach. `exclude` skips models already known to be dead this
 * request (a 404 on the resolved model re-resolves rather than giving up).
 */
async function resolveGeminiModel(key, exclude = []) {
  await loadSharedBench();
  const skip = id => exclude.includes(id) || isBenched(id);

  if (!exclude.length && _modelCache.name && Date.now() - _modelCache.at < MODEL_CACHE_TTL) {
    return _modelCache.name;
  }

  // 1. Explicit admin pin always wins.
  try {
    const pinned = (await db.doc('adminConfig/gemini').get()).data()?.model;
    if (pinned && !skip(pinned)) {
      _modelCache = { name: pinned, at: Date.now() };
      return pinned;
    }
  } catch {
    // Firestore unreachable — fall through to discovery.
  }

  // 2. Ask the API what exists.
  try {
    const available = (await listGeminiModels(key)).filter(id => !skip(id));
    const flash = available
      .map(id => ({ id, s: scoreFlashModel(id) }))
      .filter(x => x.s)
      .sort((a, b) =>
        b.s.major - a.s.major ||
        b.s.minor - a.s.minor ||
        (a.s.lite ? 1 : 0) - (b.s.lite ? 1 : 0)   // full flash before -lite
      );
    const picked = flash[0]?.id
      || available.find(id => /^gemini-flash(-lite)?-latest$/.test(id))
      || available.find(id => /^gemini-[\d.]+-pro$/.test(id))
      || available[0];
    if (picked) {
      const benched = [..._benched.keys()].filter(isBenched);
      console.info(`[resolveGeminiModel] Using ${picked} (${available.length} usable${exclude.length ? `, excluded: ${exclude.join(', ')}` : ''}${benched.length ? `, benched: ${benched.join(', ')}` : ''})`);
      _modelCache = { name: picked, at: Date.now() };
      return picked;
    }
    console.error('[resolveGeminiModel] ListModels returned no usable model!');
  } catch (err) {
    console.warn(`[resolveGeminiModel] Discovery failed (${err.message}) — using static fallback list.`);
  }

  // 3. Last resort.
  const fallback = STATIC_FALLBACK_MODELS.find(m => !skip(m)) || STATIC_FALLBACK_MODELS[0];
  _modelCache = { name: fallback, at: Date.now() };
  return fallback;
}

// ── Model capability matrix ───────────────────────────────────────────────────
// thinkingConfig (thinkingBudget) is ONLY supported by gemini-2.5-flash and
// gemini-2.5-pro. Sending it to any other model causes HTTP 400 "Unknown field"
// errors that break ALL AI generation. Add new models here only after verifying
// the capability in the Gemini API documentation.
const THINKING_CAPABLE_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-pro-preview',
]);

// Fails closed on purpose: an unknown or newer model simply doesn't get
// thinkingConfig, which is always a VALID request. Guessing the other way
// would send an unsupported field and 400 the whole generation.
function supportsThinking(model) {
  return THINKING_CAPABLE_MODELS.has(model);
}

// Startup validation — logs the active model at cold-start so any accidental
// model change is immediately visible in Cloud Logging without reproducing an error.
console.info('[kaTuro] AI model: resolved per-request from ListModels (admin pin: adminConfig/gemini.model)');

// Read API key from adminConfig/gemini in Firestore (set via Admin Dashboard)
async function getGeminiKey() {
  const snap = await db.doc('adminConfig/gemini').get();
  if (!snap.exists || !snap.data()?.apiKey) {
    throw new HttpsError('failed-precondition', 'Gemini API key not configured. Set it in the Admin Dashboard → API Settings.');
  }
  return snap.data().apiKey;
}

// Read NVIDIA API key from adminConfig/nvidia in Firestore
async function getNvidiaConfigServer() {
  try {
    const snap = await db.doc('adminConfig/nvidia').get();
    if (snap.exists && snap.data()?.apiKey) {
      return {
        apiKey: snap.data().apiKey,
        model:  snap.data().model || 'meta/llama-3.3-70b-instruct',
      };
    }
  } catch {
    // Fall back to Gemini if reading nvidia config fails
  }
  return null;
}

function extractPromptFromContents(contents) {
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

async function callNvidiaServer(nvidiaConfig, prompt, { temperature = 0.4, maxTokens = 2048, responseMimeType, _attempt = 0 } = {}) {
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const payload = {
    model: nvidiaConfig.model || 'meta/llama-3.3-70b-instruct',
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens,
  };
  if (responseMimeType === 'application/json') {
    payload.response_format = { type: 'json_object' };
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${nvidiaConfig.apiKey}`,
      },
      body: JSON.stringify(payload),
      // 40s per attempt, at most 2 attempts (~82s worst case) — this fallback
      // runs AFTER Gemini has already spent up to 180s, and the whole function
      // must still return inside its 300s timeout.
      signal: AbortSignal.timeout(40000),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new HttpsError(
      timedOut ? 'deadline-exceeded' : 'unavailable',
      timedOut ? 'NVIDIA NIM did not respond in time.' : `Could not reach NVIDIA NIM: ${err?.message || 'network error'}`
    );
  }

  if ((res.status === 429 || res.status === 503) && _attempt < 1) {
    const delay = 1500 + Math.random() * 500;
    await new Promise(r => setTimeout(r, delay));
    return callNvidiaServer(nvidiaConfig, prompt, { temperature, maxTokens, responseMimeType, _attempt: _attempt + 1 });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const isRateLimit = res.status === 429;
    throw new HttpsError(
      isRateLimit ? 'resource-exhausted' : 'internal',
      isRateLimit
        ? 'The NVIDIA AI service is busy right now. Please try again in a moment.'
        : `NVIDIA NIM ${res.status}: ${err?.error?.message ?? res.statusText}`
    );
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  return text;
}
const CACHE_TTL_DAYS = 30;
const EXPAND_TOKENS  = 3;

// Subjects that need Tagalog output
const TAGALOG_SUBJECTS = ['filipino', 'araling panlipunan'];
// Values/character-education subjects call for a warmer, conversational
// register than the more academic-formal Filipino used for Araling Panlipunan.
const CONVERSATIONAL_TAGALOG_SUBJECTS = ['gmrc', 'epp', 'esp', 'edukasyon sa pagpapakatao'];

function isTagalog(subject) {
  const s = (subject || '').toLowerCase();
  return TAGALOG_SUBJECTS.some(t => s.includes(t)) || CONVERSATIONAL_TAGALOG_SUBJECTS.some(t => s.includes(t));
}
function isConversationalTagalog(subject) {
  const s = (subject || '').toLowerCase();
  return CONVERSATIONAL_TAGALOG_SUBJECTS.some(t => s.includes(t));
}
function langLabel(subject) {
  if (isConversationalTagalog(subject)) return 'formal conversational Tagalog';
  return isTagalog(subject) ? 'Filipino/Tagalog' : 'English';
}

// model is always resolved by the caller now — no hardcoded default to rot.
function geminiUrl(key, model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
}

async function callGemini(key, prompt, { temperature = 0.5, maxTokens = 2048, model, _attempt = 0, _tried = [] } = {}) {
  const activeModel = model || await resolveGeminiModel(key, _tried);
  // PREVENTIVE: Only add thinkingConfig for models that support it — sending it
  // to a model that doesn't causes a 400 that breaks the whole generation.
  const genConfig = {
    temperature,
    maxOutputTokens: withThinkingHeadroom(maxTokens),
    ...(supportsThinking(activeModel) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
  };
  const res = await fetch(geminiUrl(key, activeModel), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: genConfig,
    }),
  });

  // 404 = this model was retired. Drop it, re-resolve against the live model
  // list, and try the next best — never fall through to another hardcoded name.
  if (res.status === 404) {
    const tried = [..._tried, activeModel];
    benchModel(activeModel, RETIRED_COOLDOWN_MS);
    if (tried.length < 4) {
      console.warn(`[callGemini] Model ${activeModel} returned 404 (retired) — re-resolving (tried: ${tried.join(', ')})`);
      return callGemini(key, prompt, { temperature, maxTokens, _attempt, _tried: tried });
    }
  }

  // 503 = this model has no capacity; bench it and switch rather than retrying
  // into the same wall. See the matching comment in callGeminiRaw.
  if (res.status === 503) {
    const tried = [..._tried, activeModel];
    benchModel(activeModel, CONGESTED_COOLDOWN_MS);
    if (tried.length < 4) {
      console.warn(`[callGemini] Model ${activeModel} is congested (503) — switching model (tried: ${tried.join(', ')})`);
      return callGemini(key, prompt, { temperature, maxTokens, _attempt: 0, _tried: tried });
    }
  }

  // Retry on 429 (rate limit) or 503 (overloaded) with exponential backoff
  if (res.status === 429 && _attempt < 4) {
    const delay = (2 ** _attempt) * 1000 + Math.random() * 500; // 1s, 2s, 4s, 8s + jitter
    await new Promise(r => setTimeout(r, delay));
    return callGemini(key, prompt, { temperature, maxTokens, model: activeModel, _attempt: _attempt + 1, _tried });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const isRateLimit = res.status === 429;
    // Log 400 errors with full detail — these are almost always a model/param mismatch
    if (res.status === 400) {
      console.error(`[callGemini] 400 Bad Request for model ${activeModel}:`, JSON.stringify(err?.error));
    }
    throw new HttpsError(
      isRateLimit ? 'resource-exhausted' : 'internal',
      isRateLimit
        ? 'The AI service is busy right now. Please try again in a moment.'
        : `Gemini ${res.status} (${activeModel}): ${err?.error?.message ?? res.statusText}`
    );
  }

  const data  = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map(p => p.text ?? '').join('');
}

// FIX: Added trailing-comma strip and truncation repair — mirrors the client's parseAIJson
// multi-layer repair chain. The old single-parse was causing hard failures from Gemini's
// most common output quirk (trailing comma before } or ]) on DLL, outline, and slide generation.
function stripTrailingCommas(s) {
  return s.replace(/,(\s*[}\]])/g, '$1');
}
function parseJSON(text, label) {
  const m = text.match(/```json\s*([\s\S]*?)```/) ||
            text.match(/```\s*([\s\S]*?)```/)     ||
            text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/s);
  const raw = m ? (m[1] ?? m[0]).trim() : text.trim();
  if (!raw) throw new HttpsError('internal', `AI returned no JSON for ${label}`);
  // Layer 1: direct parse
  try { return JSON.parse(raw); } catch {}
  // Layer 2: trailing-comma strip (most common Gemini quirk)
  try { return JSON.parse(stripTrailingCommas(raw)); } catch {}
  // Layer 3: strip + dangling-quote / bracket close
  try {
    let s = raw.replace(/,(\s*[}\]])/g, '$1').trimEnd();
    // Close any dangling quote
    const qCount = (s.match(/(?<!\\)"/g) || []).length;
    if (qCount % 2 !== 0) s += '"';
    // Close unclosed brackets/braces
    const stack = [];
    let inStr = false, esc = false;
    for (const c of s) {
      if (esc)                    { esc = false; continue; }
      if (c === '\\' && inStr)   { esc = true;  continue; }
      if (c === '"')              { inStr = !inStr; continue; }
      if (inStr)                  continue;
      if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
      else if ((c === '}' || c === ']') && stack.length) stack.pop();
    }
    s += stack.reverse().join('');
    return JSON.parse(s);
  } catch {}
  throw new HttpsError('internal', `AI returned malformed JSON for ${label}. Please try again.`);
}

function cacheKey(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 32);
}

// ── Per-user daily limits (applied in free mode too — abuse prevention) ────────
const DAILY_LIMITS = {
  outline_gen:      15,  // generateOutline
  expand_slides:     5,  // expandSlides (most expensive)
  dll_gen:          10,  // DLL generation (client calls server via usageLimit, but also guard here)
  cot_gen:           8,
  quiz_gen:         10,
  gamification_gen: 10,
};

// ── generateAI proxy — actions accepted, each with its own daily ceiling ──────
// This is the ONLY set of actions the generic proxy (below) will run — keeps it
// from becoming an open "run any prompt" endpoint. Reuses dll_gen/cot_gen/
// quiz_gen/gamification_gen above so those features have exactly one limit.
const PROXY_LIMITS = {
  ilaw_unpack:         20,  // unpackCompetency — one call per lesson plan
  // FIX: Raised from 60 → 120. A 5-day ILAW plan = 5 calls; teachers regenerate
  // multiple times. 60/day was causing "daily limit" blocks by mid-morning in active schools.
  ilaw_session:        120, // generateIlawSession — one call per session, several per plan
  quiz_title:         100,  // suggestQuizTitle — tiny, cheap, near-free
  // FIX: Raised from 10 → 20. Morning testing sessions (whole class = many retries) hit 10 fast.
  quiz_gen:            20,
  // FIX: Raised from 8 → 15. Observation week requires drafts + revisions.
  cot_gen:             15,
  dll_gen:             10,
  gamification_gen:    10,  // shared across all 6 worksheet generators
  test_builder_blooms: 30,  // suggestCognitiveWeights
  test_builder_items:  60,  // generateItemsForCompetency — one call per TOS row
  action_research_ai:  30,  // shared across all 6 AR generation phases (matches existing client limit)
  ar_problem_suggest:  60,  // live-as-you-type problem-statement suggestion in AR Phase 1 — cheap (512 tokens), debounced, but was previously calling Gemini directly from the client with no limit at all
  scan_answer_sheet:   80,  // one call per photographed sheet — a class set can be 40-60
  protect_chat:        40,  // kaTuro Protect chat + collabAIReply — shared 40/day limit
  melc_validate:       50,  // validateMelcCode — one call per lesson-plan save, generous headroom
};
Object.assign(DAILY_LIMITS, PROXY_LIMITS);

// ── Per-call size caps ────────────────────────────────────────────────────
// A handful of actions have a per-call "size" that the UI already bounds
// (e.g. ILAW's number of teaching days, capped at 5 by the Step 1 calendar)
// but that bound is enforced client-side only — a modified/replayed request
// could otherwise ask for far more per call while staying under the daily
// call-count limit above. Callers that have such a size pass it as
// `unitCount`; this re-checks it server-side. Not listed = no such cap.
const MAX_UNITS = {
  ilaw_unpack: 5, // numberOfDays — matches Step1.jsx's 5-day teaching calendar cap
};

// `new Date().toISOString()` is UTC — Philippine time is UTC+8, so that date
// flips at 8 AM local time, not midnight, leaving teachers blocked for hours
// after their own clock says "tomorrow." Every daily-limit bucket must use
// the Manila calendar date instead.
function todayInManila() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); // en-CA formats as YYYY-MM-DD
}

async function checkAndIncrementDailyUsage(uid, action) {
  const limit = DAILY_LIMITS[action];
  if (!limit) return;
  const today = todayInManila();
  const ref   = db.doc(`teachers/${uid}/usage/${today}`);

  await db.runTransaction(async tx => {
    const snap    = await tx.get(ref);
    const current = snap.data()?.[action] ?? 0;
    if (current >= limit) {
      throw new HttpsError(
        'resource-exhausted',
        `You've reached today's limit (${limit}) for this feature. kaTuro resets at midnight. Come back tomorrow!`,
        { dailyLimit: true } // lets the client skip retrying — this won't clear up in the next few seconds
      );
    }
    tx.set(ref, {
      [action]:  admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

// ── Global free-mode flag — reads adminConfig/billing ───────────────────────
// Cached per instance for 5 minutes to avoid a Firestore read on every call.
let _freeModeCache = null;
let _freeModeExpiry = 0;

async function isFreeModeEnabled() {
  const now = Date.now();
  if (_freeModeCache !== null && now < _freeModeExpiry) return _freeModeCache;
  const snap = await db.doc('adminConfig/billing').get();
  _freeModeCache  = snap.data()?.freeMode === true;
  _freeModeExpiry = now + 5 * 60 * 1000; // 5-min TTL
  return _freeModeCache;
}

async function deductTokensServer(uid, action, cost) {
  if (!cost || cost <= 0) return;

  // Free-mode: skip deduction entirely but still log the action
  if (await isFreeModeEnabled()) {
    await db.collection(`teachers/${uid}/tokenLogs`).add({
      uid, amount: 0, action, freeMode: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
    return;
  }

  const ref = db.doc(`teachers/${uid}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'User profile not found.');
    const balance = snap.data().tokenBalance ?? 0;
    if (balance < cost) {
      throw new HttpsError(
        'resource-exhausted',
        'Not enough tokens. Ask your administrator to add tokens, or wait — kaTuro will be free during our launch period.'
      );
    }
    tx.update(ref, {
      tokenBalance: admin.firestore.FieldValue.increment(-cost),
      updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await db.collection(`teachers/${uid}/tokenLogs`).add({
    uid, amount: -cost, action,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ── adminChangePassword ──────────────────────────────────────────────────────
exports.adminChangePassword = onCall(
  { region: 'us-central1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const callerSnap = await db.doc(`teachers/${req.auth.uid}`).get();
    if (!callerSnap.exists || !callerSnap.data().isAdmin) {
      throw new HttpsError('permission-denied', 'Admins only.');
    }

    const { uid, password } = req.data;
    if (!uid || !password || password.length < 6) {
      throw new HttpsError('invalid-argument', 'uid and password (min 6 chars) are required.');
    }

    // Update Firebase Auth — the only safe place to store credentials.
    // BUG-FIX: Do NOT write plaintext password to Firestore; Firebase Auth
    // already stores it hashed. Writing it to Firestore exposes it to any
    // client that can read the teacher doc (including the teacher themselves).
    await admin.auth().updateUser(uid, { password });
    await db.doc(`teachers/${uid}`).update({
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  }
);

// ── generateOutline ─────────────────────────────────────────────────────────
// Free to call — lets teachers iterate on the outline before committing tokens.
exports.generateOutline = onCall(
  { region: 'us-central1', timeoutSeconds: 60 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');
    await checkAndIncrementDailyUsage(req.auth.uid, 'outline_gen');

    const { subject, gradeLevel, melcCode, topic, slideCount = 12 } = req.data;
    if (!subject || !gradeLevel || !topic) {
      throw new HttpsError('invalid-argument', 'subject, gradeLevel, and topic are required.');
    }

    // Cache check
    const key      = cacheKey({ subject, gradeLevel, melcCode, topic, slideCount });
    const cacheRef = db.doc(`presentationOutlineCache/${key}`);
    const cached   = await cacheRef.get();

    if (cached.exists) {
      const d   = cached.data();
      const age = (Date.now() - d.createdAt.toMillis()) / 86_400_000;
      if (age < CACHE_TTL_DAYS) {
        cacheRef.update({ hitCount: admin.firestore.FieldValue.increment(1) }).catch(() => {});
        return { outline: d.outline, cached: true };
      }
    }

    const lang = langLabel(subject);
    const nvidiaConfig = await getNvidiaConfigServer();
    let text;

    const prompt = `You are kaTuro, an AI lesson outline planner for Philippine public school teachers following the K–12 MELC curriculum.
Generate a structured slide OUTLINE only — not full content. Output ONLY valid JSON, no markdown, no explanation.

Rules:
- Start with a title slide and an objectives slide (expand: false for both)
- End with a summary slide and an activity/assessment slide
- Middle slides cover topic content based on the MELC competency
- Assign each slide a type: title | objectives | concept | example | illustration | activity | assessment | summary
- title, objectives, summary → expand: false
- All others → expand: true
- keyPoints: 2–3 short phrases hinting at the slide content (used as AI expansion seed)
- Total slides: exactly ${slideCount}
- Language: ALL text output in ${lang}

Subject: ${subject}
Grade Level: ${gradeLevel}
MELC Code: ${melcCode || 'N/A'}
Topic: ${topic}
Number of slides: ${slideCount}

Return ONLY this JSON:
{
  "lesson": { "subject": "${subject}", "gradeLevel": "${gradeLevel}", "melcCode": "${melcCode || ''}", "topic": "${topic}" },
  "slides": [
    { "id": 1, "type": "title", "title": "${topic}", "keyPoints": [], "expand": false }
  ]
}`;

    try {
      const key_ = await getGeminiKey();
      text = await callGemini(key_, prompt, { temperature: 0.3, maxTokens: 2048 });
    } catch (geminiErr) {
      console.warn('Gemini outline generation failed, checking NVIDIA fallback:', geminiErr.message);
      if (nvidiaConfig?.apiKey) {
        try {
          text = await callNvidiaServer(nvidiaConfig, prompt, { temperature: 0.3, maxTokens: 2500 });
        } catch (nvidiaErr) {
          console.error('NVIDIA outline fallback also failed:', nvidiaErr.message);
          throw geminiErr;
        }
      } else {
        throw geminiErr;
      }
    }

    const parsed = parseJSON(text, 'outline');

    if (!Array.isArray(parsed.slides)) {
      throw new HttpsError('internal', 'Outline missing slides array.');
    }

    const outline = parsed.slides.map((s, i) => ({
      id:         s.id        ?? i + 1,
      type:       s.type      ?? 'concept',
      title:      String(s.title ?? ''),
      keyPoints:  Array.isArray(s.keyPoints) ? s.keyPoints.map(String) : [],
      expand:     s.expand !== false,
    }));

    await cacheRef.set({
      outline, subject, gradeLevel, melcCode, topic, slideCount,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      hitCount:  0,
    });

    return { outline, cached: false };
  }
);

// ── expandSlides ─────────────────────────────────────────────────────────────
// Costs 3 tokens. Parallel-expands all slides marked expand: true.
// FIX: Raised timeout 180s→300s and memory 512MiB→1GiB.
// 14 slides × ~1.2s each = ~17s minimum, but under Gemini load spikes can reach
// 250s+. The old 180s cap caused deadline-exceeded errors for large slide sets.
exports.expandSlides = onCall(
  { region: 'us-central1', timeoutSeconds: 300, memory: '1GiB' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const { subject, gradeLevel, melcCode, topic, slides, style = 'Academic' } = req.data;
    if (!subject || !gradeLevel || !topic || !Array.isArray(slides)) {
      throw new HttpsError('invalid-argument', 'subject, gradeLevel, topic, and slides array are required.');
    }

    await checkAndIncrementDailyUsage(req.auth.uid, 'expand_slides');
    await deductTokensServer(req.auth.uid, 'presentation-expand', EXPAND_TOKENS);

    const lang         = langLabel(subject);
    const nvidiaConfig = await getNvidiaConfigServer();
    let geminiKey      = null;
    if (!nvidiaConfig) {
      geminiKey = await getGeminiKey();
    }
    const styleGuide = {
      Academic:  'formal, define terms precisely, include DepEd module examples',
      Modern:    'clear direct sentences, bold key terms, professional and readable',
      Engaging:  'conversational, connect to student experience, use analogies and questions',
    }[style] ?? 'clear and informative';

    const needsExpansion = slides.filter(s => s.expand !== false);
    const templateSlides = slides.filter(s => s.expand === false);

    async function expandOne(slide) {
      // Per-slide cache
      const slideKey = cacheKey({ subject, gradeLevel, melcCode, topic, id: slide.id, title: slide.title, type: slide.type });
      const slCacheRef = db.doc(`presentationSlideCache/${slideKey}`);
      const slCached   = await slCacheRef.get();

      if (slCached.exists) {
        const d   = slCached.data();
        const age = (Date.now() - d.createdAt.toMillis()) / 86_400_000;
        if (age < CACHE_TTL_DAYS) {
          slCacheRef.update({ hitCount: admin.firestore.FieldValue.increment(1) }).catch(() => {});
          return { ...d.slide, id: slide.id };
        }
      }

      const useBody    = ['example', 'illustration', 'activity', 'assessment'].includes(slide.type);
      const useBullets = !useBody;

      const prompt = `You are kaTuro, an AI lesson content writer for Philippine DepEd K–12 MELC curriculum.
Expand this ${slide.type} slide for a lesson on "${topic}", ${gradeLevel}, ${subject}${melcCode ? `, MELC: ${melcCode}` : ''}.
Style: ${style} — ${styleGuide}
Language: Write ALL content in ${lang}.

Slide scaffold: ${JSON.stringify(slide)}

Rules:
- Body/bullets combined: 60–120 words maximum (this is a presentation)
- Short declarative sentences only
- Always bold key concepts and terms using markdown **Key Term** syntax
${useBullets ? '- bullets: 3–5 items, each a complete explanatory sentence with **Key Terms** bolded (15–25 words)\n- body: leave empty ""' : '- body: short paragraph (3–5 sentences explaining the concept/activity with **Key Terms** bolded)\n- bullets: leave as []'}
- teacherNote: 1–2 sentences the teacher says aloud while showing this slide
- suggestedVisual: ultra-relevant, topic-specific educational diagram/visual description (clean vector/infographic/photo, pure white background, lightweight classroom visual aid)
- headline: a short subtitle (5–8 words) reinforcing the slide title

Return ONLY this JSON (no markdown, no explanation):
{
  "id": ${slide.id},
  "type": "${slide.type}",
  "title": "",
  "headline": "",
  "body": "",
  "bullets": [],
  "teacherNote": "",
  "suggestedVisual": ""
}`;

      let text;
      if (nvidiaConfig) {
        try {
          text = await callNvidiaServer(nvidiaConfig, prompt, { temperature: 0.5, maxTokens: 1200 });
        } catch (err) {
          console.warn('NVIDIA NIM slide expansion failed on server, falling back to Gemini:', err);
          if (!geminiKey) geminiKey = await getGeminiKey();
          text = await callGemini(geminiKey, prompt, { temperature: 0.6, maxTokens: 1024 });
        }
      } else {
        text = await callGemini(geminiKey, prompt, { temperature: 0.6, maxTokens: 1024 });
      }

      const expanded = parseJSON(text, `slide ${slide.id}`);

      const result = {
        id:              slide.id,
        type:            String(expanded.type            ?? slide.type),
        title:           String(expanded.title           ?? slide.title),
        headline:        String(expanded.headline        ?? ''),
        body:            String(expanded.body            ?? ''),
        bullets:         Array.isArray(expanded.bullets) ? expanded.bullets.map(String) : [],
        teacherNote:     String(expanded.teacherNote     ?? ''),
        suggestedVisual: String(expanded.suggestedVisual ?? ''),
      };

      await slCacheRef.set({
        slide: result, subject, gradeLevel, melcCode, topic,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        hitCount:  0,
      });

      return result;
    }

    // Parallel expansion
    const results = await Promise.allSettled(needsExpansion.map(expandOne));

    const expanded = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      // Graceful fallback — slide shows key points as bullets
      return {
        id:              needsExpansion[i].id,
        type:            needsExpansion[i].type,
        title:           needsExpansion[i].title,
        headline:        '',
        body:            '',
        bullets:         needsExpansion[i].keyPoints ?? [],
        teacherNote:     '',
        suggestedVisual: '',
        _error:          r.reason?.message ?? 'Expansion failed',
      };
    });

    // Fill template slides without AI
    const filled = templateSlides.map(s => ({
      id:              s.id,
      type:            s.type,
      title:           s.title,
      headline:        s.type === 'objectives' ? `MELC: ${melcCode || 'See competency'}` : '',
      body:            '',
      bullets:         s.keyPoints ?? [],
      teacherNote:     '',
      suggestedVisual: '',
    }));

    // Return all slides sorted by original id
    const allSlides = [...expanded, ...filled].sort((a, b) => a.id - b.id);
    return { slides: allSlides };
  }
);

// ── generateAI — generic Gemini proxy for every AI feature not (yet) split
// into its own dedicated function like generateOutline/expandSlides above.
//
// The Gemini key never leaves the server, and this is a single chokepoint for
// per-user daily limits across every feature — closing both the "key exposed
// to the browser" gap and the "one heavy user exhausts the shared quota for
// everyone" gap in one piece of infrastructure.
//
// Deliberately thin: the client still builds `contents` (the exact prompt/
// image payload it always built) and still parses the returned text with its
// own JSON-repair logic — only the network hop to Gemini itself moves here,
// so no prompt is duplicated/transcribed server-side and business logic for
// each feature stays exactly where it already was reviewed and tested.
const MAX_TOKENS_CEILING = 20000; // hard ceiling regardless of what a client requests — COT's full PPST lesson plan needs up to 16384

// ── Thinking-token headroom ──────────────────────────────────────────────────
// Gemini 3.x models emit internal "thinking" tokens that count against
// maxOutputTokens, and on these models thinking CANNOT be turned off —
// thinkingConfig:{thinkingBudget:0} returns HTTP 400 on gemini-3.6-flash.
//
// Every budget in this file was sized for gemini-2.0-flash, which did not
// think, so they now describe the total rather than the answer. Measured on
// 2026-08-26 with gemini-3.6-flash: a 14-slide PPT outline spent 1509 thinking
// tokens of a 2048 budget, leaving 535 for the answer — MAX_TOKENS, truncated
// JSON, zero slides. A DLL spent 2187.
//
// Rather than re-tune every call site (and the budgets clients send us, which
// this file cannot reach), thinking gets its own allowance on top of whatever
// the caller asked for, so a caller's number still means "room for the answer".
const THINKING_HEADROOM_TOKENS = 2600;
const HARD_MAX_OUTPUT_TOKENS   = 24000;

function withThinkingHeadroom(maxTokens) {
  return Math.min(HARD_MAX_OUTPUT_TOKENS, (Number(maxTokens) || 2048) + THINKING_HEADROOM_TOKENS);
}

// Time budget for a whole Gemini call, derived from how much text was asked
// for. generateContent is non-streaming, so wall time tracks output length:
// ~10ms/token at flash speeds, plus ~30s of headroom for connection + TTFT.
// Capped at 180s so the NVIDIA fallback below still fits inside generateAI's
// 300s function timeout (worst case: 180s Gemini + ~82s NVIDIA + overhead).
// Hard ceiling for ALL Gemini attempts in one request, including model
// switches. 200s leaves room for the NVIDIA fallback (~82s worst case) inside
// generateAI's 300s function timeout.
const OVERALL_GEMINI_MS    = 200000;
const GEMINI_MIN_BUDGET_MS = 45000;
const GEMINI_MAX_BUDGET_MS = 180000;
function geminiBudgetMs(maxTokens) {
  const scaled = 30000 + (Number(maxTokens) || 2048) * 10;
  return Math.min(GEMINI_MAX_BUDGET_MS, Math.max(GEMINI_MIN_BUDGET_MS, scaled));
}

async function callGeminiRaw(key, contents, { temperature = 0.5, maxTokens = 2048, responseMimeType, model, _attempt = 0, deadlineAt, overallDeadlineAt, _tried = [] } = {}) {
  const activeModel = model || await resolveGeminiModel(key, _tried);
  // PREVENTIVE: Only add thinkingConfig for models that support it — sending it
  // to a model that doesn't causes HTTP 400. Also: thinkingConfig is
  // incompatible with responseMimeType=application/json on most models — omit
  // it entirely when a JSON response is requested.
  const effectiveMaxTokens = withThinkingHeadroom(maxTokens);
  const genConfig = {
    temperature,
    maxOutputTokens: effectiveMaxTokens,
    ...(supportsThinking(activeModel) && !responseMimeType ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    ...(responseMimeType ? { responseMimeType } : {}),
  };

  // BUG-FIX: a flat 20s abort (60s above 8k tokens) aborted essentially every
  // real generation — Gemini's non-streaming generateContent only returns once
  // the WHOLE response is written, so wall time scales with maxOutputTokens
  // (~10ms/token at flash speeds). A 4096-token DLL/ILAW/test-item payload
  // needs 40-70s and a 16384-token COT plan needs 2-3 minutes; both were being
  // killed mid-write and reported as deadline-exceeded, which is why COT, DLL,
  // ILAW and Test Builder all stopped producing output. The budget is now
  // derived from the requested size, and it is a budget for the WHOLE call
  // (retries included) so backup attempts can never overrun the function's own
  // 300s ceiling and leave no room for the NVIDIA fallback below.
  // BUG-FIX: these were one and the same, so time burned on a model that turned
  // out to be dead was charged to its replacement. Observed in production on
  // 2026-08-26: gemini-3.7-flash sat for 35s before returning 503, the switch
  // to gemini-3.6-flash inherited the exhausted budget, and the request failed
  // with "did not respond within the time budget" without the healthy model
  // ever being called. A replacement model must start with a full budget.
  //   budgetEndsAt  — this model's own allowance, fresh on every model switch
  //   overallEndsAt — hard ceiling for the whole call, so switching can never
  //                   run past the function timeout and starve the NVIDIA fallback
  const overallEndsAt = overallDeadlineAt ?? Date.now() + OVERALL_GEMINI_MS;
  // Cap any one model at half the remaining overall budget (floor 45s) so a
  // stall always leaves room to try a healthy model. COT asks for 180s of a
  // 200s overall, which previously let a single stalled model consume nearly
  // everything and leave its replacement ~20s — not enough to generate.
  const perModelCapMs = Math.max(45000, Math.floor((overallEndsAt - Date.now()) * 0.5));
  const budgetEndsAt  = deadlineAt ?? Date.now() + Math.min(geminiBudgetMs(effectiveMaxTokens), perModelCapMs);
  const remainingMs   = Math.min(budgetEndsAt, overallEndsAt) - Date.now();
  if (remainingMs <= 2000) {
    throw new HttpsError('deadline-exceeded', 'Gemini did not respond within the time budget for this request.');
  }

  let res;
  try {
    res = await fetch(geminiUrl(key, activeModel), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: genConfig,
      }),
      signal: AbortSignal.timeout(remainingMs),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    console.warn(`[callGeminiRaw] Fetch ${timedOut ? 'timed out' : 'failed'} (${err?.name || err?.message}) for model ${activeModel} after ${Math.round(remainingMs / 1000)}s budget`);

    // BUG-FIX (2026-09-01): a model that STALLS used to get neither a bench nor
    // a model switch — it threw straight past the healthy models to the NVIDIA
    // fallback, which is itself dead (410 Gone), so the teacher just saw a
    // failure. This is what broke DLL/COT/ILAW/TEST generation:
    //   [generateAI] dll_gen ... Gemini did not finish within 138s
    //   [generateAI] NVIDIA fallback also failed: NVIDIA NIM 410: Gone
    // A stall is at least as strong a signal of a bad model as a 503 (which we
    // already bench and switch on), so treat the two the same. gemini-3.7-flash
    // was taking 148s to admit it was congested.
    if (timedOut) {
      const tried = [..._tried, activeModel];
      benchModel(activeModel, CONGESTED_COOLDOWN_MS);
      if (tried.length < 4 && overallEndsAt - Date.now() > 20000) {
        console.warn(`[callGeminiRaw] ${activeModel} stalled — switching model (tried: ${tried.join(', ')})`);
        return callGeminiRaw(key, contents, { temperature, maxTokens, responseMimeType, _attempt: 0, overallDeadlineAt: overallEndsAt, _tried: tried });
      }
    }

    throw new HttpsError(
      timedOut ? 'deadline-exceeded' : 'unavailable',
      timedOut
        ? `Gemini did not finish within ${Math.round(remainingMs / 1000)}s.`
        : `Could not reach Gemini: ${err?.message || 'network error'}`
    );
  }

  // 404 = this model was retired out from under us. Drop it, re-resolve against
  // the live model list, and try the next best. Never fall through to another
  // hardcoded name — that is exactly what failed on 2026-08-24, when the
  // primary AND its "backup" had both been retired.
  if (res.status === 404) {
    const tried = [..._tried, activeModel];
    benchModel(activeModel, RETIRED_COOLDOWN_MS);
    if (tried.length < 4) {
      console.warn(`[callGeminiRaw] Model ${activeModel} returned 404 (retired) — re-resolving (tried: ${tried.join(', ')})`);
      return callGeminiRaw(key, contents, { temperature, maxTokens, responseMimeType, _attempt, overallDeadlineAt: overallEndsAt, _tried: tried });
    }
  }

  // 503 means THIS MODEL has no capacity — retrying it just burns the budget
  // (gemini-3.7-flash sat for 35s before 503ing). One quick retry in case it is
  // a blip, then bench it and move to the next-best model. 429 is handled
  // separately below: that is the key's quota, and switching model won't help.
  if (res.status === 503) {
    // No same-model retry here on purpose. A congested model takes its time
    // saying so — gemini-3.7-flash measured 35.7s before returning 503 — so a
    // retry burns another 35s of budget to be told the same thing, while a
    // healthy model is sitting right there in the list. Bench it and move on.
    const tried = [..._tried, activeModel];
    benchModel(activeModel, CONGESTED_COOLDOWN_MS);
    if (tried.length < 4) {
      console.warn(`[callGeminiRaw] Model ${activeModel} is congested (503) — switching model (tried: ${tried.join(', ')})`);
      return callGeminiRaw(key, contents, { temperature, maxTokens, responseMimeType, _attempt: 0, overallDeadlineAt: overallEndsAt, _tried: tried });
    }
  }

  // Not all 429s mean the same thing, and the difference decides whether
  // waiting can possibly help:
  //   GenerateRequestsPerDayPerProjectPerModel — the DAILY cap for THIS model
  //     is spent. Backing off is useless (it resets tomorrow), but the cap is
  //     per-model, so another model may well have quota left. Bench and switch.
  //   anything else (per-minute bursts, project-wide) — genuinely transient,
  //     so back off and retry the same model.
  // Observed 2026-08-26: gemini-3.6-flash returned the per-day variant while
  // gemini-3.7-flash was serving normally, so the old blanket "429 means the
  // key's quota, switching won't help" was wrong and would have failed a
  // request that a sibling model could have answered.
  if (res.status === 429) {
    const body    = await res.clone().json().catch(() => ({}));
    const quotaId = (body?.error?.details ?? [])
      .flatMap(d => d?.violations ?? [])
      .map(v => v?.quotaId ?? '')
      .join(',');
    const perModelDailyCap = /PerDay.*PerModel|PerModel.*PerDay/i.test(quotaId);

    if (perModelDailyCap) {
      const tried = [..._tried, activeModel];
      // Until the daily window rolls over; capped by MAX_COOLDOWN_MS.
      benchModel(activeModel, MAX_COOLDOWN_MS);
      if (tried.length < 4) {
        console.warn(`[callGeminiRaw] ${activeModel} hit its per-day quota (${quotaId}) — switching model (tried: ${tried.join(', ')})`);
        return callGeminiRaw(key, contents, { temperature, maxTokens, responseMimeType, _attempt: 0, overallDeadlineAt: overallEndsAt, _tried: tried });
      }
    } else if (_attempt < 3) {
      const delay = (2 ** _attempt) * 1000 + Math.random() * 500; // 1s, 2s, 4s + jitter
      if (budgetEndsAt - Date.now() > delay + 5000) {
        await new Promise(r => setTimeout(r, delay));
        return callGeminiRaw(key, contents, { temperature, maxTokens, responseMimeType, model: activeModel, _attempt: _attempt + 1, deadlineAt: budgetEndsAt, overallDeadlineAt: overallEndsAt, _tried });
      }
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const isRateLimit = res.status === 429;
    // Log 400 errors in detail — almost always a model/param mismatch (e.g. thinkingConfig on unsupported model)
    if (res.status === 400) {
      console.error(`[callGeminiRaw] 400 Bad Request for model ${activeModel}:`, JSON.stringify(err?.error));
    }

    // Reaching here on a 429 means the switch loop above already tried every
    // model it could and they were ALL rate-limited. Telling the teacher to
    // "try again in a moment" is then actively wrong when the cause is the
    // per-day cap: the window reopens at midnight Pacific, not in a moment, and
    // each retry burns more of their in-app daily allowance for nothing. This
    // was the message behind the five 186-314s Test Builder failures on
    // 2026-08-25/26. Say which kind it is, and hand the caller Google's own
    // retry delay instead of making it guess.
    const details    = err?.error?.details ?? [];
    const quotaId    = details.flatMap(d => d?.violations ?? []).map(v => v?.quotaId ?? '').join(',');
    const exhausted  = /PerDay/i.test(quotaId);
    const retryInfo  = details.find(d => String(d?.['@type'] ?? '').includes('RetryInfo'));
    const retryAfter = Number(String(retryInfo?.retryDelay ?? '').replace('s', '')) || null;

    throw new HttpsError(
      isRateLimit ? 'resource-exhausted' : 'internal',
      isRateLimit
        ? (exhausted
            ? "Today's AI quota for this account is used up. It resets at midnight (Pacific). Your work so far has been kept."
            : 'The AI service is busy right now. Please try again in a moment.')
        : `Gemini ${res.status} (${activeModel}): ${err?.error?.message ?? res.statusText}`,
      isRateLimit ? { quotaExhausted: exhausted, retryAfter } : undefined
    );
  }

  clearBenchStrikes(activeModel);
  const data      = await res.json();
  const candidate = data.candidates?.[0];
  const parts     = candidate?.content?.parts ?? [];
  const text      = parts.map(p => p.text ?? '').join('');
  // finishReason (e.g. "MAX_TOKENS", "SAFETY") lets callers tell a truncated
  // response apart from a genuinely malformed one, and a safety block apart
  // from an empty response — the same distinctions the old direct-fetch
  // client code made from the raw Gemini payload.
  return { text, finishReason: candidate?.finishReason ?? null };
}

exports.generateAI = onCall(
  // BUG-FIX: COT and Action Research plans need up to ~250s — raised from 120s
  // to 300s so DEADLINE_EXCEEDED never interrupts a legitimate generation.
  // 512MiB memory prevents OOM on large parallel slide expansions.
  { region: 'us-central1', timeoutSeconds: 300, memory: '512MiB' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const { action, contents, temperature, maxTokens, responseMimeType, isRetry, unitCount } = req.data || {};

    if (!action || !(action in PROXY_LIMITS)) {
      throw new HttpsError('invalid-argument', 'Unknown or missing action.');
    }
    if (!Array.isArray(contents) || contents.length === 0) {
      throw new HttpsError('invalid-argument', 'contents array is required.');
    }
    const maxUnits = MAX_UNITS[action];
    if (maxUnits) {
      const n = Number(unitCount);
      // Missing/non-numeric unitCount must also be rejected, not just an
      // over-limit one — omitting the field entirely would otherwise skip
      // this check silently (Number(undefined) > maxUnits is false).
      if (!Number.isFinite(n) || n < 1 || n > maxUnits) {
        throw new HttpsError('invalid-argument', `unitCount is required for this action and must be between 1 and ${maxUnits}.`);
      }
    }

    // Callers retry a single logical generation up to 3x internally on
    // transient failures (truncated/malformed JSON, 429s) — without this,
    // one "Generate" click that needed 2 retries burned 3 units of the daily
    // budget instead of 1, and teachers were hitting "today's limit" after
    // only a handful of real clicks. isRetry is client-declared and thus not
    // airtight against a user editing their own request, but this endpoint
    // already trusts authenticated accounts for `action`/`maxTokens` the same
    // way — daily limits here are abuse-prevention, not a security boundary.
    if (!isRetry) {
      await checkAndIncrementDailyUsage(req.auth.uid, action);
    }

    const clampedMaxTokens = Math.min(Number(maxTokens) || 2048, MAX_TOKENS_CEILING);

    try {
      const key = await getGeminiKey();
      return await callGeminiRaw(key, contents, {
        temperature: temperature ?? 0.5,
        maxTokens: clampedMaxTokens,
        responseMimeType,
      });
    } catch (geminiErr) {
      console.warn(`[generateAI] Gemini call failed for action "${action}". Checking NVIDIA fallback:`, geminiErr.message);
      const nvidiaConfig = await getNvidiaConfigServer();
      if (nvidiaConfig?.apiKey) {
        try {
          console.log(`[generateAI] Swapping to NVIDIA NIM API fallback (${nvidiaConfig.model || 'default'})...`);
          const prompt = extractPromptFromContents(contents);
          // BUG-FIX: the old 4096 cap GUARANTEED a truncated (and therefore
          // unparseable) response for COT, which asks for 16384 — the fallback
          // could never produce a usable plan. Llama 3.3 70B on NIM handles far
          // more than 4096 output tokens; 12288 keeps a sane ceiling while
          // leaving COT's full PPST structure room to finish.
          const nvidiaTokens = Math.min(clampedMaxTokens, 12288);
          const nvidiaText = await callNvidiaServer(nvidiaConfig, prompt, {
            temperature: temperature ?? 0.5,
            maxTokens: nvidiaTokens,
            responseMimeType,
          });
          return {
            text: nvidiaText,
            finishReason: 'STOP',
            engine: 'nvidia',
          };
        } catch (nvidiaErr) {
          console.error(`[generateAI] NVIDIA fallback also failed:`, nvidiaErr.message);
          throw geminiErr;
        }
      }
      throw geminiErr;
    }
  }
);

// ── Self-registration (server-enforced, multi-layer) ─────────────────────────
exports.registerUser = onCall(
  { region: 'us-central1' },
  async (req) => {
    const { email, password, surname, givenName, mi, school, referredBy } = req.data || {};

    // Layer 1: Server-side field validation — cannot be bypassed by any client or cached bundle
    if (!surname?.trim())                 throw new HttpsError('invalid-argument', 'Last name (Surname) is required.');
    if (!givenName?.trim())               throw new HttpsError('invalid-argument', 'First name (Given Name) is required.');
    if (!school?.trim())                  throw new HttpsError('invalid-argument', 'School name is required.');
    if (!email?.trim())                   throw new HttpsError('invalid-argument', 'Email address is required.');
    if (!password || password.length < 6) throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');

    const MAX_ACCOUNTS   = 1000;
    const WELCOME_TOKENS = 30;

    const countSnap   = await db.collection('teachers').get();
    const activeCount = countSnap.docs.filter(d => !d.data().disabled).length;

    // Hard cap — registration is rejected outright once full. No more
    // disabled/pending-approval waitlist state: every account created past
    // this point is auto-approved with the full welcome bonus immediately.
    if (activeCount >= MAX_ACCOUNTS) {
      throw new HttpsError('resource-exhausted', `kaTuro is at capacity (${MAX_ACCOUNTS} accounts). Please try again later.`);
    }

    const displayName = [givenName.trim(), mi?.trim() ? mi.trim() + '.' : '', surname.trim()]
      .filter(Boolean).join(' ');

    // Layer 2: Pre-generate the UID and write Firestore BEFORE creating the Auth user.
    // This ensures the enforceRegistrationSecurity trigger always finds a complete doc.
    const uid = crypto.randomBytes(14).toString('hex'); // 28-char hex — valid Firebase UID format

    await db.doc(`teachers/${uid}`).set({
      email:           email.trim().toLowerCase(),
      displayName,
      surname:         surname.trim(),
      givenName:       givenName.trim(),
      mi:              mi?.trim() || '',
      school:          school.trim(),
      tokenBalance:    WELCOME_TOKENS,
      isAdmin:         false,
      disabled:        false,
      pendingApproval: false,
      createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      _registeredViaFunction: true, // marker — enforceRegistrationSecurity checks this
    });

    // Create Auth user with the pre-determined UID — if this fails, clean up Firestore
    try {
      await admin.auth().createUser({ uid, email: email.trim().toLowerCase(), password, displayName });
    } catch (err) {
      await db.doc(`teachers/${uid}`).delete().catch(() => {});
      if (err.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'An account with this email already exists.');
      }
      if (err.code === 'auth/invalid-email') {
        throw new HttpsError('invalid-argument', 'The email address is not valid.');
      }
      throw new HttpsError('internal', err.message || 'Registration failed. Please try again.');
    }

    // Token log and admin notification — both non-fatal
    try {
      await db.collection(`teachers/${uid}/tokenLogs`).add({
        uid, amount: WELCOME_TOKENS, action: 'welcome_bonus',
        note: `Welcome! ${WELCOME_TOKENS} free tokens to get started.`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch { /* welcome bonus is a nice-to-have — registration already succeeded */ }

    try {
      await db.collection('adminNotifications').add({
        type: 'new_user', uid,
        email:           email.trim().toLowerCase(),
        displayName,
        givenName:       givenName.trim(),
        surname:         surname.trim(),
        school:          school.trim(),
        pendingApproval: false,
        read:            false,
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch { /* admin notification is best-effort — registration already succeeded */ }

    // Referral bonus — credit 20 tokens to the referrer (non-fatal)
    if (referredBy && typeof referredBy === 'string' && referredBy !== uid) {
      try {
        const referrerSnap = await db.doc(`teachers/${referredBy}`).get();
        if (referrerSnap.exists && !referrerSnap.data()?.disabled) {
          const REFERRAL_BONUS = 20;
          await db.doc(`teachers/${referredBy}`).update({
            tokenBalance: admin.firestore.FieldValue.increment(REFERRAL_BONUS),
            updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
          });
          await db.collection(`teachers/${referredBy}/tokenLogs`).add({
            uid: referredBy, amount: REFERRAL_BONUS,
            action: 'referral_bonus', referredUid: uid,
            note: `Referral bonus — ${displayName} signed up via your link.`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      } catch { /* referral bonus is best-effort — registration already succeeded */ }
    }

    // Client will sign in with email+password — no custom token needed
    return { pendingApproval: false };
  }
);

// ── Layer 3: Auth onCreate guard — auto-delete rogue accounts ────────────────
// Fires every time a Firebase Auth user is created.
// Any user NOT created through registerUser (e.g. direct REST API call, old
// cached bundle, or external tool) will have no valid Firestore teacher doc
// and gets immediately deleted.
const functionsV1 = require('firebase-functions/v1');
exports.enforceRegistrationSecurity = functionsV1.auth.user().onCreate(async (user) => {
  const uid  = user.uid;
  const snap = await db.doc(`teachers/${uid}`).get();
  const data = snap.exists ? snap.data() : null;

  // Self-registered: must have _registeredViaFunction + all required fields
  const isSelfRegistered = data?._registeredViaFunction === true &&
    data?.surname?.trim()   &&
    data?.givenName?.trim() &&
    data?.school?.trim()    &&
    data?.email?.trim();

  // Admin-created: must have _registeredViaFunction + createdBy (admin uid)
  const isAdminCreated = data?._registeredViaFunction === true &&
    data?.createdBy &&
    data?.email?.trim();

  if (!isSelfRegistered && !isAdminCreated) {
    if (snap.exists) await db.doc(`teachers/${uid}`).delete().catch(() => {});
    await admin.auth().deleteUser(uid).catch(() => {});
  }
});

// ── Admin: permanently delete a user account and all their data ───────────────
exports.adminDeleteUser = onCall(
  { region: 'us-central1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const callerSnap = await db.doc(`teachers/${req.auth.uid}`).get();
    if (!callerSnap.exists || !callerSnap.data()?.isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required.');
    }

    const { uid } = req.data;
    if (!uid) throw new HttpsError('invalid-argument', 'uid is required.');
    if (uid === req.auth.uid) throw new HttpsError('invalid-argument', 'You cannot delete your own account.');

    const targetSnap = await db.doc(`teachers/${uid}`).get();
    if (targetSnap.exists && targetSnap.data()?.isAdmin) {
      throw new HttpsError('permission-denied', 'Admin accounts cannot be deleted.');
    }

    // Delete all Firestore data under teachers/{uid} including all subcollections
    await db.recursiveDelete(db.doc(`teachers/${uid}`));

    // Delete the Firebase Auth user
    await admin.auth().deleteUser(uid);

    return { success: true };
  }
);

// ── Admin: permanently delete any kaTuro Shares post (bypasses Firestore client rules) ──
exports.adminDeleteSharePost = onCall(
  { region: 'us-central1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const callerSnap = await db.doc(`teachers/${req.auth.uid}`).get();
    if (!callerSnap.exists || !callerSnap.data()?.isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required.');
    }

    const { postId, authorUid } = req.data;
    if (!postId) throw new HttpsError('invalid-argument', 'postId is required.');

    // Fetch the post to determine author if not provided
    const postRef = db.doc(`shares_posts/${postId}`);
    const postSnap = await postRef.get();
    const finalAuthorUid = authorUid || (postSnap.exists ? postSnap.data()?.authorUid : null);

    // Recursively delete the post document and all its subcollections
    if (postSnap.exists) {
      await db.recursiveDelete(postRef);
    }

    // Delete associated reactions
    const reactionsRef = db.doc(`shares_reactions/${postId}`);
    const reactionsSnap = await reactionsRef.get();
    if (reactionsSnap.exists) {
      await db.recursiveDelete(reactionsRef);
    }

    // Decrement author's post count in shares_profiles
    if (finalAuthorUid) {
      try {
        await db.doc(`shares_profiles/${finalAuthorUid}`).update({
          postCount: admin.firestore.FieldValue.increment(-1),
        });
      } catch (err) {
        console.warn('Could not update author postCount:', err);
      }
    }

    return { success: true };
  }
);

// ── Admin: permanently delete any kaTuro Shares comment ───────────────────────
exports.adminDeleteShareComment = onCall(
  { region: 'us-central1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const callerSnap = await db.doc(`teachers/${req.auth.uid}`).get();
    if (!callerSnap.exists || !callerSnap.data()?.isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required.');
    }

    const { postId, commentId } = req.data;
    if (!postId || !commentId) throw new HttpsError('invalid-argument', 'postId and commentId are required.');

    const commentRef = db.doc(`shares_posts/${postId}/comments/${commentId}`);
    const commentSnap = await commentRef.get();
    if (commentSnap.exists) {
      await db.recursiveDelete(commentRef);
    }

    // Decrement commentCount on the post
    try {
      await db.doc(`shares_posts/${postId}`).update({
        commentCount: admin.firestore.FieldValue.increment(-1),
      });
    } catch (err) {
      console.warn('Could not decrement post commentCount:', err);
    }

    return { success: true };
  }
);

// ── Admin: set any user's password directly via Admin SDK ─────────────────────
// BUG-FIX: Added { region: 'us-central1' } — previously missing, causing this
// function to potentially deploy to a different region from everything else.
exports.adminSetPassword = onCall({ region: 'us-central1' }, async (request) => {
  // Verify caller is an admin
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in.');

  const callerSnap = await db.doc(`teachers/${callerUid}`).get();
  if (!callerSnap.exists || !callerSnap.data()?.isAdmin) {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }

  const { targetUid, newPassword } = request.data;
  if (!targetUid || !newPassword || newPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'targetUid and newPassword (min 6 chars) are required.');
  }

  // BUG-FIX: Only update Firebase Auth — do NOT write plaintext password to
  // Firestore. The teacher doc updatedAt is bumped so the admin can see when
  // the password was last changed, without exposing the credential itself.
  await admin.auth().updateUser(targetUid, { password: newPassword });
  await db.doc(`teachers/${targetUid}`).update({
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

// ── Admin: create a new user account (server-side, bypasses client Firestore rules) ──
exports.adminCreateUserFn = onCall(
  { region: 'us-central1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const callerSnap = await db.doc(`teachers/${req.auth.uid}`).get();
    if (!callerSnap.exists || !callerSnap.data()?.isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required.');
    }

    const { email, password, initialTokens = 0 } = req.data || {};
    if (!email?.trim())                   throw new HttpsError('invalid-argument', 'Email is required.');
    if (!password || password.length < 6) throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');

    const tokens = Math.max(0, Number(initialTokens) || 0);
    const uid    = crypto.randomBytes(14).toString('hex');

    // Write Firestore BEFORE creating Auth user (same ordering as registerUser).
    // BUG-FIX: Removed plaintext `password` field — Firebase Auth already
    // stores credentials securely; copying it to Firestore exposes it to any
    // client that can read the teacher doc.
    await db.doc(`teachers/${uid}`).set({
      email:           email.trim().toLowerCase(),
      displayName:     email.trim().toLowerCase(),
      tokenBalance:    tokens,
      isAdmin:         false,
      disabled:        false,
      pendingApproval: false,
      createdBy:       req.auth.uid,
      createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      _registeredViaFunction: true,
    });

    try {
      await admin.auth().createUser({ uid, email: email.trim().toLowerCase(), password });
    } catch (err) {
      await db.doc(`teachers/${uid}`).delete().catch(() => {});
      if (err.code === 'auth/email-already-exists') {
        throw new HttpsError('already-exists', 'An account with this email already exists.');
      }
      if (err.code === 'auth/invalid-email') {
        throw new HttpsError('invalid-argument', 'The email address is not valid.');
      }
      throw new HttpsError('internal', err.message || 'Failed to create account.');
    }

    if (tokens > 0) {
      try {
        await db.collection(`teachers/${uid}/tokenLogs`).add({
          uid, amount: tokens, action: 'top_up', note: 'Initial balance',
          addedBy: req.auth.uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch { /* log entry is best-effort — the account/balance already exist */ }
    }

    return { uid, email: email.trim().toLowerCase() };
  }
);

// ── Admin: toggle global free mode ───────────────────────────────────────────
exports.adminSetFreeMode = onCall(
  { region: 'us-central1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');
    const callerSnap = await db.doc(`teachers/${req.auth.uid}`).get();
    if (!callerSnap.exists || !callerSnap.data()?.isAdmin) {
      throw new HttpsError('permission-denied', 'Admin access required.');
    }
    const { enabled, note = '' } = req.data;
    await db.doc('adminConfig/billing').set({
      freeMode:      enabled === true,
      freeModeNote:  note || (enabled ? 'Launch phase — all AI features free' : 'Free mode ended'),
      freeModeSetBy: req.auth.uid,
      freeModeSetAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    _freeModeCache  = null; // bust instance cache immediately
    _freeModeExpiry = 0;
    return { freeMode: enabled === true };
  }
);

// ── Scheduled: auto-grant bonus tokens before DepEd inspection seasons ────────
// Runs Feb 1 and Sep 1 at 6 AM Philippine time (UTC+8).
// Sep 1  → ahead of Q2 inspections (Oct–Nov)
// Feb 1  → ahead of Q4 inspections (Mar–Apr)
exports.autoGrantSeasonalTokens = onSchedule(
  { schedule: '0 6 1 2,9 *', timeZone: 'Asia/Manila', region: 'us-central1' },
  async () => {
    const BONUS = 30;
    const month = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'long' });
    const note  = `Inspection season bonus — ${month}`;

    const snap  = await db.collection('teachers')
      .where('disabled', '==', false)
      .where('pendingApproval', '==', false)
      .get();

    // Firestore batch limit is 500 writes; chunk if needed
    const chunks = [];
    for (let i = 0; i < snap.docs.length; i += 400) {
      chunks.push(snap.docs.slice(i, i + 400));
    }

    for (const chunk of chunks) {
      const batch = db.batch();
      chunk.forEach(d => {
        batch.update(d.ref, {
          tokenBalance: admin.firestore.FieldValue.increment(BONUS),
          updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();

      // Log token grants (non-fatal if fails)
      await Promise.allSettled(chunk.map(d =>
        db.collection(`teachers/${d.id}/tokenLogs`).add({
          uid: d.id, amount: BONUS, action: 'seasonal_bonus', note,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      ));
    }

    await db.collection('adminNotifications').add({
      type: 'seasonal_tokens',
      message: `Granted ${BONUS} inspection-season tokens to ${snap.docs.length} teachers.`,
      month, read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
);

// ── Trigger: roll up last-activity timestamp on the teacher doc ──────────────
// Fires on every usageEvents write (login + every feature action already logs
// here — see src/services/usageTracker.js), so no new client-side tracking
// hooks are needed. Throttled to ~once/hour per user to avoid write
// amplification. Also reactivates an account this same cleanup pipeline
// auto-deactivated for inactivity — any sign of life un-deactivates it. Never
// touches an account an admin disabled manually (no deactivatedForInactivityAt
// marker means this job didn't disable it, so it isn't this job's to enable).
exports.onUsageEventCreated = onDocumentCreated(
  { document: 'usageEvents/{eventId}', region: 'us-central1' },
  async (event) => {
    const uid = event.data?.data()?.uid;
    if (!uid) return;

    const teacherRef  = db.doc(`teachers/${uid}`);
    const teacherSnap = await teacherRef.get();
    if (!teacherSnap.exists) return;
    const teacher = teacherSnap.data();

    const wasDeactivatedForInactivity = !!teacher.deactivatedForInactivityAt;
    const lastActiveMs = teacher.lastActiveAt?.toMillis?.() ?? 0;
    if (!wasDeactivatedForInactivity && Date.now() - lastActiveMs < 3600000) return; // throttle

    const update = { lastActiveAt: admin.firestore.FieldValue.serverTimestamp() };
    if (wasDeactivatedForInactivity) {
      update.disabled = false;
      update.deactivatedForInactivityAt = admin.firestore.FieldValue.delete();
    }
    await teacherRef.update(update).catch(() => {});
  }
);

// ── Scheduled: inactivity policy — deactivate at 90 days, delete at 120 ──────
// (90 days inactive -> disabled, 30-day grace window -> permanently deleted).
// Deliberately NOT an immediate hard-delete at 90 days: a 30-day recoverable
// window means a bug in the inactivity calculation disables accounts instead
// of destroying them outright. Announced to users via
// InactivityAnnouncementModal.jsx ("simply logging in keeps your account
// active" — matches the reactivation behavior in onUsageEventCreated above).
exports.cleanupInactiveUsers = onSchedule(
  { schedule: 'every 24 hours', timeZone: 'Asia/Manila', region: 'us-central1', timeoutSeconds: 540 },
  async () => {
    const now                = Date.now();
    const DEACTIVATE_AFTER_MS = 90 * 86400000;
    const DELETE_AFTER_MS     = 30 * 86400000; // additional days after deactivation (120 total)

    // ── Pass 1: hard-delete accounts already deactivated 30+ days ago ──────
    const toDeleteSnap = await db.collection('teachers')
      .where('deactivatedForInactivityAt', '<', admin.firestore.Timestamp.fromMillis(now - DELETE_AFTER_MS))
      .get();

    let deletedCount = 0;
    for (const doc of toDeleteSnap.docs) {
      const uid = doc.id;
      const t   = doc.data();
      try {
        // Class sections live in their own top-level collection (adviser-
        // owned, not nested under teachers/{uid}) — recursiveDelete on the
        // teacher doc alone would miss these and orphan student rosters.
        const sectionsSnap = await db.collection('sections').where('adviserUid', '==', uid).get();
        for (const sectionDoc of sectionsSnap.docs) {
          await db.recursiveDelete(sectionDoc.ref);
        }

        await db.recursiveDelete(doc.ref);
        await admin.auth().deleteUser(uid).catch(() => {}); // already-gone Auth user is fine

        await db.collection('deletionLogs').add({
          uid, email: t.email || null, displayName: t.displayName || null,
          lastActiveAt: t.lastActiveAt || null,
          deactivatedForInactivityAt: t.deactivatedForInactivityAt || null,
          reason: 'inactivity_90d_plus_30d_grace',
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        deletedCount++;
      } catch (err) {
        await db.collection('deletionLogs').add({
          uid, email: t.email || null,
          reason: 'inactivity_delete_failed',
          error: String(err?.message || err).slice(0, 300),
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    // ── Pass 2: deactivate accounts inactive 90+ days (not already flagged) ─
    const activeSnap = await db.collection('teachers')
      .where('isAdmin', '==', false)
      .where('disabled', '==', false)
      .get();

    let deactivatedCount = 0;
    let batch = db.batch();
    let batchCount = 0;
    for (const doc of activeSnap.docs) {
      const t = doc.data();
      let lastActiveMs = t.lastActiveAt?.toMillis?.() ?? null;
      const updateFields = {};

      // Lazy backfill — this teacher pre-dates onUsageEventCreated and has no
      // rolled-up lastActiveAt yet. Look up their real most-recent usageEvent
      // once so a long-time active user isn't misjudged by their old
      // registration date instead of when they actually last used the app.
      if (lastActiveMs === null) {
        const evSnap = await db.collection('usageEvents')
          .where('uid', '==', doc.id).orderBy('ts', 'desc').limit(1).get();
        lastActiveMs = evSnap.empty
          ? (t.createdAt?.toMillis?.() ?? now)
          : evSnap.docs[0].data().ts.toMillis();
        updateFields.lastActiveAt = admin.firestore.Timestamp.fromMillis(lastActiveMs);
      }

      if (now - lastActiveMs >= DEACTIVATE_AFTER_MS) {
        updateFields.disabled = true;
        updateFields.deactivatedForInactivityAt = admin.firestore.FieldValue.serverTimestamp();
        deactivatedCount++;
      }

      if (Object.keys(updateFields).length > 0) {
        batch.update(doc.ref, updateFields);
        batchCount++;
      }
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    if (batchCount > 0) await batch.commit();

    if (deletedCount > 0 || deactivatedCount > 0) {
      await db.collection('adminNotifications').add({
        type: 'inactivity_cleanup',
        message: `Inactivity cleanup: ${deactivatedCount} account(s) deactivated (90+ days inactive), ${deletedCount} account(s) permanently deleted (120+ days).`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
);

// ── KaTuro Collab: AI reply when @KaTuro is mentioned ─────────────────────────
exports.collabAIReply = onCall(
  { region: 'us-central1', maxInstances: 20 },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

    // BUG-FIX: Add daily rate limiting. Without this, any authenticated user
    // could spam @KaTuro mentions in a loop and exhaust the shared Gemini
    // quota for all teachers. Reuses the protect_chat 40/day bucket.
    await checkAndIncrementDailyUsage(uid, 'protect_chat');

    const { channelId, dmId, messageText } = req.data || {};
    if (!messageText) return { ok: true };

    const key = await getGeminiKey();

    // Get caller's display name for personalised response
    let callerName = 'Teacher';
    try {
      const snap = await db.doc(`teachers/${uid}`).get();
      callerName = snap.data()?.displayName || snap.data()?.givenName || 'Teacher';
    } catch { /* fall back to the generic "Teacher" greeting */ }

    const prompt = `You are KaTuro AI, the intelligent assistant inside KaTuro Collab — a real-time collaboration workspace for Filipino public school teachers in the Philippines DepEd system.

The teacher "${callerName}" mentioned you in a chat and said:
"${messageText.replace(/@KaTuro/gi, '').trim()}"

Respond helpfully and concisely as if chatting in a group channel. Rules:
- Keep your response under 150 words
- Use Filipino/Tagalog naturally when it fits
- Be warm and collegial (these are your ka-teachers)
- If it's a DepEd/curriculum/lesson plan question, give a specific, useful answer
- Do NOT add "KaTuro AI:" or any prefix — just the response text`;

    const reply = await callGemini(key, prompt, { temperature: 0.7, maxTokens: 350 });

    const msg = {
      uid:         'katuro-ai',
      displayName: 'KaTuro AI',
      photoURL:    null,
      text:        reply.trim(),
      isAI:        true,
      replyTo:     uid,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    };

    if (channelId) {
      await db.collection('collabChannels').doc(channelId).collection('messages').add(msg);
      await db.doc(`collabChannels/${channelId}`).update({
        lastMessage: reply.slice(0, 80),
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    } else if (dmId) {
      await db.collection('collabDMs').doc(dmId).collection('messages').add(msg);
      await db.doc(`collabDMs/${dmId}`).update({
        lastMessage: reply.slice(0, 80),
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    }

    return { ok: true };
  }
);

// ── MELC code validation — AI checks whether generated MELC codes look real ───
exports.validateMelcCode = onCall(
  { region: 'us-central1', maxInstances: 20 },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    // BUG-FIX: Add daily rate limiting. Previously unlimited — any auth user
    // could call this in a loop and drain shared Gemini API quota.
    await checkAndIncrementDailyUsage(req.auth.uid, 'melc_validate');
    const { subject, gradeLevel, quarter, melcCodes } = req.data || {};
    if (!melcCodes?.length || !subject) return { results: [] };

    const key = await getGeminiKey();
    const codeList = melcCodes.map((c, i) => `${i + 1}. ${c}`).join('\n');

    const prompt = `You are a DepEd Philippines curriculum expert with knowledge of the official Most Essential Learning Competencies (MELC) document released in 2020.

A teacher used these MELC codes in a lesson plan:
Subject: ${subject}
Grade Level: ${gradeLevel || 'Not specified'}
Quarter: ${quarter || 'Not specified'}

MELC codes to validate:
${codeList}

DepEd MELC code format examples:
- Math Grade 5: M5NS-Ia-93.1 (Subject+Grade+Strand-Quarter/Week-Item)
- English Grade 6: EN6RC-IIIa-2.6.2
- Science Grade 5: S5LT-Ia-1
- Filipino Grade 5: F5PN-Ia-a-5
- Araling Panlipunan Grade 5: AP5PKB-Ia-6
- MAPEH: MUSIC5-Ia-h-1

For each code, evaluate:
1. Is the format consistent with DepEd MELC naming conventions?
2. Is it appropriate for this subject and grade level?
3. Does it look like a real code (not hallucinated)?

Respond ONLY with valid JSON — no markdown, no explanation outside the JSON:
{
  "results": [
    {
      "code": "exact code as provided",
      "isValid": true,
      "confidence": "high",
      "suggestedCode": null,
      "note": "Brief note under 12 words"
    }
  ]
}`;

    try {
      const raw    = await callGemini(key, prompt, { temperature: 0.1, maxTokens: 400 });
      const parsed = parseJSON(raw, 'melc-validation');
      return { results: parsed.results ?? [] };
    } catch {
      return { results: melcCodes.map(code => ({ code, isValid: null, confidence: 'low', suggestedCode: null, note: 'Validation unavailable.' })) };
    }
  }
);

// ── Create a shareable read-only plan snapshot ────────────────────────────────
exports.createSharedPlan = onCall(
  { region: 'us-central1', maxInstances: 20 },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

    const { planType, ownerName, school, subject, gradeLevel, term, melc, preview } = req.data || {};
    if (!planType || !subject) throw new HttpsError('invalid-argument', 'planType and subject are required.');

    const shareRef = db.collection('sharedPlans').doc();
    await shareRef.set({
      type:      planType,
      ownerUid:  uid,
      ownerName: ownerName || 'A kaTuro Teacher',
      school:    school    || '',
      subject, gradeLevel, term,
      melc:      melc      || '',
      preview:   preview   || {},
      viewCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { shareId: shareRef.id };
  }
);
