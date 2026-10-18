import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../firebase', () => ({ default: {}, db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(async () => ({ exists: () => false })), setDoc: vi.fn(), deleteDoc: vi.fn() }));

const { detectService, serviceOf, keyHint, saveUniversalAi, SERVICES } = await import('./universalAiConfig');
const { default: UniversalAiKeyCard } = await import('./UniversalAiKeyCard');

describe('Admin > Universal AI key', () => {
  it('shows one universal key box for any AI service', () => {
    const html = renderToStaticMarkup(<UniversalAiKeyCard adminUid="a1" />);
    expect(html).toContain('Universal AI key');
    expect(html).toContain('Paste any AI API key here');
    expect(html).toContain('type="password"');
    for (const s of ['Google Gemini', 'OpenAI', 'Anthropic Claude', 'OpenRouter', 'Groq', 'Other service (OpenAI-compatible)']) expect(html).toContain(s);
  });

  it('recognizes the service from the key and from saved settings', () => {
    expect(detectService('AIzaSyD-abcdefghijklmnopqrstuvwxyz12345')).toBe('gemini');
    expect(detectService('sk-ant-api03-x')).toBe('claude');
    expect(detectService('sk-or-v1-x')).toBe('openrouter');
    expect(detectService('gsk_x')).toBe('groq');
    expect(detectService('sk-proj-x')).toBe('openai');
    expect(detectService('hello')).toBeNull();
    expect(serviceOf('openai', 'https://api.groq.com/openai/v1/').id).toBe('groq');
    expect(serviceOf('openai', 'https://my.server/v1').id).toBe('other');
    expect(serviceOf('claude').label).toBe('Anthropic Claude');
    expect(keyHint('sk-proj-secret1234')).toBe('…1234');
    expect(SERVICES.every((s) => ['gemini', 'openai', 'claude'].includes(s.provider))).toBe(true);
  });

  it('refuses incomplete settings before saving anything', async () => {
    await expect(saveUniversalAi({ provider: 'nope', model: 'x' })).rejects.toThrow(/Choose the AI service/);
    await expect(saveUniversalAi({ provider: 'openai', model: '' })).rejects.toThrow(/model/);
    await expect(saveUniversalAi({ provider: 'openai', model: 'm', baseUrl: 'ftp://x' })).rejects.toThrow(/server address/);
    await expect(saveUniversalAi({ provider: 'gemini', model: 'g', apiKey: 'has space' })).rejects.toThrow(/space/);
  });
});
