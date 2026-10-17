/**
 * functions/deskSpeech.js — natural persona voices with a 5-minute daily allowance.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createDeskSpeech, pickTtsModel, speakable, PERSONA_VOICES, DAILY_SECONDS } = require('../functions/deskSpeech.js');

class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** A tiny Firestore: documents with merge writes and increments, and transactions. */
function fakeDb() {
  const docs = new Map();
  const write = (path, data, merge) => {
    const cur = merge ? { ...(docs.get(path) || {}) } : {};
    for (const [k, v] of Object.entries(data)) cur[k] = v && v.__inc !== undefined ? (cur[k] || 0) + v.__inc : v;
    docs.set(path, cur);
  };
  const ref = (path) => ({
    path,
    async get() { return { exists: docs.has(path), data: () => docs.get(path) }; },
    async set(data, opts) { write(path, data, opts?.merge); },
  });
  return {
    docs,
    db: {
      doc: ref,
      async runTransaction(fn) {
        return fn({ get: (r) => r.get(), set: (r, data, opts) => write(r.path, data, opts?.merge) });
      },
    },
    admin: { firestore: { FieldValue: { increment: (n) => ({ __inc: n }), serverTimestamp: () => 'now' } } },
  };
}

// 2 seconds of 24 kHz 16-bit audio, as base64.
const pcm = (seconds) => Buffer.alloc(seconds * 24000 * 2, 1).toString('base64');

function fakeFetch({ list = ['gemini-2.5-flash-preview-tts'], fail = false, status = 503, seconds = 2 } = {}) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes('/models?')) return { ok: true, status: 200, json: async () => ({ models: list.map((id) => ({ name: `models/${id}`, supportedGenerationMethods: ['generateContent'] })) }) };
    if (fail) return { ok: false, status: typeof fail === 'function' ? fail(url) : status, json: async () => ({}), text: async () => 'Prepayment credits are depleted.' };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm(seconds) } }] } }] }) };
  };
  return { fn, calls };
}

