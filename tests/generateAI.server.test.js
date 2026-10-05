/**
 * Runs the real functions/index.js against a fake Firestore and a scripted Gemini,
 * to check how generateAI behaves when Google is overloaded.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const FUNCTIONS_DIR = path.resolve(__dirname, '../functions');
const requireFromFunctions = createRequire(path.join(FUNCTIONS_DIR, 'index.js'));

class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function fakeFirestore() {
  const docs = new Map();
  const apply = (prev, data) => {
    const next = { ...(prev || {}) };
    for (const [k, v] of Object.entries(data)) next[k] = v && v.__inc !== undefined ? (next[k] || 0) + v.__inc : v;
    return next;
  };
  const docRef = (p) => ({
    path: p,
    async get() {
      const d = docs.get(p);
      return { exists: Boolean(d), data: () => d };
    },
    async set(data, opts) {
      docs.set(p, opts?.merge ? apply(docs.get(p), data) : apply(null, data));
    },
    async delete() {
      docs.delete(p);
    },
  });
  let autoId = 0;
  // Direct children of a collection path, filtered by one '>' condition (all generateAI needs).
  const collection = (p) => ({
    doc: (id) => docRef(`${p}/${id || `auto${++autoId}`}`),
    where: (field, op, value) => ({
      limit: (n) => ({
        async get() {
          if (op !== '>') throw new Error(`fake where: unsupported op ${op}`);
          const hits = [...docs.entries()].filter(([k, v]) => k.startsWith(`${p}/`) && !k.slice(p.length + 1).includes('/') && v[field] > value);
          return { size: Math.min(hits.length, n) };
        },
      }),
    }),
  });
  const db = {
    doc: docRef,
    collection,
    async runTransaction(fn) {
      return fn({ get: (ref) => ref.get(), set: (ref, data, opts) => { ref.set(data, opts); } });
    },
  };
  return { db, docs };
}

/** Loads functions/index.js with Firebase stubbed out. */
function loadServer(store) {
  const firestore = () => store.db;
  firestore.FieldValue = { increment: (n) => ({ __inc: n }), serverTimestamp: () => 'ts' };
  const admin = { initializeApp() {}, firestore, auth: () => ({}) };
  const chain = new Proxy(function chainFn() {}, { get: () => chain, apply: () => chain });
  const stubs = {
    // Handlers keep their options (as __opts) so runtime sizing can be checked.
    'firebase-functions/v2/https': { onCall: (opts, fn) => (fn ? Object.assign(fn, { __opts: opts }) : opts), onRequest: (opts, fn) => fn || opts, HttpsError },
    'firebase-functions/v2/scheduler': { onSchedule: () => () => {} },
    'firebase-functions/v2/firestore': { onDocumentCreated: () => () => {} },
    'firebase-functions/v1': chain,
    'firebase-admin/firestore': { FieldValue: firestore.FieldValue },
    'firebase-admin': admin,
  };
  const req = (id) => (id in stubs ? stubs[id] : requireFromFunctions(id));
  // Shorter waits so the test runs in milliseconds; everything else is the real code.
  const src = fs.readFileSync(path.join(FUNCTIONS_DIR, 'index.js'), 'utf8').replace('[4000, 10000]', '[5, 10]')
    + '\nmodule.exports.__test = { callGeminiRaw, BUSY_MESSAGE };';
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', '__dirname', '__filename', src)(req, mod, mod.exports, FUNCTIONS_DIR, path.join(FUNCTIONS_DIR, 'index.js'));
  return mod.exports;
}

// Includes models Google really lists that can't do our work (speech, Gemma): they must never be picked.
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.5-transcribe', 'gemma-4-26b-a4b-it', 'gemini-omni-1.1-flash'];
const ok = (text) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }), clone() { return this; } });
const busy = () => ({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({ error: { message: 'This model is currently experiencing high demand.' } }), clone() { return this; } });

/** script(model, nthCallForThatModel) -> response */
function stubGemini(script) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/models?')) {
      return { ok: true, status: 200, json: async () => ({ models: MODELS.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ['generateContent'] })) }) };
    }
    const model = /models\/([^:]+):/.exec(u)[1];
    calls.push(model);
    return script(model, calls.filter((m) => m === model).length);
  }));
  return calls;
}

let store;
let server;
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  store = fakeFirestore();
  store.docs.set('adminConfig/gemini', { apiKey: 'test-key' });
  server = loadServer(store);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const contents = [{ role: 'user', parts: [{ text: 'Make a DLL' }] }];
