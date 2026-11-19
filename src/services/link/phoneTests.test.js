import { describe, it, expect } from 'vitest';
import { sheetCode } from '../desk/bubble/layout.js';
import { reviewSheets } from '../desk/bubble/quiz.js';
import {
  matchTestByCode, newestFirst, testChip, testLine, recordTarget, recordName, keyChoices, testFromQuiz,
  splitByLrn, bubbleScored, reviewPhotoRows, photoScored, photosFolder, isOldDesk, isOffline, inBatches, photosToRecheck, mergeRows,
} from './phoneTests.js';

const T1 = { path: 'Lessons/Tests/Grade 7 - Rizal - Science/Quiz 3/KaTuro bubble quiz.json', folder: 'Lessons/Tests/Grade 7 - Rizal - Science/Quiz 3', title: 'Quiz 3', className: 'Grade 7 - Rizal - Science', setId: 'ABC234', items: 3, choices: 4, learners: 2, hasKey: true, recordPath: 'Records/Grade 7 - Rizal - Science.xlsx', column: 'ww3', columnLabel: 'Written Works 3', photos: 0, status: 'new', createdAt: '2026-11-10T00:00:00.000Z' };
const T2 = { ...T1, path: 'x/KaTuro bubble quiz.json', folder: 'x', title: 'Quiz 4', setId: 'XYZ789', hasKey: false, recordPath: null, column: null, columnLabel: null, createdAt: '2026-11-18T00:00:00.000Z' };
const LRN1 = '123456789012';
const learners = [{ n: 1, name: 'Ana Cruz', lrn: LRN1 }, { n: 2, name: 'Ben Reyes', lrn: '' }];

describe('finding the test of a bubble sheet', () => {
  it('matches the QR code to a test by its set id', () => {
    expect(matchTestByCode(sheetCode('XYZ789', 2), [T1, T2])).toEqual({ test: T2, number: 2 });
    expect(matchTestByCode({ setId: 'ABC234', number: 1 }, [T1, T2]).test).toBe(T1);
  });
  it('says when the sheet is from a test this KaTuroDesk does not have, or not a KaTuro sheet', () => {
    expect(matchTestByCode(sheetCode('QQQ222', 1), [T1])).toEqual({ unknown: true, setId: 'QQQ222' });
    expect(matchTestByCode('https://example.com', [T1])).toBeNull();
    expect(matchTestByCode(null, [T1])).toBeNull();
  });
  it('an old quiz without a set id yet never matches', () => {
    const old = testFromQuiz({ path: 'Bubble Quizzes/Q/KaTuro bubble quiz.json', title: 'Q', items: 5, learners: 3, hasKey: true });
    expect(old.setId).toBeNull();
    expect(old.folder).toBe('Bubble Quizzes/Q');
    expect(matchTestByCode(sheetCode('ABC234', 1), [old]).unknown).toBe(true);
    expect(testFromQuiz({ path: 'a/b.json', title: 'Q', items: 5 }, { setId: 'ABC234', choices: 5 })).toMatchObject({ setId: 'ABC234', choices: 5 });
  });
});

describe('smart defaults', () => {
  it('lists tests newest first', () => {
    expect(newestFirst([T1, T2]).map((t) => t.title)).toEqual(['Quiz 4', 'Quiz 3']);
  });
  it('shows what is known about the test', () => {
    expect(testChip(T1)).toBe('Quiz 3 · Grade 7 - Rizal - Science · key saved ✓');
    expect(testChip(T2)).toBe('Quiz 4 · Grade 7 - Rizal - Science · no answer key yet');
    expect(testChip(T2, true)).toContain('key saved ✓');
    expect(testLine({ ...T1, status: 'recorded' })).toBe('3 items · 2 learners · recorded ✓');
    expect(testLine({ ...T1, status: 'photos', photos: 1 })).toBe('3 items · 2 learners · 1 photo');
  });
  it('records into the test\'s own record and column when it has them', () => {
    expect(recordTarget(T1)).toEqual({ path: T1.recordPath, column: 'ww3', label: 'Written Works 3', name: 'Grade 7 - Rizal - Science' });
    expect(recordTarget(T2)).toBeNull();
    expect(recordName('Records/A.xlsm')).toBe('A');
  });
  it('starts the key question on the saved key when there is one', () => {
    expect(keyChoices(T1).options.map((o) => o.id)).toEqual(['saved', 'scan', 'type', 'none']);
    expect(keyChoices(T2).options.map((o) => o.id)).toEqual(['scan', 'type', 'none']);
  });
  it('photos go to the test folder', () => {
    expect(photosFolder(T1)).toBe('Lessons/Tests/Grade 7 - Rizal - Science/Quiz 3/Photos');
    expect(photosFolder({ path: 'a/b/KaTuro bubble quiz.json' })).toBe('a/b/Photos');
  });
  it('knows an old or unreachable KaTuroDesk', () => {
    expect(isOldDesk({ code: 'UNKNOWN_OP' })).toBe(true);
    expect(isOffline({ code: 'UNREACHABLE' })).toBe(true);
    expect(isOffline({ code: 'NOT_FOUND' })).toBe(false);
  });
});