describe('deskSpeak: natural persona voices', () => {
  let f;
  const usage = () => f.docs.get('teachers/u1/usage/2026-10-17') || {};
  const make = (fetchFn) => createDeskSpeech({ db: f.db, admin: f.admin, fetchFn, getKey: async () => 'KEY', HttpsError, today: () => '2026-10-17' });
  beforeEach(() => { f = fakeDb(); });

  it("speaks in the persona's voice and style, and counts the real seconds", async () => {
    const net = fakeFetch({ seconds: 2 });
    const res = await make(net.fn).speak({ auth: { uid: 'u1' }, data: { text: '**Good morning**, Teacher Ana! Your class starts soon.', persona: 'carmen' } });
    expect(res).toMatchObject({ sampleRate: 24000, seconds: 2, usedSeconds: 2, limitSeconds: DAILY_SECONDS });
    expect(res.audio.length).toBeGreaterThan(1000);
    const tts = net.calls.find((c) => c.body);
    expect(tts.url).toContain('gemini-2.5-flash-preview-tts:generateContent?key=KEY');
    expect(tts.body.generationConfig).toEqual({ responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: PERSONA_VOICES.carmen.voice } } } });
    expect(tts.body.contents[0].parts[0].text).toMatch(/grandmother[\s\S]*Good morning, Teacher Ana!/);
    expect(tts.body.contents[0].parts[0].text).not.toContain('**');
    expect(usage().desk_speech_seconds).toBe(2);
    expect(f.docs.get('deskVoiceStats/2026-10-17')).toMatchObject({ seconds: 2, replies: 1 });
  });

  it('after 5 minutes a day it answers "limit" (the app then uses the computer voice); nothing is charged', async () => {
    f.docs.set('teachers/u1/usage/2026-10-17', { desk_speech_seconds: DAILY_SECONDS - 2 });
    const net = fakeFetch();
    const res = await make(net.fn).speak({ auth: { uid: 'u1' }, data: { text: 'This sentence is long enough to need more than two seconds.', persona: 'luna' } });
    expect(res).toEqual({ fallback: 'limit', usedSeconds: DAILY_SECONDS - 2, limitSeconds: DAILY_SECONDS });
    expect(net.calls.filter((c) => c.body)).toHaveLength(0);
    expect(usage().desk_speech_seconds).toBe(DAILY_SECONDS - 2);
    expect(f.docs.get('deskVoiceStats/2026-10-17')).toMatchObject({ limited: 1 });
  });

  it('voice service down: answers "unavailable" and gives the reserved time back', async () => {
    const res = await make(fakeFetch({ fail: true }).fn).speak({ auth: { uid: 'u1' }, data: { text: 'Hello there.', persona: 'grey' } });
    expect(res.fallback).toBe('unavailable');
    expect(usage().desk_speech_seconds).toBe(0);
    expect(f.docs.get('deskVoiceStats/2026-10-17')).toMatchObject({ failed: 1 });
  });

  it('a billing refusal (402) pauses the natural voice for a while: later calls answer at once, without asking Google', async () => {
    const net = fakeFetch({ fail: true, status: 402 });
    const s = make(net.fn);
    expect((await s.speak({ auth: { uid: 'u1' }, data: { text: 'Hello.', persona: 'matt' } })).fallback).toBe('unavailable');
    const asked = net.calls.filter((c) => c.body).length;
    expect(asked).toBe(1); // the other models are not tried after a billing refusal
    expect((await s.speak({ auth: { uid: 'u1' }, data: { text: 'Hello again.', persona: 'matt' } })).fallback).toBe('unavailable');
    expect(net.calls.filter((c) => c.body).length).toBe(asked);
    expect(usage().desk_speech_seconds).toBe(0);
  });

  it('a model that does not exist for this key (404) is skipped next time', async () => {
    const good = fakeFetch({ list: ['gemini-3-flash-tts', 'gemini-2.5-flash-preview-tts'] });
    const calls = [];
    const fetchFn = async (url, opts) => {
      calls.push(url);
      if (url.includes('gemini-3-flash-tts:generate')) return { ok: false, status: 404, text: async () => 'not found', json: async () => ({}) };
      return good.fn(url, opts);
    };
    const s = make(fetchFn);
    expect((await s.speak({ auth: { uid: 'u1' }, data: { text: 'One.', persona: 'luna' } })).audio).toBeTruthy();
    expect((await s.speak({ auth: { uid: 'u1' }, data: { text: 'Two.', persona: 'luna' } })).audio).toBeTruthy();
    expect(calls.filter((u) => u.includes('gemini-3-flash-tts:generate'))).toHaveLength(1);
  });

  it('refuses no login, empty text and very long text', async () => {
    const s = make(fakeFetch().fn);
    await expect(s.speak({ data: { text: 'hi' } })).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(s.speak({ auth: { uid: 'u1' }, data: { text: '  ** ' } })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(s.speak({ auth: { uid: 'u1' }, data: { text: 'a'.repeat(700) } })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('picks the newest flash voice model, stable before preview; unknown persona uses Matt', async () => {
    expect(pickTtsModel(['gemini-2.5-pro-preview-tts', 'gemini-2.5-flash-preview-tts', 'gemini-3-flash-tts', 'gemini-3-flash', 'gemini-2.5-flash-native-audio'])).toEqual(['gemini-3-flash-tts', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts']);
    const net = fakeFetch({ list: ['gemini-3-flash-tts'] });
    await make(net.fn).speak({ auth: { uid: 'u1' }, data: { text: 'Hi!', persona: 'nobody' } });
    const tts = net.calls.find((c) => c.body);
    expect(tts.url).toContain('gemini-3-flash-tts');
    expect(tts.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(PERSONA_VOICES.matt.voice);
  });

  it('speakable text: no markdown, links or file paths read aloud', () => {
    expect(speakable('Done! I saved **Quiz 1.docx** in Lesson Prep/G7. Open it in the Canvas.')).toBe('Done! Open it in the Canvas.');
    expect(speakable('Read more at https://x.com/a now.')).toBe('Read more at the link now.');
    expect(speakable('Saved in KaTuro Outputs/2026-10-17.')).toBe('Saved in KaTuro Outputs/2026-10-17.'); // nothing else to say: kept
    expect(speakable('- one\n- two')).toBe('one two');
  });
});
