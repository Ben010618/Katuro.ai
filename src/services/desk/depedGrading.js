/**
 * depedGrading.js — deterministic DepEd computations for KaTuroDesk.
 * Numbers in official forms must come from code, never from the AI.
 *
 * Sources:
 *  - DepEd Order No. 8, s. 2015 — component weights, transmutation table, descriptors
 *  - DepEd Memorandum No. 160, s. 2012 — MPS mastery levels (NAT descriptors)
 *  - Standard item analysis: difficulty index (p) and discrimination index (D, upper/lower 27%)
 */

// [lowInclusive, transmutedGrade] — DO 8 s.2015 transmutation table, highest first.
const TRANSMUTATION = [
  [100, 100], [98.4, 99], [96.8, 98], [95.2, 97], [93.6, 96], [92.0, 95], [90.4, 94],
  [88.8, 93], [87.2, 92], [85.6, 91], [84.0, 90], [82.4, 89], [80.8, 88], [79.2, 87],
  [77.6, 86], [76.0, 85], [74.4, 84], [72.8, 83], [71.2, 82], [69.6, 81], [68.0, 80],
  [66.4, 79], [64.8, 78], [63.2, 77], [61.6, 76], [60.0, 75], [56.0, 74], [52.0, 73],
  [48.0, 72], [44.0, 71], [40.0, 70], [36.0, 69], [32.0, 68], [28.0, 67], [24.0, 66],
  [20.0, 65], [16.0, 64], [12.0, 63], [8.0, 62], [4.0, 61], [0, 60],
];

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Initial Grade (0–100) → Quarterly (transmuted) Grade 60–100. */
export function transmute(initialGrade) {
  const ig = round2(Math.max(0, Math.min(100, Number(initialGrade) || 0)));
  for (const [low, grade] of TRANSMUTATION) {
    if (ig >= low) return grade;
  }
  return 60;
}

/** DO 8 s.2015 descriptor for a quarterly/final grade. */
export function gradeDescriptor(grade) {
  const g = Number(grade);
  if (g >= 90) return 'Outstanding';
  if (g >= 85) return 'Very Satisfactory';
  if (g >= 80) return 'Satisfactory';
  if (g >= 75) return 'Fairly Satisfactory';
  return 'Did Not Meet Expectations';
}

/** Component weights (fractions) per DO 8 s.2015, Tables 4 and 5. */
export const WEIGHT_PRESETS = {
  languages: { label: 'Languages, AP, EsP (Grades 1–10)', ww: 0.3, pt: 0.5, qa: 0.2 },
  scienceMath: { label: 'Science, Mathematics (Grades 1–10)', ww: 0.4, pt: 0.4, qa: 0.2 },
  mapehEpp: { label: 'MAPEH, EPP/TLE (Grades 1–10)', ww: 0.2, pt: 0.6, qa: 0.2 },
  shsCore: { label: 'SHS Core Subjects', ww: 0.25, pt: 0.5, qa: 0.25 },
  shsAcademic: { label: 'SHS Academic Track — other subjects', ww: 0.25, pt: 0.45, qa: 0.3 },
  shsImmersion: { label: 'SHS Work Immersion / Research / Business Enterprise / Exhibit', ww: 0.35, pt: 0.4, qa: 0.25 },
  shsTvl: { label: 'SHS TVL / Sports / Arts & Design', ww: 0.2, pt: 0.6, qa: 0.2 },
};

