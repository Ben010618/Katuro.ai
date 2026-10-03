import { describe, it, expect, vi } from 'vitest';

vi.mock('../firebase', () => ({ default: {}, db: {}, auth: { currentUser: null } }));
vi.mock('./db', () => ({ reportAIError: vi.fn(() => Promise.resolve()) }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn() }));

const { withAccuracyRules, WEB_ACCURACY_RULES } = await import('./geminiConfig');

describe('web AI requests carry the accuracy rules', () => {
  const prompt = [{ role: 'user', parts: [{ text: 'Write a DLL for Science 7. Return JSON.' }] }];

  it('puts the rules first in the first user message, keeping the prompt intact', () => {
    const out = withAccuracyRules('dll_gen', prompt);
    expect(out[0].parts[0].text).toBe(WEB_ACCURACY_RULES);
    expect(out[0].parts[1].text).toBe('Write a DLL for Science 7. Return JSON.');
    expect(prompt[0].parts).toHaveLength(1); // the caller's array is not changed
  });

  it('forbids invented codes, names, dates and gap-filling', () => {
    expect(WEB_ACCURACY_RULES).toMatch(/competency codes/);
    expect(WEB_ACCURACY_RULES).toMatch(/Never fill a gap/);
    expect(WEB_ACCURACY_RULES).toMatch(/output format/);
  });

  it('adds them once, keeps images, and leaves KaTuroDesk (own rules) alone', () => {
    const twice = withAccuracyRules('dll_gen', withAccuracyRules('dll_gen', prompt));
    expect(twice[0].parts.filter((p) => p.text === WEB_ACCURACY_RULES)).toHaveLength(1);
    const scan = [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'x' } }, { text: 'Read the marks' }] }];
    expect(withAccuracyRules('scan_ai', scan)[0].parts[1].inlineData).toBeTruthy();
    expect(withAccuracyRules('desk_agent_run', prompt)).toBe(prompt);
    expect(withAccuracyRules('dll_gen', [])).toEqual([]);
  });
});
