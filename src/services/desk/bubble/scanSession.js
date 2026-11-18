/**
 * scanSession.js — the live bubble-sheet scanner's decisions (KaTuro App camera view).
 *
 * The camera is read several times a second (reader.js). A sheet is taken only when two
 * readings in a row agree exactly (same learner code, same answers): a blurry or moving frame
 * never becomes a score. Each learner is taken once. A sheet with no readable learner code is
 * taken too; another such sheet is taken when its answers differ or the sheet left the camera.
 * While the sheet just taken stays in view the status is 'held' (not 'duplicate').
 *
 *   mode 'sheets': learners' answered sheets → { status: 'accepted', sheet } (sheetFromRead form)
 *   mode 'key':    one sheet filled as the answer key → { status: 'key', key: ['A', …] }
 */
import { parseSheetCode } from './layout.js';

export const SCAN_STATUS = {
  searching: 'Point the camera at a sheet: all four black corners in view.',
  adjust: 'Almost: hold the phone straight above the sheet, a little closer.',
  steady: 'Hold still…',
  accepted: 'Got it. Next sheet.',
  held: 'Got it. Next sheet.',
  duplicate: 'Already scanned. Next sheet.',
  otherQuiz: 'This sheet is from another quiz.',
  unclear: 'Some items are unclear on the key sheet. Shade them fully, or type the key instead.',
  key: 'Answer key read.',
};

const answersOf = (res) => Object.keys(res.answers || {}).sort((a, b) => a - b).map((k) => res.answers[k]).join('');
const signature = (res) => `${res.code || '-'}|${answersOf(res)}`;

/**
 * quiz: { setId, items, learners: [{ n }] }
 * → { feed(readSheetResult) → { status, sheet?, number?, key?, items? }, taken: Set(numbers) }
 */
export function createScanSession(quiz, { mode = 'sheets', taken = [] } = {}) {
  const known = new Set((quiz.learners || []).map((l) => l.n));
  const done = new Set(taken);
  let last = '';
  let justTaken = ''; // signature of the sheet just taken, while it may still be in view
  let justAnswers = null; // its answers: the same sheet with its code misread on a frame is still that sheet
  let unknown = 0; // sheets taken with no learner code

  function feed(res) {
    if (!res?.ok) {
      if (res?.error === 'corners') { justTaken = ''; justAnswers = null; } // the sheet left the camera
      last = '';
      return { status: res?.error === 'corners' ? 'searching' : 'adjust' };
    }
    const code = res.code ? parseSheetCode(res.code) : null;
    if (code && code.setId !== quiz.setId) { last = ''; return { status: 'otherQuiz' }; }
    const number = code ? code.number : null;
    const sig = signature(res);
    if (sig !== last) { last = sig; return { status: 'steady' }; }

    // Two readings agree.
    if (mode === 'key') {
      const key = Array.from({ length: quiz.items }, (_, i) => res.answers[i + 1] || '');
      const unclear = key.map((k, i) => (/^[A-E]$/.test(k) ? null : i + 1)).filter(Boolean);
      if (unclear.length) return { status: 'unclear', items: unclear };
      return { status: 'key', key };
    }
    if (sig === justTaken || (!code && answersOf(res) === justAnswers)) return { status: 'held', number };
    if (known.has(number)) {
      if (done.has(number)) return { status: 'duplicate', number };
      done.add(number);
      justTaken = sig;
      justAnswers = answersOf(res);
      return { status: 'accepted', number, sheet: { ok: true, number, answers: res.answers, notes: res.notes || {} } };
    }
    // No usable learner code (blank sheet, torn code): the teacher picks the learner in the review.
    justTaken = sig;
    justAnswers = answersOf(res);
    unknown += 1;
    return { status: 'accepted', number, sheet: { ok: true, number, answers: res.answers, notes: res.notes || {} } };
  }

  return { feed, taken: done, get count() { return done.size + unknown; } };
}