const usage = (uid) => {
  for (const [k, v] of store.docs) if (k.startsWith(`teachers/${uid}/usage/`)) return v;
  return {};
};

describe('Gemini "high demand" (503)', () => {
  it('switches to another model when one is busy', async () => {
    const calls = stubGemini((m) => (m === 'gemini-3.6-flash' ? busy() : ok('done')));
    const out = await server.__test.callGeminiRaw('k', contents, { maxTokens: 512 });
    expect(out.text).toBe('done');
    expect(calls.slice(0, 2)).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash']);
  });

  it('when every model is busy, waits and retries instead of failing at once', async () => {
    // All models 503 on the first round; the preferred one recovers on the retry.
    const calls = stubGemini((m, n) => (m === 'gemini-3.6-flash' && n === 2 ? ok('recovered') : busy()));
    const out = await server.__test.callGeminiRaw('k', contents, { maxTokens: 512 });
    expect(out.text).toBe('recovered');
    expect(calls.filter((m) => m === 'gemini-3.6-flash')).toHaveLength(2);
  });

  it('gives the teacher a plain message (not raw Gemini text) when Google stays busy', async () => {
    stubGemini(() => busy());
    const err = await server.__test.callGeminiRaw('k', contents, { maxTokens: 512 }).catch((e) => e);
    expect(err.code).toBe('unavailable');
    expect(err.message).toBe(server.__test.BUSY_MESSAGE);
    expect(err.message).not.toMatch(/Gemini 503|gemini-3/);
    expect(err.details).toMatchObject({ busy: true, retryable: true });
  });
});

describe('model choice', () => {
  it('never falls back to speech or Gemma models (Sep 28: "JSON mode is not enabled")', async () => {
    // Like Sep 28: every general model is already benched (quota spent / congested).
    const until = Date.now() + 3600000;
    store.docs.set('adminConfig/modelHealth', { benched: Object.fromEntries(MODELS.filter((m) => !/transcribe|gemma|omni/.test(m)).map((m) => [m, until])) });
    server = loadServer(store);
    const calls = stubGemini(() => busy());
    await server.__test.callGeminiRaw('k', contents, { maxTokens: 512, responseMimeType: 'application/json' }).catch(() => {});
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((m) => /transcribe|gemma|omni/.test(m))).toEqual([]);
  });
});

describe('peak-load protections', () => {
  const call = (uid = 't1') => server.generateAI({ auth: { uid }, data: { action: 'dll_gen', contents, maxTokens: 512 } }, {});
  const leases = (uid) => [...store.docs.keys()].filter((k) => k.startsWith(`aiLeases/${uid}/active/`));

  it('is sized explicitly for peak evenings (no default 80-per-512MiB)', () => {
    expect(server.generateAI.__opts).toMatchObject({
      region: ['us-central1', 'asia-southeast1'], timeoutSeconds: 300, memory: '1GiB', cpu: 1, concurrency: 40, maxInstances: 50,
    });
  });

  it('allows up to 32 AI calls in flight per teacher (a full Desk batch); the 33rd is refused and NOT charged', async () => {
    stubGemini(() => ok('{"ok":true}'));
    const later = Date.now() + 60000;
    for (let i = 0; i < 31; i++) store.docs.set(`aiLeases/t1/active/busy${i}`, { expiresAt: later });
    await expect(call()).resolves.toMatchObject({ text: '{"ok":true}' }); // 31 running: the 32nd may start
    expect(usage('t1').dll_gen).toBe(1);
    store.docs.set('aiLeases/t1/active/busy31', { expiresAt: later });
    store.docs.delete(`teachers/t1/usage/${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}`);
    await expect(call()).rejects.toMatchObject({ code: 'resource-exhausted', details: { tooManyAtOnce: true, retryAfter: 5 } });
    // Not worded as a network failure ("try again" reads as one on Desk).
    await expect(call()).rejects.toMatchObject({ message: expect.not.stringMatching(/try again/i) });
    expect(usage('t1').dll_gen).toBeUndefined();
    // Another teacher is not affected.
    await expect(call('t2')).resolves.toMatchObject({ text: '{"ok":true}' });
  });

  it('expired leases (a crashed call) never block; a finished call frees its slot', async () => {
    const heldDuringCall = [];
    stubGemini(() => {
      heldDuringCall.push(leases('t1').filter((k) => !k.includes('/old')).length);
      return ok('{"ok":true}');
    });
    const past = Date.now() - 1000;
    for (let i = 0; i < 32; i++) store.docs.set(`aiLeases/t1/active/old${i}`, { expiresAt: past });
    await expect(call()).resolves.toMatchObject({ text: '{"ok":true}' });
    expect(heldDuringCall[0]).toBe(1); // a slot was held while Gemini worked...
    expect(leases('t1').filter((k) => !k.includes('/old'))).toEqual([]); // ...and freed afterwards
  });

  it('a failed generation frees the slot and refunds the unit; a daily-limit refusal frees it too', async () => {
    stubGemini(() => busy());
    await expect(call()).rejects.toBeTruthy();
    expect(leases('t1')).toEqual([]);
    expect(usage('t1').dll_gen).toBe(0);
    store.docs.set(`teachers/t1/usage/${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })}`, { dll_gen: 999 });
    await expect(call()).rejects.toMatchObject({ details: { dailyLimit: true } });
    expect(leases('t1')).toEqual([]);
  });

  it('if the lease store fails, the call still goes through (fairness, not security)', async () => {
    stubGemini(() => ok('{"ok":true}'));
    store.db.collection = () => { throw new Error('firestore down'); };
    await expect(call()).resolves.toMatchObject({ text: '{"ok":true}' });
  });

  it('reads the API key once a minute per instance, but picks up a newly saved key at once', async () => {
    stubGemini(() => ok('{"ok":true}'));
    await expect(call()).resolves.toBeTruthy();
    store.docs.delete('adminConfig/gemini'); // cached: still works
    await expect(call()).resolves.toBeTruthy();

    store.docs.delete('adminConfig/gemini');
    server = loadServer(store); // fresh instance, no key yet
    await expect(call()).rejects.toMatchObject({ code: 'failed-precondition' });
    store.docs.set('adminConfig/gemini', { apiKey: 'new-key' }); // "missing" is not cached
    await expect(call()).resolves.toBeTruthy();
  });
});