/** Best-guess weight preset from a subject name and grade level. */
export function weightPresetFor(subject = '', gradeLevel = '') {
  const s = String(subject).toLowerCase();
  const g = String(gradeLevel).toLowerCase();
  const isShs = /\b(11|12)\b|senior high|shs/.test(g);
  if (isShs) {
    if (/immersion|research|enterprise|exhibit/.test(s)) return 'shsImmersion';
    if (/tvl|sports|arts and design|ict|cookery|smaw|eim/.test(s)) return 'shsTvl';
    if (/oral communication|reading and writing|komunikasyon|pagbasa|21st century|contemporary|media and information|general math|statistics|earth and life|physical science|personal development|understanding culture|philosophy|pe and health/.test(s)) return 'shsCore';
    return 'shsAcademic';
  }
  if (/math|science|sci\b|matematika|agham/.test(s)) return 'scienceMath';
  if (/mapeh|music|arts|physical|health|epp|tle|technology and livelihood|edukasyong pantahanan/.test(s)) return 'mapehEpp';
  return 'languages';
}

const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

/**
 * Computes one learner's quarterly grade.
 * components: { ww: { scores:number[], hps:number[] }, pt: {...}, qa: {...} }
 * weights:    { ww, pt, qa } fractions (default Science/Math)
 * Missing scores (null/undefined/'') count as 0, as in the official ECR template.
 */
export function computeQuarterlyGrade(components = {}, weights = WEIGHT_PRESETS.scienceMath) {
  const result = { components: {}, initialGrade: 0, quarterlyGrade: 60, descriptor: '' };
  let initial = 0;
  for (const key of ['ww', 'pt', 'qa']) {
    const c = components[key] || { scores: [], hps: [] };
    const total = sum(c.scores || []);
    const hps = sum(c.hps || []);
    const ps = hps > 0 ? round2((total / hps) * 100) : 0;
    const ws = round2(ps * (weights[key] ?? 0));
    initial += ws;
    result.components[key] = { total, hps, ps, ws };
  }
  result.initialGrade = round2(initial);
  result.quarterlyGrade = transmute(result.initialGrade);
  result.descriptor = gradeDescriptor(result.quarterlyGrade);
  return result;
}

/** DM 160 s.2012 mastery level for a Mean Percentage Score / item percent correct. */
export function masteryLevel(percent) {
  const p = Number(percent) || 0;
  if (p >= 96) return 'Mastered';
  if (p >= 86) return 'Closely Approximating Mastery';
  if (p >= 66) return 'Moving Towards Mastery';
  if (p >= 35) return 'Average Mastery';
  if (p >= 15) return 'Low Mastery';
  if (p >= 5) return 'Very Low Mastery';
  return 'Absolutely No Mastery';
}

export function difficultyLabel(p) {
  if (p > 0.8) return 'Very Easy';
  if (p > 0.6) return 'Easy';
  if (p > 0.4) return 'Average';
  if (p > 0.2) return 'Difficult';
  return 'Very Difficult';
}

export function discriminationLabel(d) {
  if (d === null || d === undefined || Number.isNaN(d)) return '—';
  if (d >= 0.4) return 'Very Good (Retain)';
  if (d >= 0.3) return 'Good (Retain)';
  if (d >= 0.2) return 'Fair (Revise)';
  return 'Poor (Revise/Reject)';
}

/**
 * Item analysis from a learner × item response matrix.
 *
 * learners: [{ name, responses: (0|1|null)[] }]   1 = correct, 0 = wrong, null = blank (wrong)
 * items:    [{ number, competency?, code? }]      optional per-item labels (length = item count)
 * options:  { lmcThreshold = 75 }                 % correct below which an item is Least Mastered
 */
