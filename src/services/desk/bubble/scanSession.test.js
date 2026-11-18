import { describe, it, expect } from 'vitest';
import { createScanSession } from './scanSession.js';
import { sheetCode } from './layout.js';

const quiz = { setId: 'ABC234', items: 3, learners: [{ n: 1 }, { n: 2 }] };
const read = (number, letters = 'ABC', setId = 'ABC234') => ({
  ok: true,
  code: number === null ? null : sheetCode(setId, number),
  answers: Object.fromEntries([...letters].map((l, i) => [i + 1, l === '-' ? '' : l])),
  notes: {},
});

describe('live bubble-sheet scanner', () => {
  it('takes a sheet only when two readings in a row agree', () => {
    const s = createScanSession(quiz);
    expect(s.feed(read(1, 'ABC')).status).toBe('steady');
    expect(s.feed(read(1, 'ABD')).status).toBe('steady'); // blurry frame read differently
    const r = s.feed(read(1, 'ABD'));
    expect(r.status).toBe('accepted');
    expect(r.sheet).toEqual({ ok: true, number: 1, answers: { 1: 'A', 2: 'B', 3: 'D' }, notes: {} });
  });

  it('takes each learner once, then the next learner', () => {
    const s = createScanSession(quiz);
    s.feed(read(1)); s.feed(read(1));
    s.feed({ ok: false, error: 'corners' }); // the sheet went away, then came back
    s.feed(read(1));
    expect(s.feed(read(1)).status).toBe('duplicate');
    s.feed(read(2));
    expect(s.feed(read(2)).status).toBe('accepted');
    expect([...s.taken]).toEqual([1, 2]);
  });

  it('remembers learners scanned before (a second batch)', () => {
    const s = createScanSession(quiz, { taken: [1] });
    s.feed(read(1));
    expect(s.feed(read(1)).status).toBe('duplicate');
  });

  it('a sheet with no readable code is taken once while it stays in view; the next one is taken too', () => {
    const s = createScanSession(quiz);
    s.feed(read(null));
    expect(s.feed(read(null)).status).toBe('accepted');
    s.feed(read(null));
    expect(s.feed(read(null)).status).toBe('held');
    // The next blank sheet slid in without the camera ever losing the corners.
    s.feed(read(null, 'CCC'));
    expect(s.feed(read(null, 'CCC')).status).toBe('accepted');
    // The same answers again after the sheet left the camera: another learner's sheet.
    expect(s.feed({ ok: false, error: 'corners' }).status).toBe('searching');
    s.feed(read(null, 'CCC'));
    expect(s.feed(read(null, 'CCC')).status).toBe('accepted');
    expect(s.count).toBe(3);
  });

  it('the learner just taken still in view is "held", not "already scanned"', () => {
    const s = createScanSession(quiz);
    s.feed(read(1)); s.feed(read(1));
    s.feed(read(1));
    expect(s.feed(read(1)).status).toBe('held');
    // Glare: the code is misread on a few frames; the same answers are the same sheet.
    s.feed(read(null));
    expect(s.feed(read(null)).status).toBe('held');
    expect(s.count).toBe(1);
  });

  it('says when a sheet is from another quiz, or the corners are not all in view', () => {
    const s = createScanSession(quiz);
    expect(s.feed(read(1, 'ABC', 'ZZZ999')).status).toBe('otherQuiz');
    expect(s.feed({ ok: false, error: 'alignment' }).status).toBe('adjust');
  });

  it('reads an answer key sheet, and refuses unclear or blank items', () => {
    const k = createScanSession(quiz, { mode: 'key' });
    k.feed(read(0, 'BCA'));
    expect(k.feed(read(0, 'BCA'))).toEqual({ status: 'key', key: ['B', 'C', 'A'] });
    const u = createScanSession(quiz, { mode: 'key' });
    u.feed(read(0, 'B?-'));
    expect(u.feed(read(0, 'B?-'))).toEqual({ status: 'unclear', items: [2, 3] });
  });
});
