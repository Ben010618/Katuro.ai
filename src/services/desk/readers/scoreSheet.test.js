import { describe, it, expect } from 'vitest';
import {
  detectScoreTable,
  detectAttendance,
  detectInSheets,
  toResponseMatrix,
  toTotals,
  toComponentLearners,
} from './scoreSheet.js';
import { analyzeItems, analyzeTotals, computeQuarterlyGrade, findConsecutiveAbsences } from '../depedGrading.js';

const items = (n) => Array.from({ length: n }, (_, i) => i + 1);

describe('detectScoreTable — items', () => {
  it('handles a messy quiz sheet with title rows, dividers and an HPS row', () => {
    const rows = [
      ['Republic of the Philippines'],
      ['Department of Education'],
      ['SUMMATIVE TEST NO. 1 — Science 7 — Grade 7 Rizal'],
      [],
      ['No.', 'Name of Learners', ...items(10), 'Total'],
      [null, 'HPS', ...Array(10).fill(1), 10],
      [null, 'MALE'],
      [1, 'Dela Cruz, Juan P.', 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 8],
      [2, 'Reyes, Mark', 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 5],
      [],
      [null, 'FEMALE'],
      [3, 'Santos, Maria', 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 9],
      [4, 'Garcia, Ana', 0, 1, null, 1, 0, 1, 1, 0, 1, 1, 6],
      [null, 'Total', 3, 3, 1, 4, 2, 4, 2, 2, 4, 3],
      [],
      [null, null, null, 'Prepared by:'],
      [null, 'Rosa Bautista'],
      [null, 'Teacher III'],
    ];
    const t = detectScoreTable(rows);
    expect(t.mode).toBe('items');
    expect(t.headerRowIndex).toBe(4);
    expect(t.nameCol).toBe(1);
    expect(t.hpsRowIndex).toBe(5);
    expect(t.learners.map((l) => [l.name, l.gender])).toEqual([
      ['Dela Cruz, Juan P.', 'M'],
      ['Reyes, Mark', 'M'],
      ['Santos, Maria', 'F'],
      ['Garcia, Ana', 'F'],
    ]);
    expect(t.itemCols).toHaveLength(10);
    expect(t.itemCols[0]).toEqual({ col: 2, label: '1' });
    expect(t.responses[0]).toEqual([1, 1, 0, 1, 1, 1, 0, 1, 1, 1]);
    expect(t.responses[3][2]).toBeNull();

    const matrix = toResponseMatrix(t);
    expect(matrix).toHaveLength(4);
    const analysis = analyzeItems(matrix);
    expect(analysis.itemCount).toBe(10);
    expect(analysis.learners[0].score).toBe(8);
    expect(toTotals(t)).toEqual({
      learners: [
        { name: 'Dela Cruz, Juan P.', score: 8 },
        { name: 'Reyes, Mark', score: 5 },
        { name: 'Santos, Maria', score: 9 },
        { name: 'Garcia, Ana', score: 6 },
      ],
      totalItems: 10,
    });
  });

  it('maps check marks and words to 1/0', () => {
    const rows = [
      ['Learner', 'Q1', 'Q2', 'Q3', 'Q4'],
      ['Ana Reyes', '✓', 'x', '✔', ''],
      ['Ben Cruz', 'correct', 'wrong', '/', '✗'],
    ];
    const t = detectScoreTable(rows);
    expect(t.mode).toBe('items');
    expect(t.responses).toEqual([[1, 0, 1, null], [1, 0, 1, 0]]);
  });

  it('scores letter answers against a KEY row', () => {
    const rows = [
      ['Item Analysis — Math 8'],
      ['Student Name', 'Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'],
      ['Answer Key', 'A', 'c', 'B', 'D', 'A'],
      ['Lopez, Carlo', 'A', 'C', 'B', 'A', 'a'],
      ['Mendoza, Lea', 'B', 'C', 'B', 'D', null],
      ['Torres, Jun', 'A', 'D', 'C', 'D', 'E'],
    ];
    const t = detectScoreTable(rows);
    expect(t.mode).toBe('items');
    expect(t.answerKey).toEqual(['A', 'C', 'B', 'D', 'A']);
    expect(t.responses).toEqual([
      [1, 1, 1, 0, 1],
      [0, 1, 1, 1, null],
      [1, 0, 0, 1, 0],
    ]);
  });

  it('flags letter answers without a key', () => {
    const rows = [
      ['Name', 1, 2, 3],
      ['Lopez, Carlo', 'A', 'B', 'D'],
      ['Mendoza, Lea', 'B', 'E', 'A'],
    ];
    const t = detectScoreTable(rows);
    expect(t.mode).toBe('items');
    expect(t.needsAnswerKey).toBe(true);
    expect(t.notes.join(' ')).toMatch(/answer key/i);
  });
});

