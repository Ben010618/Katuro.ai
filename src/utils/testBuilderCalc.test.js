import { describe, it, expect } from 'vitest';
import {
  largestRemainder,
  normalizeWeights,
  clampCompetencyDays,
  totalDays,
  computeTOS,
  coerceWeightsTo100,
  buildItemSlots,
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

describe('coerceWeightsTo100', () => {
  it('leaves an already-valid 100-sum distribution untouched', () => {
    expect(coerceWeightsTo100([20, 20, 20, 16, 14, 10])).toEqual([20, 20, 20, 16, 14, 10]);
  });

  it('nudges the largest entry to absorb a rounding shortfall', () => {
    // AI-ish output summing to 98 (rounding drift)
    const result = coerceWeightsTo100([19, 19, 19, 16, 14, 11]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('nudges the largest entry to absorb an overage', () => {
    const result = coerceWeightsTo100([25, 25, 25, 16, 14, 10]); // sums to 115
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('never produces a negative weight', () => {
    const result = coerceWeightsTo100([0, 0, 0, 0, 0, 5]); // sums to 5, needs +95
    expect(result.every((v) => v >= 0)).toBe(true);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('buildItemSlots', () => {
  it('uses ONLY the single selected format for every item — the must-have guarantee', () => {
    const cells = [3, 2, 1, 1, 0, 0]; // 7 items total
    const slots = buildItemSlots(cells, ['Multiple Choice']);
    expect(slots).toHaveLength(7);
    expect(slots.every((s) => s.format === 'Multiple Choice')).toBe(true);
  });

  it('produces exactly one slot per item across all cognitive levels', () => {
    const cells = [3, 2, 1, 1, 0, 2];
    const slots = buildItemSlots(cells, ['Multiple Choice', 'True or False']);
    expect(slots).toHaveLength(cells.reduce((a, b) => a + b, 0));
  });

  it('tags each slot with the cognitive level its count came from, in order', () => {
    const cells = [2, 0, 0, 0, 0, 1]; // 2 remembering, 1 creating
    const slots = buildItemSlots(cells, ['Multiple Choice']);
    expect(slots.map((s) => s.cognitiveLevel)).toEqual(['remembering', 'remembering', 'creating']);
  });

  it('uses every selected format when more than one is chosen (round-robin)', () => {
    const cells = [6, 0, 0, 0, 0, 0];
    const slots = buildItemSlots(cells, ['Multiple Choice', 'True or False', 'Identification']);
    const usedFormats = new Set(slots.map((s) => s.format));
    expect(usedFormats).toEqual(new Set(['Multiple Choice', 'True or False', 'Identification']));
  });

  it('never assigns a format outside the selected list', () => {
    const cells = [10, 0, 0, 0, 0, 0];
    const slots = buildItemSlots(cells, ['Essay', 'Matching Type']);
    expect(slots.every((s) => ['Essay', 'Matching Type'].includes(s.format))).toBe(true);
  });

  it('continues the round-robin from startIndex so distribution stays fair across competencies', () => {
    const formats = ['Multiple Choice', 'True or False'];
    const first = buildItemSlots([3, 0, 0, 0, 0, 0], formats, 0);
    const second = buildItemSlots([3, 0, 0, 0, 0, 0], formats, first.length);
    // first: MC,TF,MC (idx 0,1,2) — second continues at idx 3,4,5: TF,MC,TF
    expect(second.map((s) => s.format)).toEqual(['True or False', 'Multiple Choice', 'True or False']);
  });

  it('returns an empty array when no formats are selected', () => {
    expect(buildItemSlots([1, 1, 1, 1, 1, 1], [])).toEqual([]);
  });
});
