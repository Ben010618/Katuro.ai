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
const admin                  = require('firebase-admin');
const crypto                 = require('crypto');

admin.initializeApp();
const db = admin.firestore();

const GEMINI_MODEL = 'gemini-2.5-flash';

// Read API key from adminConfig/gemini in Firestore (set via Admin Dashboard)
async function getGeminiKey() {
  const snap = await db.doc('adminConfig/gemini').get();
  if (!snap.exists || !snap.data()?.apiKey) {
    throw new HttpsError('failed-precondition', 'Gemini API key not configured. Set it in the Admin Dashboard → API Settings.');
  }
  return snap.data().apiKey;
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

function geminiUrl(key) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
}

async function callGemini(key, prompt, { temperature = 0.5, maxTokens = 2048, _attempt = 0 } = {}) {
  const res = await fetch(geminiUrl(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  // Retry on 429 (rate limit) or 503 (overloaded) with exponential backoff
  if ((res.status === 429 || res.status === 503) && _attempt < 4) {
    const delay = (2 ** _attempt) * 1000 + Math.random() * 500; // 1s, 2s, 4s, 8s + jitter
    await new Promise(r => setTimeout(r, delay));
    return callGemini(key, prompt, { temperature, maxTokens, _attempt: _attempt + 1 });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const isRateLimit = res.status === 429;
    throw new HttpsError(
      isRateLimit ? 'resource-exhausted' : 'internal',
      isRateLimit
        ? 'The AI service is busy right now. Please try again in a moment.'
        : `Gemini ${res.status}: ${err?.error?.message ?? res.statusText}`
    );
  }

  const data  = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map(p => p.text ?? '').join('');
}

function parseJSON(text, label) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new HttpsError('internal', `AI returned no JSON for ${label}`);
  try   { return JSON.parse(m[0]); }
  catch { throw new HttpsError('internal', `AI returned malformed JSON for ${label}`); }
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
  ilaw_session:        60,  // generateIlawSession — one call per session, several per plan
  quiz_title:         100,  // suggestQuizTitle — tiny, cheap, near-free
  quiz_gen:            10,
  cot_gen:              8,
  dll_gen:             10,
  gamification_gen:    10,  // shared across all 6 worksheet generators
  test_builder_blooms: 30,  // suggestCognitiveWeights
  test_builder_items:  60,  // generateItemsForCompetency — one call per TOS row
  action_research_ai:  30,  // shared across all 6 AR generation phases (matches existing client limit)
  scan_answer_sheet:   80,  // one call per photographed sheet — a class set can be 40-60
};
Object.assign(DAILY_LIMITS, PROXY_LIMITS);

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

    await admin.auth().updateUser(uid, { password });
    await db.doc(`teachers/${uid}`).update({
      password,
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
    const key_ = await getGeminiKey();

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

    const text   = await callGemini(key_, prompt, { temperature: 0.3, maxTokens: 2048 });
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
exports.expandSlides = onCall(
  { region: 'us-central1', timeoutSeconds: 180, memory: '512MiB' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const { subject, gradeLevel, melcCode, topic, slides, style = 'Academic' } = req.data;
    if (!subject || !gradeLevel || !topic || !Array.isArray(slides)) {
      throw new HttpsError('invalid-argument', 'subject, gradeLevel, topic, and slides array are required.');
    }

    await checkAndIncrementDailyUsage(req.auth.uid, 'expand_slides');
    await deductTokensServer(req.auth.uid, 'presentation-expand', EXPAND_TOKENS);

    const lang      = langLabel(subject);
    const geminiKey = await getGeminiKey();
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
${useBullets ? '- bullets: 3–5 items, each a complete explanatory sentence (15–25 words)\n- body: leave empty ""' : '- body: short paragraph (3–5 sentences explaining the concept/activity)\n- bullets: leave as []'}
- teacherNote: 1–2 sentences the teacher says aloud while showing this slide
- suggestedVisual: brief description of a diagram or image that would complement this slide
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

      const text     = await callGemini(geminiKey, prompt, { temperature: 0.6, maxTokens: 1024 });
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

async function callGeminiRaw(key, contents, { temperature = 0.5, maxTokens = 2048, responseMimeType, _attempt = 0 } = {}) {
  const res = await fetch(geminiUrl(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingBudget: 0 },
        ...(responseMimeType ? { responseMimeType } : {}),
      },
    }),
  });

  if ((res.status === 429 || res.status === 503) && _attempt < 4) {
    const delay = (2 ** _attempt) * 1000 + Math.random() * 500; // 1s, 2s, 4s, 8s + jitter
    await new Promise(r => setTimeout(r, delay));
    return callGeminiRaw(key, contents, { temperature, maxTokens, responseMimeType, _attempt: _attempt + 1 });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const isRateLimit = res.status === 429;
    throw new HttpsError(
      isRateLimit ? 'resource-exhausted' : 'internal',
      isRateLimit
        ? 'The AI service is busy right now. Please try again in a moment.'
        : `Gemini ${res.status}: ${err?.error?.message ?? res.statusText}`
    );
  }

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
  { region: 'us-central1', timeoutSeconds: 120 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const { action, contents, temperature, maxTokens, responseMimeType, isRetry } = req.data || {};

    if (!action || !(action in PROXY_LIMITS)) {
      throw new HttpsError('invalid-argument', 'Unknown or missing action.');
    }
    if (!Array.isArray(contents) || contents.length === 0) {
      throw new HttpsError('invalid-argument', 'contents array is required.');
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

    const key = await getGeminiKey();
    const clampedMaxTokens = Math.min(Number(maxTokens) || 2048, MAX_TOKENS_CEILING);

    return callGeminiRaw(key, contents, {
      temperature: temperature ?? 0.5,
      maxTokens: clampedMaxTokens,
      responseMimeType,
    });
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

    const MAX_ACCOUNTS   = 800;
    const WELCOME_TOKENS = 30;

    const countSnap   = await db.collection('teachers').get();
    const activeCount = countSnap.docs.filter(d => !d.data().disabled).length;
    const atCap       = activeCount >= MAX_ACCOUNTS;

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
      tokenBalance:    atCap ? 0 : WELCOME_TOKENS,
      isAdmin:         false,
      disabled:        atCap,
      pendingApproval: atCap,
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
      if (!atCap) {
        await db.collection(`teachers/${uid}/tokenLogs`).add({
          uid, amount: WELCOME_TOKENS, action: 'welcome_bonus',
          note: `Welcome! ${WELCOME_TOKENS} free tokens to get started.`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (_e) {}

    try {
      await db.collection('adminNotifications').add({
        type: 'new_user', uid,
        email:           email.trim().toLowerCase(),
        displayName,
        givenName:       givenName.trim(),
        surname:         surname.trim(),
        school:          school.trim(),
        pendingApproval: atCap,
        read:            false,
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (_e) {}

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
      } catch (_e) {}
    }

    // Client will sign in with email+password — no custom token needed
    return { pendingApproval: atCap };
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

// ── Admin: set any user's password directly via Admin SDK ─────────────────────
exports.adminSetPassword = onCall(async (request) => {
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

  await admin.auth().updateUser(targetUid, { password: newPassword });
  await db.doc(`teachers/${targetUid}`).update({ password: newPassword, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

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

    // Write Firestore BEFORE creating Auth user (same ordering as registerUser)
    await db.doc(`teachers/${uid}`).set({
      email:           email.trim().toLowerCase(),
      displayName:     email.trim().toLowerCase(),
      password,
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
      } catch (_e) {}
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

// ── KaTuro Collab: AI reply when @KaTuro is mentioned ─────────────────────────
exports.collabAIReply = onCall(
  { region: 'us-central1', maxInstances: 20 },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

    const { channelId, dmId, messageText } = req.data || {};
    if (!messageText) return { ok: true };

    const key = await getGeminiKey();

    // Get caller's display name for personalised response
    let callerName = 'Teacher';
    try {
      const snap = await db.doc(`teachers/${uid}`).get();
      callerName = snap.data()?.displayName || snap.data()?.givenName || 'Teacher';
    } catch (_) {}

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