describe('detectScoreTable — totals', () => {
  it('reads a totals-only sheet with "Score (30)"', () => {
    const rows = [
      ['Quarter 1 Long Quiz'],
      [],
      ['Learner', 'Score (30)'],
      ['Dela Cruz, Juan', 25],
      ['Santos, Maria', 18],
      ['Reyes, Ana', null],
      ['Average', 21.5],
    ];
    const t = detectScoreTable(rows);
    expect(t.mode).toBe('totals');
    expect(t.totalCol).toBe(1);
    expect(t.totalItems).toBe(30);
    expect(t.scores).toEqual([25, 18, null]);
    const totals = toTotals(t);
    expect(totals.learners).toHaveLength(2);
    expect(analyzeTotals(totals.learners, totals.totalItems).mean).toBe(21.5);
  });

  it('joins Last Name / First Name columns and reads totalItems from the HPS row', () => {
    const rows = [
      ['Last Name', 'First Name', 'Raw Score'],
      ['Highest Possible Score', null, 40],
      ['Dela Cruz', 'Juan', 33],
      ['Santos', 'Maria', 38],
    ];
    const t = detectScoreTable(rows);
    expect(t.mode).toBe('totals');
    expect(t.learners.map((l) => l.name)).toEqual(['Dela Cruz, Juan', 'Santos, Maria']);
    expect(t.totalItems).toBe(40);
  });

  it('finds learners without a name header', () => {
    const rows = [
      ['Grade 9 - Mabini'],
      ['Learner list', 'Points'],
      ['Juan Dela Cruz', 12],
      ['Maria Santos', 15],
      ['Ana Reyes', 9],
    ];
    const t = detectScoreTable(rows);
    expect(t.mode).toBe('totals');
    expect(t.learners).toHaveLength(3);
    expect(t.totalItems).toBe(15);
  });
});

describe('detectScoreTable — components (e-Class Record)', () => {
  it('reads group-label row + numbered sub-columns + HPS row', () => {
    const rows = [
      ['REGION X', null, 'DIVISION OF CITY SCHOOLS'],
      ['SCHOOL NAME', 'Sample NHS'],
      ['FIRST QUARTER', null, 'GRADE & SECTION: 7 - Rizal'],
      ["LEARNERS' NAMES", 'WRITTEN WORKS (40%)', null, null, null, null, 'PERFORMANCE TASKS (40%)', null, null, null, null, 'QUARTERLY ASSESSMENT (20%)', null, null, 'Initial Grade', 'Quarterly Grade'],
      [null, 1, 2, 3, 'Total', 'WS', 1, 2, 3, 'Total', 'WS', 1, 'PS', 'WS'],
      ['HIGHEST POSSIBLE SCORE', 10, 20, 15, 45, '40%', 20, 30, 50, 100, '40%', 50, 100, '20%'],
      ['MALE'],
      ['Dela Cruz, Juan', 8, 15, 12, 35, null, 18, 25, 40, 83, null, 40, 80, null, 85, 88],
      ['Reyes, Mark', 9, null, 10, 19, null, 15, 20, 30, 65, null, 35],
      ['FEMALE'],
      ['Santos, Maria', 10, 19, 14, 43, null, 20, 28, 48, 96, null, 47],
    ];
    const t = detectScoreTable(rows);
    expect(t.mode).toBe('components');
    expect(t.hpsRowIndex).toBe(5);
    expect(t.components.ww).toEqual({ cols: [1, 2, 3], hps: [10, 20, 15] });
    expect(t.components.pt).toEqual({ cols: [6, 7, 8], hps: [20, 30, 50] });
    expect(t.components.qa).toEqual({ cols: [11], hps: [50] });
    expect(t.learners.map((l) => l.gender)).toEqual(['M', 'M', 'F']);
    expect(t.componentScores[1]).toEqual({ ww: [9, null, 10], pt: [15, 20, 30], qa: [35] });

    const { learners, hps } = toComponentLearners(t);
    expect(learners[0].ww.scores).toEqual([8, 15, 12]);
    const grade = computeQuarterlyGrade({
      ww: { scores: learners[2].ww.scores, hps: hps.ww },
      pt: { scores: learners[2].pt.scores, hps: hps.pt },
      qa: { scores: learners[2].qa.scores, hps: hps.qa },
    });
    expect(grade.components.ww.total).toBe(43);
  });

  it('reads WW1/PT1/QA style headers in a single row', () => {
    const rows = [
      ['Name', 'WW1', 'WW2', 'PT1', 'PT2', 'QA', 'Quarterly Grade'],
      ['HPS', 10, 10, 20, 20, 40],
      ['Ana Reyes', 8, 9, 18, 17, 30, 88],
      ['Ben Cruz', 6, 7, 15, 14, 25, 80],
    ];
    const t = detectScoreTable(rows);
    expect(t.mode).toBe('components');
    expect(t.components.ww.cols).toEqual([1, 2]);
    expect(t.components.qa).toEqual({ cols: [5], hps: [40] });
  });
});

