import { describe, it, expect } from 'vitest';
import {
  transmute,
  gradeDescriptor,
  computeQuarterlyGrade,
  WEIGHT_PRESETS,
  weightPresetFor,
  masteryLevel,
  analyzeItems,
  analyzeTotals,
  findConsecutiveAbsences,
} from './depedGrading';
import { markdownToDocumentSpec, normalizeDocumentSpec, parseInlineRuns } from './docSpec';

describe('DO 8 s.2015 transmutation', () => {
  it.each([
    [100, 100], [98.4, 99], [98.39, 98], [60, 75], [59.99, 74], [61.6, 76], [0, 60], [3.99, 60], [4, 61], [-5, 60], [120, 100],
  ])('initial %s → %s', (ig, qg) => {
    expect(transmute(ig)).toBe(qg);
  });

  it('descriptors', () => {
    expect(gradeDescriptor(90)).toBe('Outstanding');
    expect(gradeDescriptor(75)).toBe('Fairly Satisfactory');
    expect(gradeDescriptor(74)).toBe('Did Not Meet Expectations');
  });
});

describe('computeQuarterlyGrade', () => {
  it('matches a hand computation (Science/Math weights)', () => {
    const g = computeQuarterlyGrade({
      ww: { scores: [18, 17], hps: [20, 20] }, // 87.5 PS → 35 WS
      pt: { scores: [40], hps: [50] }, // 80 PS → 32 WS
      qa: { scores: [42], hps: [50] }, // 84 PS → 16.8 WS
    }, WEIGHT_PRESETS.scienceMath);
    expect(g.components.ww.ps).toBe(87.5);
    expect(g.initialGrade).toBe(83.8);
    expect(g.quarterlyGrade).toBe(89);
    expect(g.descriptor).toBe('Very Satisfactory');
  });

  it('treats missing scores as zero and empty components safely', () => {
    const g = computeQuarterlyGrade({ ww: { scores: [null, 10], hps: [10, 10] } }, WEIGHT_PRESETS.languages);
    expect(g.components.ww.ps).toBe(50);
    expect(g.components.pt.ps).toBe(0);
  });

  it('picks weight presets by subject/grade', () => {
    expect(weightPresetFor('Mathematics', 'Grade 7')).toBe('scienceMath');
    expect(weightPresetFor('Filipino', 'Grade 4')).toBe('languages');
    expect(weightPresetFor('MAPEH', 'Grade 5')).toBe('mapehEpp');
    expect(weightPresetFor('Oral Communication', 'Grade 11')).toBe('shsCore');
    expect(weightPresetFor('Work Immersion', 'Grade 12')).toBe('shsImmersion');
  });
});

describe('item analysis', () => {
  const learners = [
    { name: 'A', responses: [1, 1, 1, 1] },
    { name: 'B', responses: [1, 1, 1, 0] },
    { name: 'C', responses: [1, 1, 0, 0] },
    { name: 'D', responses: [1, 0, 0, 0] },
  ];

  it('computes MPS, difficulty, discrimination and LMC', () => {
    const r = analyzeItems(learners, [], { lmcThreshold: 75 });
    expect(r.itemCount).toBe(4);
    expect(r.mps).toBe(62.5);
    expect(r.items[0].percentCorrect).toBe(100);
    expect(r.items[3].percentCorrect).toBe(25);
    expect(r.items[3].discrimination).toBe(1); // top learner right, bottom wrong
    expect(r.leastMastered.map((i) => i.number)).toEqual([4, 3]);
    expect(masteryLevel(r.mps)).toBe('Average Mastery');
  });

  it('totals-only analysis lists learners below the cut-off', () => {
    const r = analyzeTotals([{ name: 'A', score: 28 }, { name: 'B', score: 15 }], 30);
    expect(r.mps).toBe(71.67);
    expect(r.belowPass.map((l) => l.name)).toEqual(['B']);
  });

  it('flags consecutive absences (SARDO)', () => {
    const r = findConsecutiveAbsences([
      { name: 'A', days: ['P', 'A', 'A', 'A', 'P'] },
      { name: 'B', days: ['A', 'P', 'A', 'P', 'A'] },
      { name: 'C', days: ['x', 'x', '', 'x', 'P'] }, // blank (holiday) doesn't break a run
    ], 3);
    expect(r.map((x) => x.name)).toEqual(['A', 'C']);
  });
});

describe('docSpec', () => {
  it('normalizes junk safely', () => {
    const s = normalizeDocumentSpec({ blocks: [null, { type: 'table', rows: [['a', 'b', 'c']] }, { type: 'bogus' }, { text: 'loose' }] });
    expect(s.paper).toBe('long');
    expect(s.blocks[0].columns).toHaveLength(3);
    expect(s.blocks[1]).toEqual({ type: 'paragraph', text: 'loose' });
  });

  it('converts markdown into blocks', () => {
    const s = markdownToDocumentSpec('# My DLL\n\nIntro **text**\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |');
    expect(s.title).toBe('My DLL');
    expect(s.blocks.map((b) => b.type)).toEqual(['paragraph', 'bullets', 'table']);
    expect(s.blocks[2].rows).toEqual([['1', '2']]);
  });

  it('splits bold runs', () => {
    expect(parseInlineRuns('a **b** c')).toEqual([{ text: 'a ', bold: false }, { text: 'b', bold: true }, { text: ' c', bold: false }]);
  });
});