describe('scores for the record', () => {
  it('only learners with an LRN can be recorded; the others are named', () => {
    expect(splitByLrn([{ name: 'Ana Cruz', lrn: LRN1, score: 3 }, { name: 'Ben Reyes', lrn: '', score: 2 }, { name: 'Cy', lrn: LRN1, score: null }]))
      .toEqual({ scores: [{ lrn: LRN1, score: 3 }], noLrn: ['Ben Reyes'] });
  });
  it('bubble sheets: scores once nothing is open', () => {
    const quiz = { setId: 'ABC234', items: 3, choices: 4, learners };
    const open = reviewSheets(quiz, ['A', 'B', 'C'], { 'Scan 001': { ok: true, number: 1, answers: { 1: 'A', 2: '?', 3: 'C' }, notes: {} } }, {});
    expect(bubbleScored(quiz, open)).toBeNull();
    const settled = reviewSheets(quiz, ['A', 'B', 'C'], { 'Scan 001': { ok: true, number: 1, answers: { 1: 'A', 2: '?', 3: 'C' }, notes: {} } }, { 'Scan 001': { answers: { 2: 'B' } } });
    expect(bubbleScored(quiz, settled)).toEqual([{ n: 1, name: 'Ana Cruz', lrn: LRN1, score: 3, photo: 'Scan 001' }]);
  });
});

describe('reviewing papers checked on KaTuroDesk', () => {
  const rows = [
    { photo: 'p1.jpg', n: 1, name: 'Ana Cruz', score: 2, items: 3, unclear: [3] },
    { photo: 'p2.jpg', n: null, name: null, score: 1, items: 3, unclear: [] },
    { photo: 'p3.jpg', n: 2, name: 'Ben Reyes', score: null, items: 3, unclear: [], note: 'blurry' },
  ];
  it('lists what is still open: unclear items, unknown learners, unread scores', () => {
    const r = reviewPhotoRows(rows, {}, learners);
    expect(r.rows.map((x) => x.issues)).toEqual([['item'], ['learner'], ['score']]);
    expect(r.open).toBe(3);
    expect(photoScored(learners, r)).toBeNull();
  });
  it('settled items add to the score; a typed score settles a paper', () => {
    const r = reviewPhotoRows(rows, { 'p1.jpg': { items: { 3: true } }, 'p2.jpg': { skip: true }, 'p3.jpg': { score: 2 } }, learners);
    expect(r.open).toBe(0);
    expect(r.rows[0].score).toBe(3);
    expect(photoScored(learners, r)).toEqual([{ n: 1, name: 'Ana Cruz', lrn: LRN1, score: 3 }, { n: 2, name: 'Ben Reyes', lrn: '', score: 2 }]);
    expect(splitByLrn(photoScored(learners, r)).noLrn).toEqual(['Ben Reyes']);
  });
  it('a paper with no score read keeps its score box while the score is typed', () => {
    const r = reviewPhotoRows(rows, { 'p3.jpg': { score: 1 } }, learners);
    expect(r.rows[2]).toMatchObject({ unread: true, score: 1, issues: [] });
    expect(r.rows[0].unread).toBe(false);
  });
  it('checks again only the papers not read (or never answered), and keeps the rest', () => {
    const sentPhotos = ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg'];
    expect(photosToRecheck(sentPhotos, rows)).toEqual(['p3.jpg', 'p4.jpg']);
    const merged = mergeRows(rows, [{ photo: 'p3.jpg', n: 2, score: 2, items: 3, unclear: [] }, { photo: 'p4.jpg', n: null, score: 1, items: 3, unclear: [] }], ['p3.jpg', 'p4.jpg']);
    expect(merged.map((r) => [r.photo, r.score])).toEqual([['p1.jpg', 2], ['p2.jpg', 1], ['p3.jpg', 2], ['p4.jpg', 1]]);
    expect(photosToRecheck(sentPhotos, merged)).toEqual([]);
  });
  it('photos are checked at most 60 at a time', () => {
    const list = Array.from({ length: 125 }, (_, i) => i);
    expect(inBatches(list).map((b) => b.length)).toEqual([60, 60, 5]);
    expect(inBatches([])).toEqual([]);
  });
  it('a wrong unclear item adds nothing; two papers for one learner must be settled', () => {
    const r = reviewPhotoRows(rows, { 'p1.jpg': { items: { 3: false } }, 'p2.jpg': { learner: 1 }, 'p3.jpg': { skip: true } }, learners);
    expect(r.rows[0].score).toBe(2);
    expect(r.rows[0].issues).toEqual(['duplicate']);
    expect(r.rows[1].issues).toEqual(['duplicate']);
    expect(r.rows[1].name).toBe('Ana Cruz');
  });
});
