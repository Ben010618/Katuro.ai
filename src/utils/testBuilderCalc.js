// kaTuro Test Builder — pure computation functions.
// Kept dependency-free and side-effect-free so they can be unit tested in isolation
// from the UI (see testBuilderCalc.test.js).

import { COGNITIVE_LEVELS, DAY_LIMIT } from '../config/testBuilderConfig';

/**
 * Two-pass largest-remainder rounding: distributes `total` (an integer) across
 * `values` proportionally, rounding down then handing out the leftover units to
 * whichever entries had the largest fractional remainder. Guaranteed to sum
 * exactly to `total`.
 */
export function largestRemainder(values, total) {
  const floors = values.map(Math.floor);
  const remainder = total - floors.reduce((sum, v) => sum + v, 0);
  const order = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
    .map((o) => o.i);

  const result = [...floors];
  for (let k = 0; k < remainder && k < order.length; k++) {
    result[order[k]] += 1;
  }
  return result;
}

/**
 * Proportionally redistributes the six cognitive-weight sliders so they always
 * sum to exactly 100, keeping `changedIndex` pinned to `newValue`.
 */
export function normalizeWeights(weights, changedIndex, newValue) {
  const clamped = Math.max(0, Math.min(100, Math.round(newValue)));
  const result = [...weights];
  result[changedIndex] = clamped;

  const others = weights.map((_, i) => i).filter((i) => i !== changedIndex);
  const oldOthersSum = others.reduce((sum, i) => sum + weights[i], 0);
  const remaining = 100 - clamped;

  if (oldOthersSum <= 0) {
    const equalShare = Math.floor(remaining / others.length);
    others.forEach((i) => { result[i] = equalShare; });
  } else {
    others.forEach((i) => {
      result[i] = Math.round((weights[i] / oldOthersSum) * remaining);
    });
  }

  const diff = 100 - result.reduce((sum, v) => sum + v, 0);
  if (diff !== 0) {
    let maxIdx = others[0];
    for (const i of others) {
      if (result[i] > result[maxIdx]) maxIdx = i;
    }
    result[maxIdx] += diff;
  }

  return result;
}

export function totalDays(daysArray) {
  return daysArray.reduce((sum, d) => sum + (d || 0), 0);
}

/**
 * Clamps a competency row's days value so the term's total instructional days
 * never exceeds `dayLimit`. Silent clamp — the field just settles at the max.
 */
export function clampCompetencyDays(daysArray, rowIndex, newValue, dayLimit = DAY_LIMIT) {
  const othersSum = totalDays(daysArray) - daysArray[rowIndex];
  const maxAllowed = Math.max(1, dayLimit - othersSum);
  const clamped = Math.max(1, Math.min(newValue, maxAllowed));
  const result = [...daysArray];
  result[rowIndex] = clamped;
  return result;
}

const HOTS_KEYS = COGNITIVE_LEVELS.filter((l) => l.hots).map((l) => l.key);
const LEVEL_KEYS = COGNITIVE_LEVELS.map((l) => l.key);

/**
 * Builds the Table of Specifications: Pass 1 distributes itemCeiling across
 * competencies weighted by instructional days; Pass 2 distributes each
 * competency's item total across the 6 cognitive levels weighted by
 * cognitiveWeights. Both passes use largestRemainder so totals are always exact.
 */
export function computeTOS(competencies, cognitiveWeights, itemCeiling) {
  const daysSum = totalDays(competencies.map((c) => c.days));

  if (competencies.length === 0 || daysSum <= 0 || itemCeiling <= 0) {
    return {
      rows: competencies.map((c) => ({ competencyId: c.id, label: c.text, cells: [0, 0, 0, 0, 0, 0], total: 0 })),
      columnTotals: [0, 0, 0, 0, 0, 0],
      hotsCount: 0,
      hotsPct: 0,
    };
  }

  const rawTopicTotals = competencies.map((c) => ((c.days || 0) / daysSum) * itemCeiling);
  const topicTotals = largestRemainder(rawTopicTotals, itemCeiling);

  const rows = competencies.map((c, i) => {
    const total = topicTotals[i];
    const rawCells = LEVEL_KEYS.map((k) => (total * (cognitiveWeights[k] || 0)) / 100);
    const cells = total > 0 ? largestRemainder(rawCells, total) : [0, 0, 0, 0, 0, 0];
    return { competencyId: c.id, label: c.text, cells, total };
  });

  const columnTotals = [0, 0, 0, 0, 0, 0];
  rows.forEach((r) => r.cells.forEach((v, idx) => { columnTotals[idx] += v; }));

  const hotsIdx = LEVEL_KEYS.reduce((acc, k, i) => (HOTS_KEYS.includes(k) ? [...acc, i] : acc), []);
  const hotsCount = hotsIdx.reduce((sum, i) => sum + columnTotals[i], 0);
  const hotsPct = itemCeiling > 0 ? (hotsCount / itemCeiling) * 100 : 0;

  return { rows, columnTotals, hotsCount, hotsPct };
}

export function computeHotsPct(weights) {
  return HOTS_KEYS.reduce((sum, k) => sum + (weights[k] || 0), 0);
}

/**
 * Safety net for externally-sourced weights (e.g. an AI suggestion) that may
 * not sum to exactly 100 — rounds each to an integer, then nudges whichever
 * entry is largest to absorb the rounding diff, same correction rule as
 * normalizeWeights.
 */
export function coerceWeightsTo100(values) {
  const ints = values.map((v) => Math.max(0, Math.round(Number(v) || 0)));
  const diff = 100 - ints.reduce((sum, v) => sum + v, 0);
  if (diff !== 0) {
    let maxIdx = 0;
    ints.forEach((v, i) => { if (v > ints[maxIdx]) maxIdx = i; });
    ints[maxIdx] = Math.max(0, ints[maxIdx] + diff);
  }
  return ints;
}
