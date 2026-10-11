import { describe, it, expect } from 'vitest';
import { newQuiz, parseQuiz, quizFolder, readKey, sheetFromRead, reviewSheets, finalScores, resultsSpec } from './quiz';

const learners = [
  { name: 'Learner One', lrn: '100000000001' },
  { name: 'Learner Two', lrn: '' },
  { name: 'Learner Three', lrn: '100000000003', include: false },
  { name: 'Learner Four', lrn: '100000000004' },
];
const setup = { title: 'Science Quiz 2', section: 'Grade 7 - Rizal', items: 5, choices: 4, paper: 'a4', perPage: 4, blanks: 2, learners };
const make = () => newQuiz(setup, { now: new Date('2026-10-12T08:00:00Z'), random: () => 0.1 }).quiz;
const ans = (s) => Object.fromEntries([...s].map((c, i) => [i + 1, c === '_' ? '' : c]));

describe('bubble quiz', () => {
  it('a new quiz keeps only the chosen learners, numbered in list order, and saves what the reader needs', () => {
    const q = make();
    expect(q.learners).toEqual([{ n: 1, name: 'Learner One', lrn: '100000000001' }, { n: 2, name: 'Learner Two', lrn: '' }, { n: 3, name: 'Learner Four', lrn: '100000000004' }]);
    expect(q).toMatchObject({ kind: 'katuro-bubble-quiz', layout: 1, items: 5, choices: 4, paper: 'a4', perPage: 4, blanks: 2, answerKey: null });
    expect(q.setId).toMatch(/^[A-Z2-9]{6}$/);
    expect(quizFolder(q)).toBe('Bubble Quizzes/Science Quiz 2 - Grade 7 - Rizal');
    expect(quizFolder({ title: 'A/B: test?', section: '' })).toBe('Bubble Quizzes/A-B- test-');
    expect(parseQuiz(JSON.stringify(q))).toEqual(q);
    expect(parseQuiz('{"kind":"other"}')).toBeNull();
    expect(parseQuiz('not json')).toBeNull();
    expect(parseQuiz(JSON.stringify({ ...q, layout: 2 }))).toBeNull();
  });

  it('problems are explained, nothing is made', () => {
    expect(newQuiz({ ...setup, title: ' ' }).problems).toContain('Type the quiz title.');
    expect(newQuiz({ ...setup, learners: [], blanks: 0 }).problems).toContain('Choose at least one learner, or add blank sheets.');
    expect(newQuiz({ ...setup, items: 60 }).problems[0]).toMatch(/do not fit/);
    expect(newQuiz({ ...setup, learners: [{ name: 'A', lrn: '123' }] }).problems[0]).toMatch(/12 digits/);
    expect(newQuiz({ ...setup, learners: [{ name: 'A', lrn: '100000000001' }, { name: 'B', lrn: '100000000001' }] }).problems[0]).toMatch(/given to two learners/);
  });

  it('the answer key must match the quiz', () => {
    const q = make();
    expect(readKey('ABCDA', q)).toEqual({ key: ['A', 'B', 'C', 'D', 'A'] });
    expect(readKey('1. A 2. B 3. C 4. D 5. A', q).key).toHaveLength(5);
    expect(readKey('ABCD', q).error).toMatch(/4 answers, but the quiz has 5/);
    expect(readKey('ABCDE', q).error).toMatch(/Item 5 in the key is not one of A, B, C, D/);
    expect(readKey('', q).error).toMatch(/answer key/);
  });

  it('photos: learner from the QR code, unclear items, blank sheets, another quiz, unreadable photos and duplicates are all left for the teacher', () => {
    const q = make();
    const key = ['A', 'B', 'C', 'D', 'A'];
    const code = (n) => `KT1:${q.setId}:${String(n).padStart(3, '0')}`;
    const sheets = {
      'Photos/IMG_1.jpg': sheetFromRead(q, { ok: true, code: code(1), answers: ans('ABCDA'), notes: {} }),
      'Photos/IMG_2.jpg': sheetFromRead(q, { ok: true, code: code(2), answers: ans('AB?D_'), notes: { 3: 'two marks' } }),
      'Photos/IMG_3.jpg': sheetFromRead(q, { ok: true, code: code(0), answers: ans('BBCDA'), notes: {} }),
      'Photos/IMG_4.jpg': sheetFromRead(q, { ok: true, code: 'KT1:ZZZZZZ:001', answers: ans('ABCDA'), notes: {} }),
      'Photos/IMG_5.jpg': sheetFromRead(q, { ok: false, error: 'corners' }),
      'Photos/IMG_10.jpg': sheetFromRead(q, { ok: true, code: code(1), answers: ans('ABCDD'), notes: {} }),
    };
    let r = reviewSheets(q, key, sheets, {});
    const issues = Object.fromEntries(r.rows.map((x) => [x.photo.split('/').pop(), x.issues.map((i) => (i.kind === 'item' ? `item${i.item}` : i.kind))]));
    expect(issues).toEqual({ 'IMG_1.jpg': ['duplicate'], 'IMG_2.jpg': ['item3'], 'IMG_3.jpg': ['learner'], 'IMG_4.jpg': ['learner'], 'IMG_5.jpg': ['unreadable'], 'IMG_10.jpg': ['duplicate'] });
    expect(r.rows.map((x) => x.photo)).toEqual(['Photos/IMG_1.jpg', 'Photos/IMG_2.jpg', 'Photos/IMG_3.jpg', 'Photos/IMG_4.jpg', 'Photos/IMG_5.jpg', 'Photos/IMG_10.jpg']);
    expect(finalScores(q, r)).toBeNull();

    // The teacher settles each one.
    const decisions = {
      'Photos/IMG_10.jpg': { skip: true },
      'Photos/IMG_2.jpg': { answers: { 3: 'C' } },
      'Photos/IMG_3.jpg': { learner: 3 },
      'Photos/IMG_4.jpg': { skip: true },
      'Photos/IMG_5.jpg': { skip: true },
    };
    r = reviewSheets(q, key, sheets, decisions);
    expect(r.open).toBe(0);
    expect(finalScores(q, r).map((x) => [x.n, x.score])).toEqual([[1, 5], [2, 4], [3, 4]]);
    expect(r.missing).toEqual([]);

    // A learner with no sheet is listed as missing and gets no score (never a zero).
    r = reviewSheets(q, key, sheets, { ...decisions, 'Photos/IMG_3.jpg': { skip: true } });
    expect(r.missing.map((l) => l.n)).toEqual([3]);
    expect(finalScores(q, r).find((x) => x.n === 3).score).toBeNull();

    const spec = resultsSpec(q, key, r);
    expect(spec.sheets[0].rows).toEqual([
      [1, 'Learner One', '100000000001', 5, 5, 100, '', 'IMG_1.jpg'],
      [2, 'Learner Two', '', 4, 5, 80, '', 'IMG_2.jpg'],
      [3, 'Learner Four', '100000000004', null, 5, null, 'no sheet', ''],
    ]);
    expect(spec.sheets[1].rows).toEqual([['Learner One', 1, 1, 1, 1, 1, 5], ['Learner Two', 1, 1, 1, 1, 0, 4]]);
    expect(spec.sheets[2].rows[4]).toEqual([5, 'A', 1, 50]);
  });

  it('without the answer key nothing is scored yet', () => {
    const q = make();
    const sheets = { 'Photos/a.jpg': sheetFromRead(q, { ok: true, code: `KT1:${q.setId}:001`, answers: ans('ABCDA') }) };
    const r = reviewSheets(q, null, sheets, {});
    expect(r.rows[0].score).toBeUndefined();
  });
});
