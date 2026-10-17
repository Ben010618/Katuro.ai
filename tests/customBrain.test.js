import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createBrain, detectService, toOpenAI, toClaude, toGemini, readReply, readModels, suggestModel } = require('../electron/customBrain.cjs');

const img = { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } };
const pdf = { inlineData: { mimeType: 'application/pdf', data: 'BBBB' } };
const contents = [
  { role: 'user', parts: [{ text: 'System rules\n\n---\n\nHello' }] },
  { role: 'model', parts: [{ text: 'Hi!' }] },
  { role: 'user', parts: [{ text: 'Read this and reply in JSON.' }, img, pdf] },
];

/** A fake computer: storage in memory, "encryption" that is visibly not plain text. */
function fakeBrain(fetchImpl, canEncrypt = true) {
  let file = null;
  const fetch = vi.fn(fetchImpl);
  const brain = createBrain({
    fetch,
    read: () => file,
    write: (o) => { file = JSON.parse(JSON.stringify(o)); },
    remove: () => { file = null; },
    canEncrypt: () => canEncrypt,
    encrypt: (s) => Buffer.from(`enc:${s}`).toString('base64'),
    decrypt: (b) => Buffer.from(b, 'base64').toString().replace(/^enc:/, ''),
  });
  return { brain, fetch, file: () => file };
}
const reply = (status, data) => async () => ({ ok: status < 400, status, json: async () => data });

