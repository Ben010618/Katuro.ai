import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const contents = [{ role: 'user', parts: [{ text: 'Hello' }] }];
const status = (over = {}) => ({ provider: 'openai', model: 'gpt-x', baseUrl: 'https://api.openai.com/v1', enabled: true, hasKey: true, keyHint: '…1234', canEncrypt: true, ...over });

function desktop(brain) {
  globalThis.window = { katuroDeskApi: { brain } };
}

describe("KaTuroDesk's first brain: the teacher's own key", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { delete globalThis.window; });

  it('answers through the key when it is on; streaming views still get the text', async () => {
    const call = vi.fn(async () => ({ text: 'From my key', finishReason: 'STOP' }));
    desktop({ status: async () => status(), call });
    const { tryOwnBrain } = await import('./ownBrain');
    const onChunk = vi.fn();
    expect(await tryOwnBrain({ contents, temperature: 0.2, maxTokens: 100, onChunk })).toEqual({ text: 'From my key', finishReason: 'STOP', engine: 'own' });
    expect(call).toHaveBeenCalledWith({ contents, temperature: 0.2, maxTokens: 100, responseMimeType: undefined });
    expect(onChunk).toHaveBeenCalledWith('From my key', 'From my key');
  });

  it('any problem with the key hands the request to the KaTuro AI (null) and is remembered for the tab', async () => {
    desktop({ status: async () => status(), call: async () => ({ error: 'The key has no credit left.' }) });
    const { tryOwnBrain, lastOwnBrainResult } = await import('./ownBrain');
    expect(await tryOwnBrain({ contents })).toBeNull();
    expect(lastOwnBrainResult()).toMatchObject({ ok: false, message: 'The key has no credit left.' });
  });

  it('off, no key, no model, or a voice clip on a non-Gemini service: the KaTuro AI answers', async () => {
    const call = vi.fn();
    for (const s of [status({ enabled: false }), status({ hasKey: false, baseUrl: '' }), status({ model: '' })]) {
      vi.resetModules();
      desktop({ status: async () => s, call });
      const { tryOwnBrain } = await import('./ownBrain');
      expect(await tryOwnBrain({ contents })).toBeNull();
    }
    vi.resetModules();
    desktop({ status: async () => status(), call });
    const { tryOwnBrain } = await import('./ownBrain');
    expect(await tryOwnBrain({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'audio/wav', data: 'x' } }] }] })).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });

  it('the website (no desktop app) never uses it', async () => {
    const { tryOwnBrain, ownBrainStatus } = await import('./ownBrain');
    expect(await tryOwnBrain({ contents })).toBeNull();
    expect(await ownBrainStatus()).toBeNull();
  });

  it('callGeminiProxy returns the own-key answer before any server call', async () => {
    desktop({ status: async () => status(), call: async () => ({ text: 'Own answer', finishReason: 'STOP' }) });
    vi.doMock('firebase/functions', () => { throw new Error('the server must not be called'); });
    const { callGeminiProxy } = await import('../../geminiConfig');
    expect(await callGeminiProxy({ action: 'desk_agent_task', contents, maxTokens: 50 })).toEqual({ text: 'Own answer', finishReason: 'STOP', engine: 'own' });
    vi.doUnmock('firebase/functions');
  });

  it('Settings keeps the AI key tab hidden until the gear is clicked 4 times', async () => {
    const { default: DeskSettingsModal } = await import('../../../pages/desk/DeskSettingsModal');
    const html = renderToStaticMarkup(createElement(DeskSettingsModal, { open: true, onClose: () => {}, profile: {} }));
    expect(html).toContain('KaTuroDesk Settings');
    expect(html).not.toContain('AI key');
    expect(html).not.toContain('API key');
  });
});
