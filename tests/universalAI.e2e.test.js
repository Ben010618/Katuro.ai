/**
 * Universal AI key end to end: the real website services + the real generateAI and
 * adminUniversalAi functions on the Firebase emulators. The AI service is a local fake
 * OpenAI-compatible server.
 *   firebase emulators:exec --only auth,firestore,functions --project demo-katuro "vitest run tests/universalAI.e2e.test.js"
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import path from 'path';
import { createRequire } from 'module';

const ON = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_EMULATOR_HUB);
if (ON && !process.env.FIREBASE_AUTH_EMULATOR_HOST) process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const PROJECT = 'demo-katuro';

vi.mock('../src/firebase.js', async () => {
  const { initializeApp } = await import('firebase/app');
  const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
  const { getAuth, connectAuthEmulator } = await import('firebase/auth');
  const { getFunctions, connectFunctionsEmulator } = await import('firebase/functions');
  const app = initializeApp({ projectId: 'demo-katuro', apiKey: 'demo-key', authDomain: 'demo-katuro.firebaseapp.com' }, 'e2e-universal');
  const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  const db = getFirestore(app);
  connectFirestoreEmulator(db, fsHost, Number(fsPort));
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`, { disableWarnings: true });
  connectFunctionsEmulator(getFunctions(app, 'us-central1'), '127.0.0.1', 5001);
  connectFunctionsEmulator(getFunctions(app, 'asia-southeast1'), '127.0.0.1', 5001);
  return { default: app, db, auth, firebaseConfig: {}, USE_EMULATORS: false };
});

// Fake OpenAI-compatible service.
const seen = [];
let status = 200;
let server;
const BASE = 'http://127.0.0.1:9912/v1';

let adminDb; let adminAuth; let fb; let gw; let cfg;

describe.skipIf(!ON)('Universal AI key end to end (emulators)', () => {
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        seen.push({ url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
        res.writeHead(status, { 'Content-Type': 'application/json' });
        if (status !== 200) { res.end(JSON.stringify({ error: { message: 'invalid key' } })); return; }
        if (req.url.endsWith('/models')) { res.end(JSON.stringify({ data: [{ id: 'qa-small' }, { id: 'qa-large' }] })); return; }
        res.end(JSON.stringify({ choices: [{ message: { content: 'Answer from the universal key.' }, finish_reason: 'stop' }] }));
      });
    });
    await new Promise((r) => server.listen(9912, '127.0.0.1', r));

    const requireFromFunctions = createRequire(path.resolve(__dirname, '../functions/index.js'));
    const admin = requireFromFunctions('firebase-admin');
    const seedApp = admin.initializeApp({ projectId: PROJECT }, 'seed-universal');
    adminDb = seedApp.firestore();
    adminAuth = seedApp.auth();
    // Teacher records first, shaped like a real registration, so the sign-up security
    // trigger (enforceRegistrationSecurity) keeps the accounts.
    const person = (uid, email, isAdmin) => adminDb.doc(`teachers/${uid}`).set({ isAdmin, email, givenName: 'Ana', surname: 'Reyes', displayName: 'Ana Reyes', school: 'KaTuro HQ', access: { mode: 'free', subscriptionUntil: null }, _registeredViaFunction: true });
    await person('e2e-admin', 'admin@e2e.test', true);
    await adminAuth.createUser({ uid: 'e2e-admin', email: 'admin@e2e.test', password: 'secret123' });
    await person('e2e-teacher', 'teacher@e2e.test', false);
    await adminAuth.createUser({ uid: 'e2e-teacher', email: 'teacher@e2e.test', password: 'secret123' });
    await new Promise((r) => setTimeout(r, 1500)); // let the trigger run
    await adminDb.doc('adminConfig/gemini').delete(); // no Gemini key: only the universal key can answer

    fb = await import('../src/firebase.js');
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(fb.auth, 'admin@e2e.test', 'secret123');
    gw = await import('../src/services/geminiConfig.js');
    cfg = await import('../src/features/universalAi/universalAiConfig.js');
  }, 90000);

  afterAll(async () => {
    await fb?.auth.signOut().catch(() => {});
    await new Promise((r) => server?.close(r));
  });

  // isRetry skips only the daily counter: admin.firestore.FieldValue is missing inside the
  // functions emulator (it works in production), so a charged call cannot run here.
  const ask = (extra = {}) => gw.callGeminiProxy({ action: 'desk_agent_task', contents: [{ role: 'user', parts: [{ text: 'Say hello.' }] }], maxTokens: 200, isRetry: true, ...extra });

  it('the admin checks the key, saves it, tests it, and every AI request goes to it first', async () => {
    const m = await cfg.listUniversalModels({ provider: 'openai', baseUrl: BASE, apiKey: 'sk-e2e-key1234' });
    expect(m).toMatchObject({ ok: true, models: ['qa-small', 'qa-large'] });
    await cfg.saveUniversalAi({ provider: 'openai', baseUrl: BASE, model: 'qa-small', label: 'Other service (OpenAI-compatible)', enabled: true, apiKey: 'sk-e2e-key1234' }, 'admin');
    const status = await cfg.getUniversalAiStatus();
    expect(status).toMatchObject({ enabled: true, provider: 'openai', model: 'qa-small', hasKey: true, keyHint: '…1234' });
    expect(JSON.stringify(status)).not.toContain('sk-e2e-key1234'); // never shown back
    expect(await cfg.testUniversalAi()).toMatchObject({ ok: true, reply: 'Answer from the universal key.' });

    const out = await ask();
    expect(out.text).toBe('Answer from the universal key.');
    const call = seen.filter((s) => s.url.endsWith('/chat/completions')).at(-1);
    expect(call.auth).toBe('Bearer sk-e2e-key1234');
    expect(call.body.model).toBe('qa-small');
  }, 90000);

  it('streaming callers (KaTuroDesk chat) get the answer too', async () => {
    const chunks = [];
    const out = await ask({ stream: true, onChunk: (_d, full) => chunks.push(full), region: 'asia-southeast1' });
    expect(out.text).toBe('Answer from the universal key.');
    expect(chunks.at(-1)).toBe('Answer from the universal key.');
  }, 90000);

  const until = async (fn, ms = 25000) => {
    const end = Date.now() + ms;
    for (;;) {
      try { return await fn(); } catch (err) { if (Date.now() > end) throw err; }
      await new Promise((r) => setTimeout(r, 1000));
    }
  };

  it('a failing key or a key turned off: the Gemini chain answers instead (here: no Gemini key, so its own message)', async () => {
    status = 401;
    await expect(ask()).rejects.toThrow(/Gemini API key not configured/);
    expect((await cfg.universalAiHealth())).toMatchObject({ ok: true, resting: true, lastProblem: expect.stringMatching(/not accepted/) });
    status = 200;
    // Saving new settings: every server tries the key again within 15 s.
    await cfg.saveUniversalAi({ provider: 'openai', baseUrl: BASE, model: 'qa-small', enabled: true }, 'admin');
    await until(async () => expect((await ask()).text).toBe('Answer from the universal key.'));
    expect((await cfg.universalAiHealth()).lastProblem).toBe('');
    await cfg.setUniversalAiEnabled(false, 'admin');
    await until(() => expect(ask()).rejects.toThrow(/Gemini API key not configured/));
    const before = seen.length;
    await expect(ask()).rejects.toThrow(/Gemini API key not configured/);
    expect(seen.length).toBe(before); // off: the universal service is not asked at all
    await cfg.setUniversalAiEnabled(true, 'admin');
    await until(async () => expect((await ask()).text).toBe('Answer from the universal key.'));
  }, 120000);

  it('only an admin can use the admin functions; the key stays in admin-only settings', async () => {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    const { doc, getDoc } = await import('firebase/firestore');
    await signInWithEmailAndPassword(fb.auth, 'teacher@e2e.test', 'secret123');
    await expect(cfg.testUniversalAi()).rejects.toThrow(/Admin access required/);
    await expect(getDoc(doc(fb.db, 'adminConfig', 'aiProvider'))).rejects.toThrow(/permission|denied|evaluation error/i);
    expect((await ask()).text).toBe('Answer from the universal key.'); // teachers still get answers from it
    await cfg.removeUniversalAi().catch(() => {}); // refused for a teacher
    expect((await adminDb.doc('adminConfig/aiProvider').get()).exists).toBe(true);
  }, 90000);
});
