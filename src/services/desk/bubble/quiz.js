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

/** Tests made in the KaTuro folder: Lessons/Tests/<Class name>/<Test title>/ */
export const TESTS_ROOT = 'Lessons/Tests';

/**
 * The quiz's folder in the workspace. In the KaTuro folder (home), a quiz for a class
 * ("Grade 7 - Rizal - Science", the class record's name) goes in Lessons/Tests/<class>/<title>;
 * anywhere else, or without a class, the old Bubble Quizzes/<title> - <section>.
 */
export function quizFolder(quiz, { home = false } = {}) {
  if (home && safeName(quiz.className)) return `${TESTS_ROOT}/${safeName(quiz.className)}/${safeName(quiz.title) || 'Test'}`;
  const name = [safeName(quiz.title), safeName(quiz.section)].filter(Boolean).join(' - ');
  return `${QUIZ_ROOT}/${name || 'Quiz'}`;
}

/** The quiz title as it is used in its file names ("<title> - Bubble Sheets.pdf"). */
export const fileTitle = (title) => String(title || '').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Quiz';

// Folders being made right now (two tests made in one turn, or a test and the panel, never share one).
const claimed = new Set();

/**
 * A free folder for a new quiz, checked on the disk, and held until releaseQuizFolder:
 * a second quiz with the same title (and class) gets "(2)", "(3)"…
 *   exists(path) → Promise<boolean> (on the disk)
 */
export async function claimQuizFolder(quiz, { home = false, exists }) {
  const base = quizFolder(quiz, { home });
  for (let i = 1; i < 100; i += 1) {
    const folder = i === 1 ? base : `${base} (${i})`;
    if (claimed.has(folder.toLowerCase())) continue;
    claimed.add(folder.toLowerCase());
    let taken;
    try {
      taken = await exists(`${folder}/${QUIZ_FILE}`);
    } catch (err) {
      claimed.delete(folder.toLowerCase());
      throw err;
    }
    if (!taken) return folder;
    claimed.delete(folder.toLowerCase());
  }
  throw new Error('There are too many quizzes with this title. Choose another title.');
}

export const releaseQuizFolder = (folder) => { claimed.delete(String(folder || '').toLowerCase()); };

/**
 * Writes a claimed quiz folder: the bubble sheets PDF, the manifest (never over another one),
 * the key (when given) and the Photos folder; then releases the claim.
 *   write(path, content, mimeType, { overwrite }) → { path }
 *   writePdf(path, bytes) → { path } (optional: e.g. saved as one of the agent's outputs)
 *   remove(path) → Promise (optional): takes back what was written when the folder turns out to be taken
 *   extra: more manifest fields (testPaper, answerKeyDoc)   key: ['A', …] for KaTuro check.json
 * → { quiz: the saved manifest, folder, pdf }
 */
export async function writeQuizFolder({ quiz, folder, write, writePdf = null, remove = null, extra = {}, key = null }) {
  try {
    const { buildBubbleSheetsPdf } = await import('./sheetPdf.js');
    const bytes = await buildBubbleSheetsPdf(quiz);
    const pdfTarget = `${folder}/${fileTitle(quiz.title)} - Bubble Sheets.pdf`;
    const pdf = writePdf ? await writePdf(pdfTarget, bytes) : await write(pdfTarget, bytes, 'application/pdf', { overwrite: false });
    const saved = { ...quiz, pdfPath: pdf.path, ...extra };
    const manifest = await write(`${folder}/${QUIZ_FILE}`, JSON.stringify(saved, null, 2), 'application/json', { overwrite: false });
    if (manifest.path !== `${folder}/${QUIZ_FILE}`) {
      // Another quiz took this folder: take back what was just written (best effort), keep theirs.
      const mine = [manifest.path, pdf.path, ...Object.values(extra).filter((v) => typeof v === 'string' && v.startsWith(`${folder}/`))];
      if (remove) for (const p of mine) await Promise.resolve().then(() => remove(p)).catch(() => {});
      throw new Error('Another quiz was just made in the same folder. Please try again.');
    }
    // KaTuro's own files in the folder it now holds: written as they are (never a "(2)" copy beside an old key).
    if (key) await write(`${folder}/${CHECK_FILE}`, JSON.stringify({ answerKey: key, keyText: key.join(''), sheets: {}, decisions: {} }, null, 2), 'application/json', { overwrite: true });
    await write(`${folder}/${PHOTOS_DIR}/About this folder.txt`, 'Photos of the answered bubble sheets go here (from the KaTuro App, or copied in). KaTuroDesk checks them from this folder.\r\n', 'text/plain', { overwrite: true });
    return { quiz: saved, folder, pdf };
  } finally {
    releaseQuizFolder(folder);
  }
}

/** The Bubble quiz panel (Canvas) for a saved quiz, at a step: 'photos' | 'check' | 'print'. */
export function bubbleQuizArtifact(quiz, folder, stage = 'photos') {
  return {
    type: 'bubble_quiz',
    title: `Bubble quiz: ${quiz.title}`,
    subtitle: `${quiz.learners.length} learners, ${quiz.items} items`,
    files: [],
    editable: false,
    data: { stage, folder, quiz },
  };
}

/** True for a file inside a quiz/test folder made by KaTuro (new or old place). */
export const isTestFolderPath = (path) => {
  const p = String(path || '').replace(/\\/g, '/').toLowerCase();
  return p.startsWith(`${QUIZ_ROOT.toLowerCase()}/`) || p.startsWith(`${TESTS_ROOT.toLowerCase()}/`);
};

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
      // A Test (Lessons/Tests): its class, and where its scores are recorded.
      ...(clean(setup.className) ? { className: clean(setup.className) } : {}),
      ...(setup.recordPath ? { recordPath: setup.recordPath, column: setup.column || null, columnLabel: setup.columnLabel || null } : {}),
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

/** What is wrong with a key (letters) for this quiz, or null when it fits. */
export function keyProblem(key, quiz) {
  const letters = CHOICE_SETS[quiz.choices] || CHOICE_SETS[4];
  const bad = key.map((k, i) => (letters.includes(k) ? null : i + 1)).filter(Boolean);
  if (bad.length) return `Item${bad.length > 1 ? 's' : ''} ${bad.slice(0, 5).join(', ')} in the key ${bad.length > 1 ? 'are' : 'is'} not one of ${letters.join(', ')}.`;
  if (key.length !== quiz.items) return `The key has ${key.length} answers, but the quiz has ${quiz.items} items.`;
  return null;
}

/** The teacher's typed key, checked against this quiz. → { key } or { error } */
export function readKey(text, quiz) {
  const { key, error } = parseAnswerKey(text);
  if (error) return { error: `The answer key: ${error}.` };
  const problem = keyProblem(key, quiz);
  return problem ? { error: problem } : { key };
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
