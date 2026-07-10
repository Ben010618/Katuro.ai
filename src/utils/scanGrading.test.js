import { describe, it, expect } from 'vitest';
import { gradeScan } from './scanGrading';

describe('gradeScan', () => {
  it('scores every matching answer and reports the correct total', () => {
    const result = gradeScan({ '1': 'A', '2': 'C', '3': 'B' }, ['A', 'C', 'D']);
    expect(result.score).toBe(2);
    expect(result.total).toBe(3);
  });

  it('treats a missing/blank detection as incorrect, not a crash', () => {
    const result = gradeScan({ '1': 'A' }, ['A', 'B']);
    expect(result.perQuestion[1]).toEqual({ num: 2, detected: null, correct: 'B', isCorrect: false });
  });

  it('never matches a null-vs-null pair as correct', () => {
    const result = gradeScan({ '1': null }, ['A']);
    expect(result.perQuestion[0].isCorrect).toBe(false);
  });

  it('produces one perQuestion entry per answer-key item, in order', () => {
    const result = gradeScan({}, ['A', 'B', 'C', 'D']);
    expect(result.perQuestion.map(q => q.num)).toEqual([1, 2, 3, 4]);
    expect(result.score).toBe(0);
  });
});
