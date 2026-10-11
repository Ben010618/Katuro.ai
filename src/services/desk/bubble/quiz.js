/**
 * quiz.js — one bubble-sheet quiz from start to finish. Pure code.
 *
 * The quiz lives in its own folder in the teacher's workspace:
 *   Bubble Quizzes/<title> - <section>/
 *     KaTuro bubble quiz.json   what was printed: settings, learners, set id (the reader needs it)
 *     <title> - Bubble Sheets.pdf
 *     Photos/                   photos from the phone (or copied in by the teacher)
 *     KaTuro check.json         what was read from each photo and the teacher's decisions
 *     <title> - Results.xlsx
 * Nothing leaves the computer: no AI and no internet are used to check.
 */

import { sheetLayout, newSetId, parseSheetCode, LAYOUT_VERSION, CHOICE_SETS, BUBBLE_PAPERS, PER_PAGE, MAX_ITEMS } from './layout.js';
import { parseAnswerKey, scoreSheet, hardestItems } from '../generators/answerSheets.js';

export const QUIZ_FILE = 'KaTuro bubble quiz.json';
export const CHECK_FILE = 'KaTuro check.json';
export const PHOTOS_DIR = 'Photos';
export const QUIZ_ROOT = 'Bubble Quizzes';
export const PHOTO_FILE = /\.(jpe?g|png|webp|heic|heif)$/i;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const safeName = (s) => clean(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\.+$/, '').slice(0, 60).trim();

/** The quiz's folder in the workspace. */
export function quizFolder(quiz) {
  const name = [safeName(quiz.title), safeName(quiz.section)].filter(Boolean).join(' - ');
  return `${QUIZ_ROOT}/${name || 'Quiz'}`;
}

/**
 * A new quiz from the teacher's settings.
 *   setup: { title, section?, items, choices, paper, perPage, blanks?, learners: [{ name, lrn?, include? }], listPath? }
 * → { ok: true, quiz } or { ok: false, problems: [text] }
 */
export function newQuiz(setup, { now = new Date(), random = Math.random } = {}) {
  const problems = [];
  const title = clean(setup.title);
  if (!title) problems.push('Type the quiz title.');
  const learners = (setup.learners || []).filter((l) => l.include !== false && clean(l.name));
  const blanks = Math.max(0, Math.min(200, Math.floor(Number(setup.blanks) || 0)));
  if (!learners.length && !blanks) problems.push('Choose at least one learner, or add blank sheets.');
  if (learners.length > 999) problems.push('One quiz can have up to 999 learners.');
  const lrns = learners.map((l) => clean(l.lrn).replace(/\s/g, '')).filter(Boolean);
  const twice = lrns.filter((x, i) => lrns.indexOf(x) !== i);
  if (twice.length) problems.push(`The LRN ${twice[0]} is given to two learners. Please fix it.`);
  if (lrns.some((x) => !/^\d{12}$/.test(x))) problems.push('An LRN should have 12 digits. Fix or clear the ones marked.');
  const layout = sheetLayout({ paper: setup.paper, perPage: Number(setup.perPage), items: Number(setup.items), choices: Number(setup.choices) });
  if (!layout.ok) problems.push(layout.error);
  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    quiz: {
      kind: 'katuro-bubble-quiz',
      version: 1,
      layout: LAYOUT_VERSION,
      setId: newSetId(random),
      title,
      section: clean(setup.section),
      items: layout.items,
      choices: layout.choices,
      paper: layout.paper,
      perPage: layout.perPage,
      blanks,
      learners: learners.map((l, i) => ({ n: i + 1, name: clean(l.name), lrn: clean(l.lrn).replace(/\s/g, '') })),
      ...(setup.listPath ? { listPath: setup.listPath } : {}),
      createdAt: now.toISOString(),
      answerKey: null,
    },
  };
}

/** A saved quiz file back into a quiz, or null when it is not a KaTuro quiz this version can read. */
export function parseQuiz(text) {
  let q;
  try {
    q = JSON.parse(text);
  } catch {
    return null;
  }
  if (q?.kind !== 'katuro-bubble-quiz' || q.layout !== LAYOUT_VERSION || !/^[A-Z0-9]{6}$/.test(q.setId || '')) return null;
  if (!BUBBLE_PAPERS[q.paper] || !PER_PAGE.includes(q.perPage) || !CHOICE_SETS[q.choices]) return null;
  if (!Number.isInteger(q.items) || q.items < 1 || q.items > MAX_ITEMS || !Array.isArray(q.learners)) return null;
  return q;
}

export const layoutOf = (quiz) => sheetLayout(quiz);

/** The teacher's typed key, checked against this quiz. → { key } or { error } */
export function readKey(text, quiz) {
  const { key, error } = parseAnswerKey(text);
  if (error) return { error: `The answer key: ${error}.` };
  const letters = CHOICE_SETS[quiz.choices];
  const bad = key.map((k, i) => (letters.includes(k) ? null : i + 1)).filter(Boolean);
  if (bad.length) return { error: `Item${bad.length > 1 ? 's' : ''} ${bad.slice(0, 5).join(', ')} in the key ${bad.length > 1 ? 'are' : 'is'} not one of ${letters.join(', ')}.` };
  if (key.length !== quiz.items) return { error: `The key has ${key.length} answers, but the quiz has ${quiz.items} items.` };
  return { key };
}

