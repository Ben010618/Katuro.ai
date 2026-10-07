/**
 * feedback.js — what teachers tell KaTuroDesk about an answer, so the admin can see
 * where it misunderstands and fix the rule cards once for everyone.
 *
 * Privacy: only the rating, a reason category, the teacher's own short comment, the
 * tool names, persona and app version are stored. Never the request, the answer,
 * file contents or learner names.
 */

export const DOWN_REASONS = [
  'Misunderstood my request',
  'Assumed something I did not say',
  'Wrong file or data',
  'Wrong numbers or grades',
  'Writing needs work',
  'Other',
];

/** "No, I meant…" right after KaTuro did something = the teacher is correcting it. */
export function isCorrection(text) {
  return /^\s*(no|nope|hindi|mali|wrong|not that|that'?s not|it'?s not|i meant|i said|hindi po|hindi ganun|hindi yan|ay hindi)\b/i.test(String(text || ''));
}

/** Tool names used for an assistant message (from its artifacts and steps), unique, max 12. */
export function toolsOf(msg) {
  const names = [
    ...(msg?.artifacts || []).map((a) => a.sourceTool),
    ...(msg?.toolNames || []),
  ].filter(Boolean);
  return [...new Set(names)].slice(0, 12);
}

async function appVersion() {
  try { return String((await window.katuroDeskApi?.getVersion?.()) || 'web').slice(0, 20); } catch { return 'unknown'; }
}

/** Saves one feedback entry. Throws only when signed out. */
export async function sendFeedback({ uid, rating, reason = '', comment = '', tools = [], persona = '' }) {
  if (!uid) throw new Error('Please sign in first.');
  const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
  const { db } = await import('../../firebase');
  await addDoc(collection(db, 'deskFeedback'), {
    uid,
    rating,
    reason: String(reason).slice(0, 60),
    comment: String(comment).replace(/\s+/g, ' ').trim().slice(0, 400),
    tools: (tools || []).slice(0, 12).map((t) => String(t).slice(0, 40)),
    persona: String(persona || '').slice(0, 20),
    appVersion: await appVersion(),
    at: serverTimestamp(),
  });
}

/** Admin dashboard numbers. rows: [{ rating, reason, comment, tools, at: Date }]. */
export function summarizeFeedback(rows, { days = 30, now = new Date() } = {}) {
  const since = now.getTime() - days * 86400000;
  const recent = (rows || []).filter((r) => !r.at || r.at.getTime() >= since);
  const count = (pred) => recent.filter(pred).length;
  const tally = (list) => [...list.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const problems = recent.filter((r) => r.rating !== 'up');
  return {
    up: count((r) => r.rating === 'up'),
    down: count((r) => r.rating === 'down'),
    corrections: count((r) => r.rating === 'correction'),
    reasons: tally(problems.map((r) => r.reason).filter(Boolean)),
    tools: tally(problems.flatMap((r) => r.tools || [])),
    comments: recent.filter((r) => r.comment).map((r) => ({ id: r.id, reason: r.reason, comment: r.comment, tools: r.tools || [] })),
  };
}
