/**
 * tests.js — a "Test": one assessment with its own folder (Lessons/Tests/<Class>/<Title>/, or an
 * older Bubble Quizzes/<...>/ folder). The folder's KaTuro bubble quiz.json is the manifest; it
 * knows the class, the record file and column, so the phone and KaTuroDesk never ask twice.
 * Pure code: the caller gives the file paths and a way to read a text file.
 */

import { QUIZ_FILE, CHECK_FILE, PHOTOS_DIR, PHOTO_FILE, parseQuiz, keyProblem } from './quiz.js';
import { classNameOfRecord, isClassRecordPath } from '../records/classRecords.js';

export const folderOf = (path) => String(path || '').split('/').slice(0, -1).join('/');
export const isTestFile = (path) => String(path || '').split('/').pop() === QUIZ_FILE;
export const checkPathOf = (path) => `${folderOf(path)}/${CHECK_FILE}`;

/** The saved check file (reads, decisions, answer key), or null. */
export function parseCheck(text) {
  if (typeof text !== 'string') return null;
  try {
    const c = JSON.parse(text);
    return c && typeof c === 'object' && !Array.isArray(c) ? c : null;
  } catch {
    return null;
  }
}

/** The test's answer key (letters), or null when none is saved or it does not fit the test. */
export function keyOf(quiz, check) {
  const k = check?.answerKey;
  return Array.isArray(k) && k.length === quiz.items ? k : null;
}

/** The photos in the test's Photos folder (any depth). */
export function photosOf(folder, paths = []) {
  const dir = `${folder}/${PHOTOS_DIR}/`.toLowerCase();
  return paths.filter((p) => String(p).toLowerCase().startsWith(dir) && PHOTO_FILE.test(p));
}

/**
 * Bubble sheets made from a class record in the KaTuro folder are a Test of that class
 * (Lessons/Tests/<class>/<title>, and the phone knows where to record): → that record, or null.
 */
export const testClassRecord = (listPath, { home = false } = {}) => (home && isClassRecordPath(listPath) ? listPath : null);

/** recorded if the scores were recorded; checked if photos were read; photos if there are photos; else new. */
export function testStatus({ quiz, check, photos = 0 }) {
  if (quiz.recordedAt) return 'recorded';
  if (check?.sheets && typeof check.sheets === 'object' && Object.keys(check.sheets).length) return 'checked';
  if (photos > 0) return 'photos';
  return 'new';
}

export const STATUS_LABEL = { new: 'New', photos: 'Photos in', checked: 'Checked', recorded: 'Recorded' };

/** The class a test is for: its class name, else its record's name, else the old section text. */
export function classNameOf(quiz) {
  if (quiz.className) return quiz.className;
  if (quiz.recordPath) return classNameOfRecord(quiz.recordPath);
  return quiz.section || '';
}

/** The Test as the phone sees it (the `tests` / `test` requests). */
export function testSummary({ path, quiz, check = null, photos = 0 }) {
  return {
    path,
    folder: folderOf(path),
    title: quiz.title,
    className: classNameOf(quiz),
    setId: quiz.setId,
    items: quiz.items,
    choices: quiz.choices,
    learners: quiz.learners.length,
    hasKey: Boolean(keyOf(quiz, check)),
    recordPath: quiz.recordPath || null,
    column: quiz.column || null,
    columnLabel: quiz.columnLabel || null,
    photos,
    status: testStatus({ quiz, check, photos }),
    createdAt: quiz.createdAt || null,
  };
}

/**
 * Every test in the folder, newest first.
 *   paths: every file path   readText(path) → Promise of the text, or null when unreadable
 * → [{ test, quiz, check }]
 */
export async function listTests({ paths = [], readText }) {
  const all = new Set(paths);
  const out = [];
  for (const path of paths.filter(isTestFile)) {
    const quiz = parseQuiz(await readText(path).catch(() => null));
    if (!quiz) continue;
    const checkPath = checkPathOf(path);
    const check = all.has(checkPath) ? parseCheck(await readText(checkPath).catch(() => null)) : null;
    out.push({ test: testSummary({ path, quiz, check, photos: photosOf(folderOf(path), paths).length }), quiz, check });
  }
  return out.sort((a, b) => String(b.test.createdAt || '').localeCompare(String(a.test.createdAt || '')));
}

/** A key from the phone (['A', 'C', …]) checked against the test (the same check as a typed key). → { key } or { error } */
export function validateKey(quiz, key) {
  if (!Array.isArray(key)) return { error: 'Send the answer key as a list of letters.' };
  const clean = key.map((k) => String(k ?? '').trim().toUpperCase());
  const problem = keyProblem(clean, quiz);
  return problem ? { error: problem } : { key: clean };
}

const fail = (message, code) => Object.assign(new Error(message), { code });

/**
 * One test (or older bubble quiz) by its manifest path.
 *   readText(path) → Promise of the text (rejects when the file is not there)
 * → { quiz, raw (the manifest as saved), check, answerKey }; throws { code: 'INVALID' | 'NOT_FOUND' }
 */
export async function loadTest({ path, readText }) {
  const p = String(path || '');
  if (!isTestFile(p)) throw fail('That is not a KaTuro test.', 'INVALID');
  let raw;
  try {
    raw = JSON.parse(await readText(p));
  } catch {
    throw fail('That test is not on KaTuroDesk any more. Refresh the list.', 'NOT_FOUND');
  }
  const quiz = parseQuiz(JSON.stringify(raw));
  if (!quiz) throw fail('That test could not be read by this version of KaTuroDesk.', 'NOT_FOUND');
  const check = parseCheck(await readText(checkPathOf(p)).catch(() => null));
  return { quiz, raw, check, answerKey: keyOf(quiz, check) };
}

/**
 * Marks a test as recorded (manifest recordedAt), after its scores went into the class record,
 * from the phone or on KaTuroDesk. The rest of the manifest is kept.
 *   write(path, text) → Promise
 */
export async function markTestRecorded({ path, readText, write, now = new Date() }) {
  const { raw } = await loadTest({ path, readText });
  await write(path, JSON.stringify({ ...raw, recordedAt: now.toISOString() }, null, 2));
}

/**
 * Before KaTuroDesk saves its copy of the check file: what is on the disk now is kept (photos read
 * and decisions made elsewhere), and a key saved elsewhere (the phone's testKey) since `seenKey`
 * was read wins over the panel's older one.
 */
export function mergeCheck(own, disk, seenKey = null) {
  if (!disk) return own;
  const keyFromElsewhere = JSON.stringify(disk.answerKey ?? null) !== JSON.stringify(seenKey ?? null);
  return {
    ...disk,
    ...own,
    sheets: { ...(disk.sheets || {}), ...(own.sheets || {}) },
    decisions: { ...(disk.decisions || {}), ...(own.decisions || {}) },
    ...(keyFromElsewhere ? { answerKey: disk.answerKey ?? null, keyText: disk.keyText || '' } : {}),
  };
}

/** The check file with this key saved in it (reads and decisions kept). */
export function withKey(check, key) {
  return { sheets: {}, decisions: {}, ...(check || {}), answerKey: key, keyText: key.join('') };
}