describe('detectAttendance', () => {
  it('reads an SF2-like sheet (x = absent)', () => {
    const rows = [
      ['School Form 2 (SF2) Daily Attendance Report of Learners'],
      ['Name of School', 'Sample NHS', null, 'Month', 'June'],
      ["LEARNER'S NAME (Last Name, First Name, Middle Name)", 3, 4, 5, 6, 7, 10, 11, 'ABSENT', 'TARDY'],
      [null, 'M', 'T', 'W', 'TH', 'F', 'M', 'T'],
      ['Dela Cruz, Juan P.', null, 'x', 'x', 'x', null, null, null, 3, 0],
      ['Reyes, Mark', null, null, null, null, null, null, null, 0, 0],
      ['<=== MALE | TOTAL Per Day ===>', 2, 1, 1, 1, 2, 2],
      ['Santos, Maria', 'x', null, null, null, null, 'x', null, 2, 0],
    ];
    const a = detectAttendance(rows);
    expect(a.headerRowIndex).toBe(2);
    expect(a.nameCol).toBe(0);
    expect(a.dayCols).toHaveLength(7);
    expect(a.dayCols[0]).toEqual({ col: 1, label: '3' });
    expect(a.learners.map((l) => l.name)).toEqual(['Dela Cruz, Juan P.', 'Reyes, Mark', 'Santos, Maria']);
    expect(a.learners[0].days).toEqual(['P', 'A', 'A', 'A', 'P', 'P', '']);
    expect(a.learners[2].days).toEqual(['A', 'P', 'P', 'P', 'P', 'A', '']);
    const flagged = findConsecutiveAbsences(a.learners, 3);
    expect(flagged).toEqual([{ name: 'Dela Cruz, Juan P.', longestConsecutive: 3, totalAbsences: 3 }]);
    // Not mistaken for a quiz.
    expect(detectScoreTable(rows)?.mode).not.toBe('items');
  });

  it('does not treat a 1/0 quiz grid as attendance', () => {
    const rows = [
      ['Name', ...items(6)],
      ['Ana Reyes', 1, 0, 1, 1, 0, 1],
      ['Ben Cruz', 0, 0, 1, 1, 1, 1],
    ];
    expect(detectAttendance(rows)).toBeNull();
  });
});

describe('non-score data', () => {
  it('returns null for a random table', () => {
    const rows = [
      ['Item', 'Quantity', 'Unit Cost'],
      ['Bond paper', 10, 250],
      ['Ballpen', 50, 8],
      ['Folder', 30, 5],
    ];
    expect(detectScoreTable(rows)).toBeNull();
    expect(detectAttendance(rows)).toBeNull();
    expect(detectScoreTable([])).toBeNull();
    expect(detectScoreTable(null)).toBeNull();
  });

  it('detectInSheets reports only sheets with findings', () => {
    const found = detectInSheets([
      { name: 'Inventory', rows: [['Item', 'Qty'], ['Paper', 1], ['Pen', 2]] },
      { name: 'Quiz', rows: [['Learner', 'Score'], ['Ana Reyes', 5], ['Ben Cruz', 7]] },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].sheetName).toBe('Quiz');
    expect(found[0].scoreTable.mode).toBe('totals');
    expect(found[0].attendance).toBeUndefined();
  });
});
