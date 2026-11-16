import { describe, it, expect } from 'vitest';
import { parseScoreReply } from './scoreReading.js';

describe('reading a handwritten score', () => {
  it('a clear reading within the highest possible score is sure', () => {
    expect(parseScoreReply({ score: 18, outOf: 20, sure: true }, 20)).toEqual({ score: 18, outOf: 20, sure: true });
    expect(parseScoreReply({ score: '17.5', outOf: null, sure: true }, 20)).toEqual({ score: 17.5, outOf: null, sure: true });
  });

  it('anything doubtful is not sure, so the teacher must type it', () => {
    expect(parseScoreReply({ score: 25, outOf: null, sure: true }, 20).sure).toBe(false); // above the HPS
    expect(parseScoreReply({ score: 18, outOf: 25, sure: true }, 20).sure).toBe(false); // written out of another total
    expect(parseScoreReply({ score: null, outOf: null, sure: true }, 20).sure).toBe(false);
    expect(parseScoreReply({ score: 7, sure: false }, 10).sure).toBe(false);
    expect(parseScoreReply(null, 10)).toEqual({ score: null, outOf: null, sure: false });
  });
});
