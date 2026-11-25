import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { findNameColumn, writeScoresIntoWorkbook } from './fillTemplates.js';
import { buildClassRecordWorkbook } from './xlsxWriters.js';
import { WEIGHT_PRESETS } from '../depedGrading.js';

const book = (rows) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
};

describe('the learners\' name column of a sheet', () => {
  it('KaTuro\'s own E-Class Record: "LEARNERS\' NAMES", not "SCHOOL NAME:"', async () => {
    const bytes = await buildClassRecordWorkbook({ meta: { subject: 'Science', school: 'Rizal NHS' }, weights: WEIGHT_PRESETS.scienceMath, hps: { ww: Array(10).fill(null), pt: Array(10).fill(null), qa: [null] }, learners: [{ name: 'Dela Cruz, Juan P.', lrn: '136512340001', gender: 'M' }, { name: 'Santos, Maria L.', lrn: '136512340003', gender: 'F' }], withLrn: true });
    expect(await findNameColumn(bytes)).toBe('C');
  });

  it('"Name" next to "Student No.": the names, not the numbers', async () => {
    expect(await findNameColumn(book([['No.', 'Name', 'Student No.', 'Score'], [1, 'Dela Cruz, Juan', '2026-001', 18], [2, 'Santos, Maria', '2026-002', 15]]))).toBe('B');
  });

  it('"NAME" next to "Learner Reference No." (LRN): the names', async () => {
    expect(await findNameColumn(book([['NAME', 'Learner Reference No.', 'WW1'], ['Dela Cruz, Juan', '136512340001', 8], ['Santos, Maria', '136512340003', 9]]))).toBe('A');
  });

  it('a title row ("List of Learners") above the real heading', async () => {
    expect(await findNameColumn(book([['List of Learners — Grade 7 Rizal'], [], ['LRN', "Learner's Name", 'Sex'], ['136512340001', 'Dela Cruz, Juan P.', 'M'], ['136512340003', 'Santos, Maria L.', 'F']]))).toBe('B');
  });

  it('no names heading at all: the column with the most names; no names → null', async () => {
    expect(await findNameColumn(book([['#', 'Pupil', 'Q1'], [1, 'Dela Cruz, Juan', 80], [2, 'Reyes, Ana', 90]]))).toBe('B');
    expect(await findNameColumn(book([['A', 'B'], [1, 2], [3, 4]]))).toBeNull();
  });

  it('scores really land next to the names it found', async () => {
    const bytes = book([['No.', 'Name', 'Student No.', 'Score'], [1, 'Dela Cruz, Juan', '2026-001', null], [2, 'Santos, Maria', '2026-002', null]]);
    const col = await findNameColumn(bytes);
    const out = await writeScoresIntoWorkbook(bytes, { nameColumn: col, targetColumn: 'D', scores: [{ name: 'Juan Dela Cruz', score: 18 }, { name: 'Maria Santos', score: 15 }] });
    expect(out.written.map((w) => [w.matchedName, w.score])).toEqual([['Dela Cruz, Juan', 18], ['Santos, Maria', 15]]);
    expect(out.unmatched).toEqual([]);
  });
});