describe("the teacher's own AI key (main process)", () => {
  it('recognizes the service from the key', () => {
    expect(detectService('AIzaSyD-abcdefghijklmnopqrstuvwxyz12345')).toMatchObject({ provider: 'gemini' });
    expect(detectService('sk-ant-api03-xyz')).toMatchObject({ provider: 'claude' });
    expect(detectService('sk-or-v1-abc')).toMatchObject({ provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1', label: 'OpenRouter' });
    expect(detectService('gsk_abc')).toMatchObject({ baseUrl: 'https://api.groq.com/openai/v1' });
    expect(detectService('sk-proj-abc')).toMatchObject({ provider: 'openai', baseUrl: 'https://api.openai.com/v1' });
    expect(detectService('some-unknown-key')).toBeNull();
  });

  it("converts KaTuroDesk's request for OpenAI-style services (text, photos, PDFs, JSON)", () => {
    const b = toOpenAI(contents, { model: 'gpt-x', temperature: 0.2, maxTokens: 800, responseMimeType: 'application/json', official: true });
    expect(b.messages[0]).toEqual({ role: 'user', content: 'System rules\n\n---\n\nHello' });
    expect(b.messages[1]).toEqual({ role: 'assistant', content: 'Hi!' });
    expect(b.messages[2].content).toEqual([
      { type: 'text', text: 'Read this and reply in JSON.' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
      { type: 'file', file: { filename: 'document.pdf', file_data: 'data:application/pdf;base64,BBBB' } },
    ]);
    expect(b).toMatchObject({ model: 'gpt-x', max_completion_tokens: 800, temperature: 0.2, response_format: { type: 'json_object' } });
    expect(toOpenAI(contents, { model: 'm', maxTokens: 10, official: false }).max_tokens).toBe(10);
  });

  it('converts for Claude (roles alternate, images and PDFs as blocks, JSON asked in the system text)', () => {
    const b = toClaude([...contents, { role: 'user', parts: [{ text: 'More' }] }], { model: 'claude-x', temperature: 1.5, maxTokens: 900, responseMimeType: 'application/json' });
    expect(b.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(b.messages[2].content.map((c) => c.type)).toEqual(['text', 'image', 'document', 'text']);
    expect(b).toMatchObject({ model: 'claude-x', max_tokens: 900, temperature: 1 });
    expect(b.system).toMatch(/valid JSON only/);
    expect(() => toClaude([{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data: 'x' } }] }], { model: 'c' })).toThrow(/cannot read audio/);
  });

  it('Gemini keeps the same request shape; replies are read from every service', () => {
    expect(toGemini(contents, { temperature: 0, maxTokens: 5, responseMimeType: 'application/json' }).generationConfig).toEqual({ temperature: 0, maxOutputTokens: 5, responseMimeType: 'application/json' });
    expect(readReply('gemini', { candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: 'A' }, { text: 'B' }] }, finishReason: 'STOP' }] })).toEqual({ text: 'AB', finishReason: 'STOP' });
    expect(readReply('claude', { content: [{ type: 'text', text: 'Hi' }], stop_reason: 'max_tokens' })).toEqual({ text: 'Hi', finishReason: 'MAX_TOKENS' });
    expect(readReply('openai', { choices: [{ message: { content: 'Yo' }, finish_reason: 'length' }] })).toEqual({ text: 'Yo', finishReason: 'MAX_TOKENS' });
  });

  it('lists usable models and suggests one (the teacher can change it)', () => {
    const g = readModels('gemini', { models: [
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-pro', supportedGenerationMethods: ['generateContent'] },
    ] });
    expect(g).toEqual(['gemini-2.5-flash', 'gemini-3-flash', 'gemini-3-pro']);
    expect(suggestModel('gemini', g)).toBe('gemini-3-flash');
    expect(suggestModel('claude', ['claude-haiku-4', 'claude-sonnet-5', 'claude-sonnet-4'])).toBe('claude-sonnet-5');
    expect(readModels('openai', { data: [{ id: 'gpt-5' }, { id: 'whisper-1' }, { id: 'gpt-5-realtime' }] })).toEqual(['gpt-5']);
    expect(readModels('openai', { data: [{ id: 'llama3' }] }, false)).toEqual(['llama3']);
  });

  it('the key is saved encrypted, never shown back, and used for the request', async () => {
    const { brain, fetch, file } = fakeBrain(reply(200, { choices: [{ message: { content: 'OK' } }] }));
    const s = brain.save({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-x', key: 'sk-proj-secret1234', label: 'OpenAI' });
    expect(JSON.stringify(file())).not.toContain('sk-proj-secret1234');
    expect(JSON.stringify(s)).not.toContain('secret');
    expect(s).toMatchObject({ hasKey: true, keyHint: '…1234', enabled: true, provider: 'openai', model: 'gpt-x' });
    const out = await brain.call({ contents, maxTokens: 100 });
    expect(out).toEqual({ text: 'OK', finishReason: 'STOP' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-proj-secret1234');
    brain.save({ enabled: false });
    await expect(brain.call({ contents })).rejects.toThrow(/off/);
    expect(brain.remove().hasKey).toBe(false);
  });

  it('refuses to save when Windows cannot protect the key', () => {
    const { brain } = fakeBrain(reply(200, {}), false);
    expect(() => brain.save({ provider: 'gemini', model: 'g', key: 'AIzaxxxxxxxxxxxxxxxxxxxxxxxx' })).toThrow(/cannot protect the key/);
  });

  it('a model that refuses a set temperature is asked again without it; a bad key gives a clear reason', async () => {
    let n = 0;
    const { brain, fetch } = fakeBrain(async (_u, init) => {
      n += 1;
      const body = JSON.parse(init.body);
      if (n === 1) return { ok: false, status: 400, json: async () => ({ error: { message: "Unsupported value: 'temperature'" } }) };
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: String('temperature' in body) }] }) };
    });
    brain.save({ provider: 'claude', model: 'claude-x', key: 'sk-ant-k' });
    expect((await brain.call({ contents, temperature: 0.3 })).text).toBe('false');
    expect(fetch.mock.calls[0][1].headers['x-api-key']).toBe('sk-ant-k');
    const bad = fakeBrain(reply(401, { error: { message: 'invalid x-api-key' } }));
    bad.brain.save({ provider: 'claude', model: 'c', key: 'sk-ant-bad' });
    await expect(bad.brain.call({ contents })).rejects.toThrow(/key was not accepted/);
  });
});
