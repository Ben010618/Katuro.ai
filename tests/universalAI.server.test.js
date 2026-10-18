import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createUniversalAI } = require('../functions/universalAI.js');
const ROOT = path.resolve(__dirname, '..');

const contents = [{ role: 'user', parts: [{ text: 'Make a 5-item quiz. Reply in JSON.' }] }];
const voice = [{ role: 'user', parts: [{ text: 'Transcribe' }, { inlineData: { mimeType: 'audio/wav', data: 'AAAA' } }] }];

/** A fake Firestore with one adminConfig/aiProvider document, and a fake clock. */
function setup(cfg, reply = { status: 200, data: { choices: [{ message: { content: '{"items":5}' }, finish_reason: 'stop' }] } }) {
  let doc = cfg;
  let t = 1_000_000;
  const update = vi.fn(async (patch) => { if (!doc) throw new Error('NOT_FOUND'); doc = { ...doc, ...patch }; });
  const db = { doc: vi.fn(() => ({ get: async () => ({ exists: Boolean(doc), data: () => doc }), update })) };
  const fetchFn = vi.fn(async () => ({ ok: reply.status < 400, status: reply.status, json: async () => reply.data }));
  const ai = createUniversalAI({ db, fetchFn, now: () => t, log: { warn: () => {} } });
  return { ai, fetchFn, db, update, getDoc: () => doc, tick: (ms) => { t += ms; }, setDoc: (d) => { doc = d; } };
}
const openai = { enabled: true, provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-x', apiKey: 'sk-proj-abc123456', label: 'OpenAI' };

describe("the Admin's universal AI key (server)", () => {
  it('off, missing or incomplete: nothing is sent and the Gemini chain answers (null)', async () => {
    for (const cfg of [null, { ...openai, enabled: false }, { ...openai, model: '' }, { ...openai, apiKey: '' }, { ...openai, provider: 'other' }]) {
      const { ai, fetchFn } = setup(cfg);
      expect(await ai.callIfActive({ contents })).toBeNull();
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });

  it('on: it answers first, with the key in the header and the request converted for the service', async () => {
    const { ai, fetchFn } = setup(openai);
    const out = await ai.callIfActive({ contents, temperature: 0.4, maxTokens: 900, responseMimeType: 'application/json' });
    expect(out).toEqual({ text: '{"items":5}', finishReason: 'STOP', engine: 'universal' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-proj-abc123456');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt-x', max_completion_tokens: 900, temperature: 0.4, response_format: { type: 'json_object' } });
    expect(await ai.textIfActive('Hello')).toBe('{"items":5}');
  });

  it('Claude and Gemini keys work the same way', async () => {
    const c = setup({ enabled: true, provider: 'claude', model: 'claude-x', apiKey: 'sk-ant-k' }, { status: 200, data: { content: [{ type: 'text', text: 'Hi' }], stop_reason: 'end_turn' } });
    expect((await c.ai.callIfActive({ contents })).text).toBe('Hi');
    expect(c.fetchFn.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(c.fetchFn.mock.calls[0][1].headers['x-api-key']).toBe('sk-ant-k');
    const g = setup({ enabled: true, provider: 'gemini', model: 'gemini-x', apiKey: 'AIzaKEY' }, { status: 200, data: { candidates: [{ content: { parts: [{ text: 'G' }] }, finishReason: 'STOP' }] } });
    expect((await g.ai.callIfActive({ contents: voice })).text).toBe('G'); // Gemini also hears voice clips
    expect(g.fetchFn.mock.calls[0][0]).toContain('/models/gemini-x:generateContent');
  });

  it('a voice clip on a service that cannot hear audio goes to Gemini (null, nothing sent)', async () => {
    const { ai, fetchFn } = setup(openai);
    expect(await ai.callIfActive({ contents: voice })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a failing key never slows anyone down: null at once, then rested (2 min after a refusal, 30 s after an error)', async () => {
    const { ai, fetchFn, tick, getDoc } = setup(openai, { status: 401, data: { error: { message: 'invalid key' } } });
    expect(await ai.callIfActive({ contents })).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(getDoc().lastProblem).toMatch(/not accepted/); // kept in the settings, so the admin panel sees it
    expect(await ai.health()).toMatchObject({ resting: true, lastProblem: expect.stringMatching(/not accepted/) });
    expect(await ai.callIfActive({ contents })).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1); // resting: not asked again
    tick(2 * 60 * 1000 + 1);
    await ai.callIfActive({ contents });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const err = setup(openai, { status: 500, data: {} });
    await err.ai.callIfActive({ contents });
    err.tick(30 * 1000 + 1);
    await err.ai.callIfActive({ contents });
    expect(err.fetchFn).toHaveBeenCalledTimes(2);
    const empty = setup(openai, { status: 200, data: { choices: [{ message: { content: '  ' } }] } });
    expect(await empty.ai.callIfActive({ contents })).toBeNull(); // an empty answer counts as a failure
  });

  it('new settings saved by the admin are tried again at once; a fixed key clears the problem; removed settings stay removed', async () => {
    const { ai, fetchFn, tick, setDoc, getDoc } = setup(openai, { status: 401, data: {} });
    await ai.callIfActive({ contents });
    fetchFn.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Fixed' } }] }) }));
    setDoc({ ...getDoc(), apiKey: 'sk-fixed', updatedAt: new Date(5) });
    tick(15 * 1000 + 1); // the settings are read again within 15 s
    expect((await ai.callIfActive({ contents })).text).toBe('Fixed'); // not rested any longer
    await new Promise((r) => setTimeout(r, 0));
    expect(getDoc().lastProblem).toBe('');
    setDoc(null);
    ai.forget();
    fetchFn.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await ai.callIfActive({ contents })).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(getDoc()).toBeNull();
  });

  it('a network failure is caught (never thrown to the teacher)', async () => {
    const { ai, fetchFn } = setup(openai);
    fetchFn.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await ai.callIfActive({ contents })).toBeNull();
  });

  it('the admin panel lists a key\'s models and tests the saved settings; saving makes the server re-read at once', async () => {
    const { ai, fetchFn, setDoc } = setup(openai, { status: 200, data: { data: [{ id: 'gpt-5' }, { id: 'whisper-1' }, { id: 'gpt-5-mini' }] } });
    const m = await ai.models({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-new' });
    expect(m.models).toEqual(['gpt-5', 'gpt-5-mini']);
    expect(m.suggested).toBe('gpt-5');
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-new');
    fetchFn.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) }));
    expect(await ai.test()).toMatchObject({ ok: true, reply: 'OK', model: 'gpt-x' });
    await ai.callIfActive({ contents });
    setDoc({ ...openai, enabled: false });
    ai.forget();
    const before = fetchFn.mock.calls.length;
    expect(await ai.callIfActive({ contents })).toBeNull();
    expect(fetchFn.mock.calls.length).toBe(before);
  });

  it('the shared conversion code is identical in the server and the KaTuroDesk app', () => {
    const server = fs.readFileSync(path.join(ROOT, 'functions/lib/aiFormats.js'), 'utf8');
    const desk = fs.readFileSync(path.join(ROOT, 'electron/customBrain.cjs'), 'utf8');
    const shared = server.split('// ---- BEGIN shared AI formats ----\n')[1].split('// ---- END shared AI formats ----')[0].replace(/\r\n/g, '\n').trim();
    expect(shared.length).toBeGreaterThan(3000);
    expect(desk.replace(/\r\n/g, '\n')).toContain(shared);
  });

  it('wired in: generateAI and every Gemini text call try the universal key first; Gemini stays the backup', () => {
    const src = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    const run = src.slice(src.indexOf('async function runGeneration()'));
    expect(run.indexOf('universalAI.callIfActive(')).toBeGreaterThan(-1);
    expect(run.indexOf('universalAI.callIfActive(')).toBeLessThan(run.indexOf('getGeminiKey(isDesk)'));
    const cg = src.slice(src.indexOf('async function callGemini('));
    expect(cg.indexOf('universalAI.textIfActive(')).toBeLessThan(cg.indexOf('resolveGeminiModel('));
    expect(src).toMatch(/exports\.adminUniversalAi = onCall/);
    expect(src).toMatch(/isAdmin\) \{\s*throw new HttpsError\('permission-denied', 'Admin access required\.'\);\s*\}\s*const \{ op, provider, baseUrl, apiKey \}/);
  });
});