export function analyzeItems(learners = [], items = [], { lmcThreshold = 75 } = {}) {
  const n = learners.length;
  const itemCount = Math.max(items.length, ...learners.map((l) => l.responses?.length || 0), 0);
  const totals = learners.map((l) => ({ name: l.name, score: sum((l.responses || []).map((r) => (r ? 1 : 0))) }));

  // Upper and lower 27% groups by total score (D index). Needs at least 4 learners.
  const groupSize = n >= 4 ? Math.max(1, Math.round(n * 0.27)) : 0;
  const ranked = learners.map((l, i) => ({ l, score: totals[i].score })).sort((a, b) => b.score - a.score);
  const upper = ranked.slice(0, groupSize).map((x) => x.l);
  const lower = groupSize ? ranked.slice(-groupSize).map((x) => x.l) : [];

  const perItem = [];
  for (let i = 0; i < itemCount; i++) {
    const correct = learners.filter((l) => l.responses?.[i]).length;
    const p = n ? correct / n : 0;
    const percent = round2(p * 100);
    let d = null;
    if (groupSize) {
      const pu = upper.filter((l) => l.responses?.[i]).length / groupSize;
      const pl = lower.filter((l) => l.responses?.[i]).length / groupSize;
      d = round2(pu - pl);
    }
    perItem.push({
      number: items[i]?.number ?? i + 1,
      competency: items[i]?.competency || '',
      code: items[i]?.code || '',
      correct,
      examinees: n,
      percentCorrect: percent,
      difficulty: round2(p),
      difficultyLabel: difficultyLabel(p),
      discrimination: d,
      discriminationLabel: discriminationLabel(d),
      mastery: masteryLevel(percent),
      isLeastMastered: percent < lmcThreshold,
    });
  }

  const scores = totals.map((t) => t.score);
  const mean = n ? sum(scores) / n : 0;
  const sd = n > 1 ? Math.sqrt(sum(scores.map((s) => (s - mean) ** 2)) / (n - 1)) : 0;
  const mps = itemCount ? round2((mean / itemCount) * 100) : 0;

  return {
    examinees: n,
    itemCount,
    mean: round2(mean),
    standardDeviation: round2(sd),
    mps,
    masteryLevel: masteryLevel(mps),
    highest: n ? Math.max(...scores) : 0,
    lowest: n ? Math.min(...scores) : 0,
    lmcThreshold,
    items: perItem,
    leastMastered: perItem.filter((it) => it.isLeastMastered).sort((a, b) => a.percentCorrect - b.percentCorrect),
    learners: totals.map((t) => ({ ...t, percent: itemCount ? round2((t.score / itemCount) * 100) : 0 })),
  };
}

/**
 * Score-only analysis (when only total scores are available, no per-item responses):
 * MPS, mastery, and the learners below a cut-off for remediation.
 */
export function analyzeTotals(learners = [], totalItems, { passPercent = 75 } = {}) {
  const n = learners.length;
  const scores = learners.map((l) => Number(l.score) || 0);
  const mean = n ? sum(scores) / n : 0;
  const mps = totalItems ? round2((mean / totalItems) * 100) : 0;
  const withPct = learners.map((l) => ({ ...l, percent: totalItems ? round2(((Number(l.score) || 0) / totalItems) * 100) : 0 }));
  return {
    examinees: n,
    totalItems,
    mean: round2(mean),
    mps,
    masteryLevel: masteryLevel(mps),
    passPercent,
    belowPass: withPct.filter((l) => l.percent < passPercent).sort((a, b) => a.percent - b.percent),
    learners: withPct,
  };
}

/** Learners with `minConsecutive`+ consecutive absences (SARDO early warning). */
export function findConsecutiveAbsences(learners = [], minConsecutive = 3) {
  // learners: [{ name, days: ('P'|'A'|'L'|'E'|''|null)[] }] — 'A' (or 'x') marks an absence.
  return learners
    .map((l) => {
      let run = 0;
      let longest = 0;
      let total = 0;
      for (const d of l.days || []) {
        const absent = /^(a|x|absent)$/i.test(String(d ?? '').trim());
        if (absent) {
          run += 1;
          total += 1;
          longest = Math.max(longest, run);
        } else if (String(d ?? '').trim() !== '') {
          run = 0;
        }
      }
      return { name: l.name, longestConsecutive: longest, totalAbsences: total };
    })
    .filter((x) => x.longestConsecutive >= minConsecutive)
    .sort((a, b) => b.longestConsecutive - a.longestConsecutive);
}
