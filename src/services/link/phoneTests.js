/**
 * phoneTests.js — the KaTuro App's side of Tests ("Check test papers"). Pure code.
 *
 * A Test (KaTuroDesk, request `tests`) knows its class, answer key, record file and column, so
 * the phone never asks what is already known:
 *   - a KaTuro bubble sheet's QR code (KT1:<setId>:<nnn>) names its Test
 *   - the answer key question starts on "the key saved with this test" when there is one
 *   - scores go to the Test's record and column when it has them
 * Older KaTuroDesk versions answer UNKNOWN_OP: the phone falls back (see isOldDesk).
 */
import { parseSheetCode } from '../desk/bubble/layout.js';
import { finalScores } from '../desk/bubble/quiz.js';

/** Where test papers go when the test is not in the list (as before Tests). */
export const PAPERS_FOLDER = 'Lessons/Phone Photos/Test papers';
export const UPDATE_DESK = 'Update KaTuroDesk to use Tests.';

const OFFLINE = new Set(['UNREACHABLE', 'DESK_STARTING', 'CLOSED']);
export const isOffline = (err) => OFFLINE.has(err?.code);
/** KaTuroDesk is older than Tests (it does not know the request). */
export const isOldDesk = (err) => err?.code === 'UNKNOWN_OP';

