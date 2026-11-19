import { describe, it, expect } from 'vitest';
import { newQuiz, quizFolder, isTestFolderPath, claimQuizFolder, writeQuizFolder, releaseQuizFolder, parseQuiz, QUIZ_FILE, CHECK_FILE } from './quiz';
import { listTests, testStatus, testSummary, validateKey, withKey, photosOf, classNameOf, loadTest, markTestRecorded, mergeCheck, testClassRecord } from './tests';

const learners = [{ name: 'Dela Cruz, Juan P.', lrn: '136512340001' }, { name: 'Santos, Maria L.', lrn: '136512340003' }];
const base = { title: 'Mixtures Quiz', items: 5, choices: 4, paper: 'a4', perPage: 4, learners };
const at = (iso) => ({ now: new Date(iso), random: () => 0.3 });

describe('Tests: folders, manifest, status and listing', () => {
  it('a test for a class goes in Lessons/Tests/<class>/<title> in the KaTuro folder; else the old Bubble Quizzes place', () => {
    const q = newQuiz({ ...base, className: 'Grade 7 - Rizal - Science', recordPath: 'Records/Grade 7 - Rizal - Science.xlsx', column: 'ww3', columnLabel: 'Written Work 3' }, at('2026-11-18T08:00:00Z')).quiz;
    expect(q).toMatchObject({ className: 'Grade 7 - Rizal - Science', recordPath: 'Records/Grade 7 - Rizal - Science.xlsx', column: 'ww3', columnLabel: 'Written Work 3' });
    expect(quizFolder(q, { home: true })).toBe('Lessons/Tests/Grade 7 - Rizal - Science/Mixtures Quiz');
    expect(quizFolder({ ...q, section: 'G7' }, { home: false })).toBe('Bubble Quizzes/Mixtures Quiz - G7');
    // No class chosen: the old place, even in the KaTuro folder.
    const plain = newQuiz({ ...base, section: 'Rizal' }, at('2026-11-18T08:00:00Z')).quiz;
    expect(plain.className).toBeUndefined();
    expect(plain.recordPath).toBeUndefined();
    expect(quizFolder(plain, { home: true })).toBe('Bubble Quizzes/Mixtures Quiz - Rizal');
    expect(isTestFolderPath('Lessons/Tests/G7/Q/Q - Test.docx')).toBe(true);
    expect(isTestFolderPath('Bubble Quizzes/Q/x.docx')).toBe(true);
    expect(isTestFolderPath('Records/Grade 7.xlsx')).toBe(false);
  });

  it('status: recorded, checked, photos in, new', () => {
    const quiz = { items: 5 };
    expect(testStatus({ quiz, check: null, photos: 0 })).toBe('new');
    expect(testStatus({ quiz, check: { sheets: {} }, photos: 2 })).toBe('photos');
    expect(testStatus({ quiz, check: { sheets: { 'a.jpg': { ok: true } } }, photos: 2 })).toBe('checked');
    expect(testStatus({ quiz: { ...quiz, recordedAt: '2026-11-19T00:00:00Z' }, check: { sheets: { 'a.jpg': {} } }, photos: 2 })).toBe('recorded');
  });

  it('lists every test (new and old places) newest first, with key, photos and class', async () => {
    const t1 = newQuiz({ ...base, className: 'Grade 7 - Rizal - Science', recordPath: 'Records/Grade 7 - Rizal - Science.xlsx', column: 'ww1', columnLabel: 'Written Work 1' }, at('2026-11-18T08:00:00Z')).quiz;
    const old = newQuiz({ ...base, title: 'Old quiz', section: 'Rizal' }, at('2026-10-01T08:00:00Z')).quiz;
    const f1 = 'Lessons/Tests/Grade 7 - Rizal - Science/Mixtures Quiz';
    const f2 = 'Bubble Quizzes/Old quiz - Rizal';
    const files = {
      [`${f1}/${QUIZ_FILE}`]: JSON.stringify(t1),
      [`${f1}/${CHECK_FILE}`]: JSON.stringify({ answerKey: ['A', 'B', 'C', 'D', 'A'] }),
      [`${f1}/Photos/IMG_1.jpg`]: 'x',
      [`${f1}/Photos/IMG_2.HEIC`]: 'x',
      [`${f1}/Photos/About this folder.txt`]: 'x',
      [`${f2}/${QUIZ_FILE}`]: JSON.stringify(old),
      [`${f2}/${CHECK_FILE}`]: JSON.stringify({ answerKey: ['A'], sheets: { [`${f2}/Photos/a.jpg`]: { ok: true } } }),
      [`${f2}/Photos/a.jpg`]: 'x',
      'Lessons/Broken/KaTuro bubble quiz.json': 'not json',
    };
    const list = await listTests({ paths: Object.keys(files), readText: async (p) => files[p] });
    expect(list.map((x) => x.test.title)).toEqual(['Mixtures Quiz', 'Old quiz']);
    expect(list[0].test).toEqual({
      path: `${f1}/${QUIZ_FILE}`, folder: f1, title: 'Mixtures Quiz', className: 'Grade 7 - Rizal - Science', setId: t1.setId, items: 5, choices: 4,
      learners: 2, hasKey: true, recordPath: 'Records/Grade 7 - Rizal - Science.xlsx', column: 'ww1', columnLabel: 'Written Work 1', photos: 2, status: 'photos', createdAt: '2026-11-18T08:00:00.000Z',
    });
    // An old quiz: its section is its class; a key of the wrong length is no key.
    expect(list[1].test).toMatchObject({ className: 'Rizal', hasKey: false, recordPath: null, column: null, photos: 1, status: 'checked' });
    expect(photosOf(f1, Object.keys(files))).toHaveLength(2);
    expect(classNameOf({ recordPath: 'Records/Grade 8 - Luna - Math.xlsx' })).toBe('Grade 8 - Luna - Math');
    expect(testSummary({ path: `${f1}/${QUIZ_FILE}`, quiz: t1 }).status).toBe('new');
  });

  it('a key from the phone is checked against the test and saved with the reads kept', () => {
    const quiz = { items: 3, choices: 4 };
    expect(validateKey(quiz, ['a', 'C', ' d '])).toEqual({ key: ['A', 'C', 'D'] });
    expect(validateKey(quiz, ['A', 'B']).error).toMatch(/2 answers, but the quiz has 3/);
    expect(validateKey(quiz, ['A', 'E', 'X']).error).toMatch(/Items 2, 3 in the key are not one of A, B, C, D/);
    expect(validateKey({ items: 1, choices: 5 }, ['E'])).toEqual({ key: ['E'] });
    expect(validateKey(quiz, 'ACD').error).toMatch(/list of letters/);
    expect(withKey({ sheets: { a: 1 }, decisions: { a: { skip: true } }, answerKey: ['B'] }, ['A', 'C', 'D'])).toEqual({ sheets: { a: 1 }, decisions: { a: { skip: true } }, answerKey: ['A', 'C', 'D'], keyText: 'ACD' });
    expect(withKey(null, ['A'])).toEqual({ sheets: {}, decisions: {}, answerKey: ['A'], keyText: 'A' });
  });

  it('loadTest reads one test; markTestRecorded sets recordedAt and keeps the rest', async () => {
    const quiz = newQuiz({ ...base, className: 'G7', recordPath: 'Records/G7.xlsx', column: 'ww1', columnLabel: 'Written Work 1' }, at('2026-11-18T08:00:00Z')).quiz;
    const files = { 'T/KaTuro bubble quiz.json': JSON.stringify({ ...quiz, testPaper: 'T/T - Test.docx' }), 'T/KaTuro check.json': JSON.stringify({ answerKey: ['A', 'B', 'C', 'D', 'A'] }) };
    const readText = async (p) => { if (!(p in files)) throw new Error('missing'); return files[p]; };
    const t = await loadTest({ path: 'T/KaTuro bubble quiz.json', readText });
    expect(t.answerKey).toEqual(['A', 'B', 'C', 'D', 'A']);
    expect(t.raw.testPaper).toBe('T/T - Test.docx');
    await expect(loadTest({ path: 'T/other.json', readText })).rejects.toMatchObject({ code: 'INVALID' });
    await expect(loadTest({ path: 'X/KaTuro bubble quiz.json', readText })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await markTestRecorded({ path: 'T/KaTuro bubble quiz.json', readText, write: async (p, text) => { files[p] = text; }, now: new Date('2026-11-19T01:00:00Z') });
    const saved = JSON.parse(files['T/KaTuro bubble quiz.json']);
    expect(saved).toMatchObject({ recordedAt: '2026-11-19T01:00:00.000Z', testPaper: 'T/T - Test.docx', setId: quiz.setId });
  });

  it("the Desk panel's save keeps what the phone saved: a newer key, photos read, decisions", () => {
    const own = { answerKey: ['A', 'B'], keyText: 'AB', sheets: { a: { ok: true } }, decisions: { a: { skip: true } } };
    // The phone saved a new key after the panel read the file: the phone's key stays.
    expect(mergeCheck(own, { answerKey: ['C', 'D'], keyText: 'CD', sheets: { b: { ok: true } }, decisions: {} }, ['A', 'B'])).toEqual({ answerKey: ['C', 'D'], keyText: 'CD', sheets: { b: { ok: true }, a: { ok: true } }, decisions: { a: { skip: true } } });
    // The panel's own new key (the disk still has the one it read) is saved.
    expect(mergeCheck({ ...own, answerKey: ['B', 'B'], keyText: 'BB' }, { answerKey: ['A', 'B'], keyText: 'AB' }, ['A', 'B']).answerKey).toEqual(['B', 'B']);
    // A key saved by the phone where the panel had none.
    expect(mergeCheck({ answerKey: null, keyText: '', sheets: {}, decisions: {} }, { answerKey: ['A'], keyText: 'A' }, null).answerKey).toEqual(['A']);
    expect(mergeCheck(own, null, null)).toBe(own);
  });

  it('bubble sheets from a class record in the KaTuro folder are a Test of that class', () => {
    expect(testClassRecord('Records/Grade 7 - Rizal - Science.xlsx', { home: true })).toBe('Records/Grade 7 - Rizal - Science.xlsx');
    expect(testClassRecord('Records/Grade 7 - Rizal - Science.xlsx', { home: false })).toBeNull();
    expect(testClassRecord('Records/Attendance/Grade 7.xlsx', { home: true })).toBeNull();
    expect(testClassRecord('Records/KaTuro Outputs/2026-11-01/x.xlsx', { home: true })).toBeNull();
    expect(testClassRecord('Class List.xlsx', { home: true })).toBeNull();
  });

  it('two quizzes made at once never share a folder; the manifest never overwrites another', async () => {
    const disk = {};
    const exists = async (p) => p in disk;
    const write = async (p, content, mime, { overwrite = true } = {}) => {
      let path = p;
      for (let i = 2; !overwrite && path in disk; i += 1) path = p.replace(/(\.[^.]+)$/, ` (${i})$1`);
      disk[path] = content;
      return { path };
    };
    const quiz = newQuiz({ ...base, className: 'G7 - A - Sci' }, at('2026-11-18T08:00:00Z')).quiz;
    const [a, b] = await Promise.all([claimQuizFolder(quiz, { home: true, exists }), claimQuizFolder(quiz, { home: true, exists })]);
    expect([a, b]).toEqual(['Lessons/Tests/G7 - A - Sci/Mixtures Quiz', 'Lessons/Tests/G7 - A - Sci/Mixtures Quiz (2)']);
    const made = await writeQuizFolder({ quiz, folder: a, write, extra: { testPaper: 'x.docx' }, key: ['A', 'B', 'C', 'D', 'A'] });
    expect(parseQuiz(disk[`${a}/${QUIZ_FILE}`])).toMatchObject({ pdfPath: `${a}/Mixtures Quiz - Bubble Sheets.pdf`, testPaper: 'x.docx' });
    expect(made.quiz.pdfPath).toBe(`${a}/Mixtures Quiz - Bubble Sheets.pdf`);
    expect(JSON.parse(disk[`${a}/${CHECK_FILE}`])).toMatchObject({ answerKey: ['A', 'B', 'C', 'D', 'A'], keyText: 'ABCDA' });
    expect(`${a}/Photos/About this folder.txt` in disk).toBe(true);
    // Folder a is on the disk now, b is still held: the next one is (3).
    expect(await claimQuizFolder(quiz, { home: true, exists })).toBe('Lessons/Tests/G7 - A - Sci/Mixtures Quiz (3)');
    // Someone else wrote a manifest in b meanwhile: refused, nothing overwritten.
    disk[`${b}/${QUIZ_FILE}`] = 'theirs';
    disk[`${b}/Q - Test.docx`] = 'my paper';
    const remove = async (p) => { delete disk[p]; };
    await expect(writeQuizFolder({ quiz, folder: b, write, remove, extra: { testPaper: `${b}/Q - Test.docx` }, key: ['A'] })).rejects.toThrow(/Another quiz/);
    expect(disk[`${b}/${QUIZ_FILE}`]).toBe('theirs');
    // What this quiz had just written is taken back; no key file is left beside theirs.
    expect(Object.keys(disk).filter((p) => p.startsWith(`${b}/`))).toEqual([`${b}/${QUIZ_FILE}`]);
    releaseQuizFolder('Lessons/Tests/G7 - A - Sci/Mixtures Quiz (3)');
  });

  it('a claim is let go when the disk cannot be checked', async () => {
    const quiz = newQuiz({ ...base, title: 'Claim', className: 'G8' }, at('2026-11-18T08:00:00Z')).quiz;
    await expect(claimQuizFolder(quiz, { home: true, exists: async () => { throw new Error('disk busy'); } })).rejects.toThrow('disk busy');
    expect(await claimQuizFolder(quiz, { home: true, exists: async () => false })).toBe('Lessons/Tests/G8/Claim');
    releaseQuizFolder('Lessons/Tests/G8/Claim');
  });

  it('the key file in a claimed folder is written in place', async () => {
    const disk = { 'Lessons/Tests/G9/K/KaTuro check.json': 'old key' };
    const write = async (p, content, mime, { overwrite = true } = {}) => {
      let path = p;
      for (let i = 2; !overwrite && path in disk; i += 1) path = p.replace(/(\.[^.]+)$/, ` (${i})$1`);
      disk[path] = content;
      return { path };
    };
    const quiz = newQuiz({ ...base, title: 'K', className: 'G9' }, at('2026-11-18T08:00:00Z')).quiz;
    const folder = await claimQuizFolder(quiz, { home: true, exists: async (p) => p in disk });
    await writeQuizFolder({ quiz, folder, write, key: ['B', 'B', 'B', 'B', 'B'] });
    expect(JSON.parse(disk[`${folder}/KaTuro check.json`]).keyText).toBe('BBBBB');
    expect(Object.keys(disk).some((p) => /check \(2\)/.test(p))).toBe(false);
  });
});
