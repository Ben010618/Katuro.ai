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
  identify: 'Point the camera at a learner’s bubble sheet: KaTuro finds its test from the code.',
  finding: 'A KaTuro sheet. Finding its test…',
  unknownTest: 'This sheet is from a test this KaTuroDesk does not have.',
};

/**
 * Auto mode (no quiz chosen first): the QR code of the first KaTuro sheet seen names the test.
 * One lookup at a time; a test KaTuroDesk does not have is remembered, so the same sheet in view
 * does not ask again.
 *   feed(qrText) → { status: 'identify' } (no KaTuro code) | { status: 'finding', code? } (code only
 *                  when a lookup should start) | { status: 'unknownTest', note }
 *   settle(note?) the lookup ended; a note = that test is not there (said again for its sheets);
 *                 no note (found, or a lookup that failed for now) = it may be looked up again
 */
export function createIdentifier() {
  const refused = new Map(); // setId → why
  let pending = null;
  return {
    feed(text) {
      if (pending) return { status: 'finding' };
      const code = parseSheetCode(text);
      if (!code) return { status: 'identify' };
      if (refused.has(code.setId)) return { status: 'unknownTest', note: refused.get(code.setId) };
      pending = code.setId;
      return { status: 'finding', code };
    },
    settle(note) {
      if (pending && note) refused.set(pending, note);
      pending = null;
    },
  };
}

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
