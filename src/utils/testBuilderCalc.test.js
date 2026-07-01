import { describe, it, expect } from 'vitest';
import {
  largestRemainder,
  normalizeWeights,
  clampCompetencyDays,
  totalDays,
  computeTOS,
} from './testBuilderCalc';

describe('largestRemainder', () => {
  it('sums exactly to the target total', () => {
    const values = [10 / 3, 10 / 3, 10 / 3];
    const result = largestRemainder(values, 10);
    expect(result.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('gives the extra unit(s) to the largest fractional remainder(s)', () => {
    // 7/3 each => floors [2,2,2], remainder 1 — all fracs tied at .333,
    // so the first index in sorted order gets it.
    const result = largestRemainder([7 / 3, 7 / 3, 7 / 3], 7);
    expect(result).toEqual([3, 2, 2]);
  });

  it('handles an already-exact distribution with zero remainder', () => {
    expect(largestRemainder([5, 3, 2], 10)).toEqual([5, 3, 2]);
  });

  it('handles a zero total', () => {
    expect(largestRemainder([0, 0, 0], 0)).toEqual([0, 0, 0]);
  });

  it('distributes days-weighted item totals across competencies exactly (TOS pass 1 shape)', () => {
    // 3 competencies with days 7, 3, 40 sharing 50 items
    const days = [7, 3, 40];
    const daysSum = days.reduce((a, b) => a + b, 0);
    const raw = days.map((d) => (d / daysSum) * 50);
    const result = largestRemainder(raw, 50);
    expect(result.reduce((a, b) => a + b, 0)).toBe(50);
  });
});

describe('normalizeWeights', () => {
  const PRESET = [30, 25, 25, 10, 5, 5]; // KS2 preset order: R,U,Ap,An,E,C

  it('always sums to exactly 100 after a single slider change', () => {
    const result = normalizeWeights(PRESET, 0, 60);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    expect(result[0]).toBe(60);
  });

  it('never mutates the changed index during redistribution', () => {
    const result = normalizeWeights(PRESET, 3, 0);
    expect(result[3]).toBe(0);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('pushes a slider to 100 and zeroes out the rest, still summing to 100', () => {
    const result = normalizeWeights(PRESET, 2, 100);
    expect(result[2]).toBe(100);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('equally distributes remaining when all other sliders were already at 0', () => {
    const allZeroExceptOne = [100, 0, 0, 0, 0, 0];
    const result = normalizeWeights(allZeroExceptOne, 0, 40);
    expect(result[0]).toBe(40);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('repeated changes across many sliders keep the sum stable at 100', () => {
    let weights = [...PRESET];
    const edits = [[1, 40], [4, 20], [5, 15], [0, 10], [2, 5]];
    for (const [idx, val] of edits) {
      weights = normalizeWeights(weights, idx, val);
      expect(weights.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});

describe('clampCompetencyDays', () => {
  it('allows a value within the remaining budget', () => {
    const result = clampCompetencyDays([10, 10, 10], 0, 15, 50);
    expect(result[0]).toBe(15);
  });

  it('silently clamps to the max allowed when exceeding the day limit', () => {
    // others sum = 10 + 10 = 20, dayLimit 50 => maxAllowed = 30
    const result = clampCompetencyDays([10, 10, 10], 0, 999, 50);
    expect(result[0]).toBe(30);
    expect(totalDays(result)).toBe(50);
  });

  it('never lets the term total exceed the day limit across repeated edits', () => {
    let days = [1, 1, 1];
    days = clampCompetencyDays(days, 0, 48, 50);
    days = clampCompetencyDays(days, 1, 48, 50);
    days = clampCompetencyDays(days, 2, 48, 50);
    expect(totalDays(days)).toBeLessThanOrEqual(50);
  });

  it('never clamps below 1', () => {
    const result = clampCompetencyDays([1, 1, 1], 0, 0, 50);
    expect(result[0]).toBe(1);
  });

  it('maxAllowed floors at 1 even when others already consume the whole budget', () => {
    const result = clampCompetencyDays([1, 49, 0], 2, 10, 50);
    // othersSum = 1 + 49 = 50, dayLimit - othersSum = 0 => maxAllowed = max(1, 0) = 1
    expect(result[2]).toBe(1);
  });
});

describe('computeTOS', () => {
  const competencies = [
    { id: 'a', text: 'Comp A', days: 7 },
    { id: 'b', text: 'Comp B', days: 3 },
    { id: 'c', text: 'Comp C', days: 40 },
  ];
  const weights = { remembering: 20, understanding: 20, applying: 20, analyzing: 16, evaluating: 14, creating: 10 };

  it('row totals exactly equal each competency\'s derived item total', () => {
    const { rows } = computeTOS(competencies, weights, 50);
    rows.forEach((r) => {
      expect(r.cells.reduce((a, b) => a + b, 0)).toBe(r.total);
    });
  });

  it('grand total exactly equals itemCeiling', () => {
    const { rows } = computeTOS(competencies, weights, 50);
    const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
    expect(grandTotal).toBe(50);
  });

  it('column totals sum to itemCeiling too', () => {
    const { columnTotals } = computeTOS(competencies, weights, 50);
    expect(columnTotals.reduce((a, b) => a + b, 0)).toBe(50);
  });

  it('returns all-zero rows when there are no instructional days yet', () => {
    const zeroDay = [{ id: 'a', text: 'Comp A', days: 0 }];
    const { rows, hotsPct } = computeTOS(zeroDay, weights, 50);
    expect(rows[0].total).toBe(0);
    expect(hotsPct).toBe(0);
  });
});