/** Newest first (KaTuroDesk sends them so; a cached list is kept the same way). */
export function newestFirst(tests = []) {
  return [...tests].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export const testFolder = (test) => test?.folder || String(test?.path || '').split('/').slice(0, -1).join('/');
export const photosFolder = (test) => `${testFolder(test)}/Photos`;
/** "Records/Grade 7 - Rizal - Science.xlsx" → "Grade 7 - Rizal - Science" */
export const recordName = (path) => String(path || '').split('/').pop().replace(/\.(xlsx|xlsm)$/i, '');

/**
 * The Test a bubble sheet belongs to, from its QR text (or parsed code).
 * → { test, number } | { unknown: true, setId } (a KaTuro sheet of a test this KaTuroDesk does not have) | null (not a KaTuro sheet)
 */
export function matchTestByCode(code, tests = []) {
  const c = typeof code === 'string' ? parseSheetCode(code) : code;
  if (!c?.setId) return null;
  const test = tests.find((t) => t.setId === c.setId);
  return test ? { test, number: c.number } : { unknown: true, setId: c.setId };
}

/** "Quiz 3 · Grade 7 - Rizal · key saved ✓" */
export function testChip(test, hasKey = Boolean(test?.hasKey)) {
  return [test?.title, test?.className, hasKey ? 'key saved ✓' : 'no answer key yet'].filter(Boolean).join(' · ');
}

/** One line under a test in the list. */
export function testLine(test) {
  const parts = [`${test.items} items`];
  if (test.learners) parts.push(`${test.learners} learners`);
  if (test.status === 'recorded') parts.push('recorded ✓');
  else if (test.status === 'checked') parts.push('checked');
  else if (test.photos) parts.push(`${test.photos} photo${test.photos === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** The record and column the Test's scores go to, when the Test knows them. → { path, column, label, name } | null */
export function recordTarget(test) {
  if (!test?.recordPath || !test?.column) return null;
  return { path: test.recordPath, column: test.column, label: test.columnLabel || test.column, name: recordName(test.recordPath) };
}

/**
 * "Answer key?" for papers that are not KaTuro bubble sheets, in order; the first is the
 * smart default (the key saved with the test, when there is one).
 */
export function keyChoices(test) {
  const options = [
    ...(test?.hasKey ? [{ id: 'saved', label: 'The key saved with this test' }] : []),
    { id: 'scan', label: 'Scan a sheet shaded as the key' },
    { id: 'type', label: 'Type it' },
    { id: 'none', label: 'No key — just save the photos' },
  ];
  return { options };
}

/**
 * A quiz from an older KaTuroDesk (`quizzes` list + `quiz`) in the Test shape, so the same
 * screens work. The set id is known only once the quiz itself was read.
 */
export function testFromQuiz(summary, quiz = null) {
  const path = summary.path;
  return {
    path,
    folder: testFolder({ path }),
    title: summary.title,
    className: summary.section || '',
    setId: quiz?.setId || null,
    items: summary.items,
    choices: quiz?.choices || 4,
    learners: summary.learners,
    hasKey: Boolean(summary.hasKey),
    recordPath: null,
    column: null,
    columnLabel: null,
    photos: 0,
    status: 'new',
    createdAt: summary.createdAt,
  };
}

/**
 * Scores ready for `record`: by LRN only. Learners without an LRN in the test's list cannot be
 * recorded by KaTuroDesk; they are named so the teacher knows.
 *   scored: [{ name, lrn, score }]   → { scores: [{ lrn, score }], noLrn: [name] }
 */
export function splitByLrn(scored = []) {
  const withScore = scored.filter((s) => Number.isFinite(s.score));
  return {
    scores: withScore.filter((s) => /^\d{12}$/.test(String(s.lrn || ''))).map((s) => ({ lrn: String(s.lrn), score: s.score })),
    noLrn: withScore.filter((s) => !/^\d{12}$/.test(String(s.lrn || ''))).map((s) => s.name),
  };
}

/** Bubble sheets: the review (quiz.js reviewSheets) → [{ n, name, lrn, score }] with a score, or null while something is open. */
export function bubbleScored(quiz, review) {
  if (!review || review.open) return null;
  return (finalScores(quiz, review) || []).filter((s) => s.score !== null);
}

/**
 * Papers checked on KaTuroDesk (`checkPhotos` rows) with the teacher's decisions.
 *   rows: [{ photo, n|null, name|null, score|null, items, unclear: [item], note? }]
 *   decisions: { [photo]: { skip?, learner?: n, items?: { [item]: true (correct) | false (wrong) }, score?: number } }
 *   learners: the test's learners [{ n, name, lrn }]
 * → { rows: [{ photo, learner, name, score, items, unclear: [{ item, correct }], note, issues: [kind], skipped }], open, byLearner }
 *   issue kinds: learner (who is this?) | score (no score read: type it) | item (unclear item) | duplicate
 */
export function reviewPhotoRows(rows = [], decisions = {}, learners = []) {
  const known = new Map(learners.map((l) => [l.n, l]));
  const out = rows.map((r) => {
    const d = decisions[r.photo] || {};
    if (d.skip) return { photo: r.photo, skipped: true, issues: [] };
    const learner = d.learner !== undefined ? d.learner : known.has(r.n) ? r.n : null;
    const issues = [];
    if (!known.has(learner)) issues.push('learner');
    const unclear = (r.unclear || []).map((item) => ({ item, correct: d.items?.[item] }));
    let score = null;
    // A score the teacher typed settles the paper (its unclear items no longer count).
    if (Number.isFinite(d.score)) score = d.score;
    else if (Number.isFinite(r.score)) {
      for (const u of unclear) if (u.correct === undefined) issues.push('item');
      score = r.score + unclear.filter((u) => u.correct === true).length;
    } else issues.push('score');
    // unread: no score was read, so the teacher types it (the box stays while it is being typed).
    return { photo: r.photo, learner: known.has(learner) ? learner : null, name: known.get(learner)?.name || r.name || '', score, items: r.items, unclear, note: r.note || '', issues, skipped: false, unread: !Number.isFinite(r.score) };
  });
  const byLearner = new Map();
  for (const r of out) {
    if (r.skipped || r.learner === null) continue;
    if (byLearner.has(r.learner)) {
      for (const x of [byLearner.get(r.learner), r]) if (!x.issues.includes('duplicate')) x.issues.push('duplicate');
    } else byLearner.set(r.learner, r);
  }
  const open = out.reduce((n, r) => n + r.issues.length, 0);
  return { rows: out, open, byLearner };
}

/** Papers: the review → [{ n, name, lrn, score }] (one per learner with a paper), or null while something is open. */
export function photoScored(learners, review) {
  if (!review || review.open) return null;
  return learners.filter((l) => review.byLearner.has(l.n)).map((l) => ({ n: l.n, name: l.name, lrn: l.lrn, score: review.byLearner.get(l.n).score }));
}

/** KaTuroDesk checks at most this many photos per request (`checkPhotos`). */
export const CHECK_BATCH = 60;
/** [a, b, c, d, e] → [[a, b], [c, d], [e]] */
export function inBatches(list = [], size = CHECK_BATCH) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Photos to check again: those with no row back (a batch that failed) or no score read
 * (e.g. not read in time). Rows the teacher may have settled are never read again.
 *   photos: the phone paths sent for checking   rows: checkPhotos rows so far
 */
export function photosToRecheck(photos = [], rows = []) {
  const byPhoto = new Map(rows.map((r) => [r.photo, r]));
  return photos.filter((p) => !byPhoto.has(p) || !Number.isFinite(byPhoto.get(p).score));
}

/** The rows after checking `photos` again: their old rows replaced by the new ones, in photo order. */
export function mergeRows(rows = [], fresh = [], photos = []) {
  const again = new Set(photos);
  return [...rows.filter((r) => !again.has(r.photo)), ...fresh].sort((a, b) => String(a.photo).localeCompare(String(b.photo), undefined, { numeric: true }));
}

// ── the tests list kept on the phone (to choose a test while KaTuroDesk can't be reached) ──
const CACHE_KEY = 'katuro-phone-tests-v1';
export const TESTS_CACHE_KEY = CACHE_KEY;
export function cacheTests(tests) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(tests || [])); } catch { /* full or blocked */ }
}
export function cachedTests() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}
