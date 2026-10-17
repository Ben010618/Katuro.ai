import { describe, it, expect } from 'vitest';
import { normalizePhrase, defaultPhrases, wakePhrases, grammarFor, matchWake, stableWake, ackFor, LOOKALIKES, MAX_PHRASES } from './wakeWord';

describe('wake phrase', () => {
  it("each persona answers to its own name; the teacher can add phrases of 2 to 4 words", () => {
    expect(defaultPhrases('Matt')).toEqual(['hello matt', 'hey matt']);
    expect(defaultPhrases('Lola Carmen')).toEqual(['hello carmen', 'hey carmen', 'hello lola carmen']);
    expect(normalizePhrase("  Okay, Teacher's Helper! ")).toBe('okay teachers helper');
    expect(normalizePhrase('Matt')).toBe('');
    expect(normalizePhrase('one two three four five')).toBe('');
    expect(wakePhrases('Luna', ['Good morning Luna', 'hello luna', 'Hello class', 'x'])).toEqual(['hello luna', 'hey luna', 'good morning luna']);
    expect(wakePhrases('Matt', ['a b', 'c d', 'e f', 'g h', 'i j', 'k l'])).toHaveLength(MAX_PHRASES);
  });

  it('the recognizer chooses only between wake phrases, classroom look-alikes and "something else"', () => {
    const g = JSON.parse(grammarFor(['hello matt']));
    expect(g[0]).toBe('hello matt');
    expect(g).toContain('hello mam');
    expect(g.at(-1)).toBe('[unk]');
    expect(LOOKALIKES).toContain('hello class');
  });

  it('a wake phrase must be said as whole words in order, and clearly', () => {
    const phrases = ['hello matt', 'hey matt'];
    expect(matchWake({ text: 'hello matt' }, phrases)).toBe('hello matt');
    expect(matchWake({ text: 'hello matt [unk]' }, phrases)).toBe('hello matt');
    expect(matchWake({ partial: '[unk] hey matt' }, phrases)).toBe('hey matt');
    expect(matchWake({ text: 'hello mam [unk]' }, phrases)).toBeNull();
    expect(matchWake({ text: 'matt [unk]' }, phrases)).toBeNull();
    expect(matchWake({ text: 'hello class good morning everyone' }, phrases)).toBeNull();
    expect(matchWake({ text: '' }, phrases)).toBeNull();
    const unsure = { text: 'hello matt', result: [{ word: 'hello', conf: 0.95 }, { word: 'matt', conf: 0.4 }] };
    expect(matchWake(unsure, phrases)).toBeNull();
    expect(matchWake({ ...unsure, result: [{ word: 'hello', conf: 0.95 }, { word: 'matt', conf: 0.9 }] }, phrases)).toBe('hello matt');
  });

  it('fast wake: once the speaking stops and the running guess has settled on the phrase', () => {
    const phrases = ['hello matt', 'hey matt'];
    const s = { partial: 'hello matt', changedAt: 1000, quietSince: 1100 };
    expect(stableWake(s, phrases, 1300)).toBeNull(); // not settled yet
    expect(stableWake(s, phrases, 1600)).toBe('hello matt');
    expect(stableWake({ ...s, quietSince: 0 }, phrases, 5000)).toBeNull(); // still speaking
    expect(stableWake({ ...s, partial: '[unk] hello matt [unk]' }, phrases, 1600)).toBe('hello matt');
    expect(stableWake({ ...s, partial: 'hello mam' }, phrases, 1600)).toBeNull();
    expect(stableWake({ ...s, partial: 'hello matt hello class' }, phrases, 1600)).toBeNull();
    expect(stableWake({ ...s, partial: '' }, phrases, 9000)).toBeNull();
  });

  it("the persona's short answer uses the teacher's name", () => {
    expect(ackFor('matt', 'Teacher Ana', 0)).toBe('Yow Teacher Ana! What can I do for you?');
    expect(ackFor('carmen', 'Sir Ben', 0)).toBe('What is it, Sir Ben? Make it quick.');
    expect(ackFor('nobody', '', 0.99)).toBe("Hey Teacher! Matt here, I'm all ears!");
  });
});