/**
 * What one photo gave, in the form saved in the check file.
 *   res: readSheet(...) result
 * → { ok, error?, number: learner number | 0 (blank sheet) | null (code unreadable / another quiz), answers, notes }
 */
export function sheetFromRead(quiz, res) {
  if (!res?.ok) return { ok: false, error: res?.error || 'unreadable' };
  const code = parseSheetCode(res.code);
  const number = code && code.setId === quiz.setId ? code.number : null;
  return { ok: true, number, answers: res.answers, notes: res.notes || {} };
}

export const ERROR_TEXT = {
  corners: 'The four black corner squares were not all found. Retake the photo with the whole sheet in view, on a plain light surface.',
  alignment: 'The sheet could not be lined up (it may be from another quiz, folded, or blurry). Retake the photo.',
  unreadable: 'This photo could not be opened.',
};

/**
 * Everything the teacher must decide before recording, and the scores.
 *   sheets: { [photo]: sheetFromRead(...) }   decisions: { [photo]: { learner?, skip?, answers?: { [item]: letter | '' } } }
 * → { rows: [{ photo, learner, answers, issues: [{ kind, item?, note? }], score? }], open, byLearner: Map(n → row), missing: [learner] }
 *   kinds: unreadable | learner (who is this?) | duplicate (two photos for one learner) | item (unclear item)
 */
export function reviewSheets(quiz, key, sheets = {}, decisions = {}) {
  const known = new Set(quiz.learners.map((l) => l.n));
  const rows = Object.keys(sheets).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((photo) => {
    const s = sheets[photo];
    const d = decisions[photo] || {};
    if (d.skip) return { photo, skipped: true, issues: [] };
    if (!s.ok) return { photo, learner: null, issues: [{ kind: 'unreadable', note: ERROR_TEXT[s.error] || ERROR_TEXT.unreadable }] };
    const issues = [];
    const learner = d.learner !== undefined ? d.learner : known.has(s.number) ? s.number : null;
    if (!known.has(learner)) {
      issues.push({ kind: 'learner', note: s.number === 0 ? 'A blank sheet: choose the learner who used it.' : s.number === null ? 'The learner code could not be read (or the sheet is from another quiz). Choose the learner.' : 'This sheet number is not in the class list. Choose the learner.' });
    }
    const answers = { ...s.answers, ...(d.answers || {}) };
    for (const [item, a] of Object.entries(answers)) if (a === '?') issues.push({ kind: 'item', item: Number(item), note: s.notes?.[item] || 'unclear' });
    return { photo, learner: known.has(learner) ? learner : null, answers, issues };
  });
  // One sheet per learner: a second photo of the same learner must be settled by the teacher.
  const byLearner = new Map();
  for (const r of rows) {
    if (r.skipped || r.learner === null || r.learner === undefined) continue;
    if (byLearner.has(r.learner)) {
      const first = byLearner.get(r.learner);
      for (const x of [first, r]) if (!x.issues.some((i) => i.kind === 'duplicate')) x.issues.push({ kind: 'duplicate', note: 'Two photos are for the same learner. Skip one of them, or choose the right learner.' });
    } else {
      byLearner.set(r.learner, r);
    }
  }
  for (const r of rows) {
    if (!r.skipped && key && !r.issues.length) Object.assign(r, scoreSheet({ answers: r.answers }, key));
  }
  const open = rows.reduce((n, r) => n + r.issues.length, 0);
  const missing = quiz.learners.filter((l) => !byLearner.has(l.n));
  return { rows, open, byLearner, missing };
}

/** Scores ready to record: [{ n, name, lrn, score | null (no sheet) }], only when nothing is open. */
export function finalScores(quiz, review) {
  if (review.open) return null;
  return quiz.learners.map((l) => {
    const r = review.byLearner.get(l.n);
    return { n: l.n, name: l.name, lrn: l.lrn, score: r && Number.isFinite(r.score) ? r.score : null, photo: r?.photo || '' };
  });
}

/** The results workbook (Scores, Responses for item analysis, Answer key). */
export function resultsSpec(quiz, key, review) {
  const scored = quiz.learners.map((l) => ({ l, r: review.byLearner.get(l.n) })).filter((x) => x.r && Number.isFinite(x.r.score));
  const hard = hardestItems(scored.map((x) => x.r), key.length);
  return {
    title: `${quiz.title} - Results`,
    sheets: [
      {
        name: 'Scores',
        columns: ['No.', 'Learner', 'LRN', 'Score', 'Items', 'Percent', 'Wrong items', 'Photo'],
        rows: quiz.learners.map((l) => {
          const r = review.byLearner.get(l.n);
          if (!r || !Number.isFinite(r.score)) return [l.n, l.name, l.lrn, null, quiz.items, null, 'no sheet', ''];
          return [l.n, l.name, l.lrn, r.score, quiz.items, Math.round((r.score / quiz.items) * 100), r.wrong.join(', '), r.photo.split('/').pop()];
        }),
      },
      { name: 'Responses', columns: ['Name', ...key.map((_, i) => String(i + 1)), 'Total'], rows: scored.map(({ l, r }) => [l.name, ...r.responses, r.score]) },
      { name: 'Item analysis', columns: ['Item', 'Answer', 'Correct', 'Percent correct'], rows: hard.sort((a, b) => a.item - b.item).map((h) => [h.item, key[h.item - 1], h.correct, h.percent]) },
    ],
  };
}
