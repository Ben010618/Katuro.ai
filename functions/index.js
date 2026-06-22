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
const TAGALOG_SUBJECTS = ['filipino', 'esp', 'araling panlipunan', 'edukasyon sa pagpapakatao'];
function isTagalog(subject) {
  const s = (subject || '').toLowerCase();
  return TAGALOG_SUBJECTS.some(t => s.includes(t));
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

// ── Per-user daily usage limiter ────────────────────────────────────────────
const DAILY_LIMITS = {
  outline_gen: 15,  // generateOutline calls per day (free endpoint, must guard)
};

async function checkAndIncrementDailyUsage(uid, action) {
  const limit = DAILY_LIMITS[action];
  if (!limit) return;
  const today = new Date().toISOString().slice(0, 10); // "2026-06-13"
  const ref   = db.doc(`teachers/${uid}/usage/${today}`);

  await db.runTransaction(async tx => {
    const snap    = await tx.get(ref);
    const current = snap.data()?.[action] ?? 0;
    if (current >= limit) {
      throw new HttpsError(
        'resource-exhausted',
        `Daily limit of ${limit} reached for this feature. Try again tomorrow.`
      );
    }
    tx.set(ref, {
      [action]:  admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function deductTokensServer(uid, action, cost) {
  if (!cost || cost <= 0) return;
  const ref = db.doc(`teachers/${uid}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'User profile not found.');
    const balance = snap.data().tokenBalance ?? 0;
    if (balance < cost) {
      throw new HttpsError('resource-exhausted', 'Not enough tokens. Contact your administrator to add tokens.');
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

    const lang = isTagalog(subject) ? 'Filipino/Tagalog' : 'English';
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

    await deductTokensServer(req.auth.uid, 'presentation-expand', EXPAND_TOKENS);

    const lang      = isTagalog(subject) ? 'Filipino/Tagalog' : 'English';
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

// ── Self-registration (server-enforced, multi-layer) ─────────────────────────
exports.registerUser = onCall(
  { region: 'us-central1' },
  async (req) => {
    const { email, password, surname, givenName, mi, school } = req.data || {};

    // Layer 1: Server-side field validation — cannot be bypassed by any client or cached bundle
    if (!surname?.trim())                 throw new HttpsError('invalid-argument', 'Last name (Surname) is required.');
    if (!givenName?.trim())               throw new HttpsError('invalid-argument', 'First name (Given Name) is required.');
    if (!school?.trim())                  throw new HttpsError('invalid-argument', 'School name is required.');
    if (!email?.trim())                   throw new HttpsError('invalid-argument', 'Email address is required.');
    if (!password || password.length < 6) throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');

    const MAX_ACCOUNTS   = 250;
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
      const msg = err.code === 'auth/email-already-exists'
        ? 'An account with this email already exists.'
        : (err.message || 'Registration failed.');
      throw new HttpsError('already-exists', msg);
    }

    if (!atCap) {
      await db.collection(`teachers/${uid}/tokenLogs`).add({
        uid, amount: WELCOME_TOKENS, action: 'welcome_bonus',
        note: `Welcome! ${WELCOME_TOKENS} free tokens to get started.`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Notify admin — non-fatal
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
    } catch {}

    // Return a custom token so the client can sign in immediately
    const customToken = await admin.auth().createCustomToken(uid);
    return { customToken, pendingApproval: atCap };
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

  const valid = snap.exists &&
    snap.data()?._registeredViaFunction === true &&
    snap.data()?.surname?.trim()   &&
    snap.data()?.givenName?.trim() &&
    snap.data()?.school?.trim()    &&
    snap.data()?.email?.trim();

  if (!valid) {
    // Delete any partial Firestore document and the Auth user
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
