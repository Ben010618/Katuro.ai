import { db } from '../firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

/**
 * Atomically checks and increments a per-user daily usage counter.
 * Throws if the user has hit their daily limit for the given action.
 *
 * @param {string} uid
 * @param {string} action  e.g. 'dll_gen', 'action_research_ai', 'outline_gen'
 * @param {number} limit   max calls per calendar day (UTC)
 */
export async function checkDailyLimit(uid, action, limit) {
  if (!uid) return;
  const today = new Date().toISOString().slice(0, 10); // "2026-06-13"
  const ref = doc(db, 'teachers', uid, 'usage', today);

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const current = data[action] ?? 0;

    if (current >= limit) {
      throw new Error(
        `You've reached today's limit (${limit}) for this feature. Try again tomorrow.`
      );
    }

    tx.set(ref, { ...data, [action]: current + 1, updatedAt: serverTimestamp() }, { merge: true });
  });
}