describe('voice input (desk_voice)', () => {
  const clip = (over = {}) => ({ inlineData: { mimeType: 'audio/wav', data: 'UklGRg==', ...over } });
  const call = (parts) => server.generateAI({ auth: { uid: 't1' }, data: { action: 'desk_voice', contents: [{ role: 'user', parts }], maxTokens: 512 } }, {});

  it('accepts one WAV clip and counts it under its own daily limit', async () => {
    stubGemini(() => ok('Make a quiz.'));
    await expect(call([{ text: 'Transcribe' }, clip()])).resolves.toMatchObject({ text: 'Make a quiz.' });
    expect(usage('t1').desk_voice).toBe(1);
  });

  it('refuses anything but exactly one WAV clip, and over-long clips', async () => {
    const calls = stubGemini(() => ok('x'));
    await expect(call([{ text: 'Transcribe' }])).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call([clip(), clip()])).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call([clip({ mimeType: 'video/mp4' })])).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(call([clip({ data: 'A'.repeat(4 * 1024 * 1024 + 1) })])).rejects.toMatchObject({ message: expect.stringMatching(/under 90 seconds/) });
    // Not a back door for long text generation on the voice limit.
    await expect(call([{ text: 'x'.repeat(4001) }, clip()])).rejects.toMatchObject({ code: 'invalid-argument', message: expect.stringMatching(/too long/) });
    expect(calls).toEqual([]); // refused before any Gemini call
  });

  it('never falls back to the text-only engine (it would invent a transcript)', async () => {
    store.docs.set('adminConfig/nvidia', { apiKey: 'nv-key' });
    server = loadServer(store);
    const urls = [];
    stubGemini(() => busy());
    const geminiFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      urls.push(String(url));
      return geminiFetch(url, init);
    }));
    await expect(call([{ text: 'Transcribe' }, clip()])).rejects.toBeTruthy();
    expect(urls.some((u) => /nvidia/i.test(u))).toBe(false);
    expect(usage('t1').desk_voice).toBe(0); // refunded
  });
});

describe('daily limit is only used by generations that succeed', () => {
  const call = (data) => server.generateAI({ auth: { uid: 't1' }, data: { action: 'dll_gen', contents, maxTokens: 512, ...data } }, {});

  it('a failed generation gives the unit back', async () => {
    stubGemini(() => busy());
    await expect(call()).rejects.toMatchObject({ code: 'unavailable' });
    expect(usage('t1').dll_gen).toBe(0);
  });

  it('a successful generation counts once', async () => {
    stubGemini(() => ok('{"ok":true}'));
    await expect(call()).resolves.toMatchObject({ text: '{"ok":true}' });
    expect(usage('t1').dll_gen).toBe(1);
  });
});
