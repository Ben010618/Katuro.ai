import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export async function trackEvent(uid, feature, meta = {}) {
  if (!uid) return;
  try {
    await addDoc(collection(db, 'usageEvents'), {
      uid,
      feature,
      ts: serverTimestamp(),
      ...meta,
    });
  } catch (_) {
    // analytics must never surface errors to the user
  }
}

/** Starts a stopwatch for a generation call; call the returned function to get elapsed ms. */
export function startTimer() {
  const startedAt = Date.now();
  return () => Date.now() - startedAt;
}

/**
 * Logs the outcome of an AI generation call — success/failure, latency, and
 * (on failure) a truncated error message. Kept as its own event type
 * ('ai_generation') separate from each feature's '*_generated' event so
 * reliability can be queried across every AI tool without enumerating
 * feature names, and so a failed attempt is never confused with a
 * successful one in the existing feature-popularity counts.
 */
export async function trackGeneration(uid, tool, { success, durationMs, error } = {}) {
  return trackEvent(uid, 'ai_generation', {
    tool,
    success: !!success,
    durationMs: typeof durationMs === 'number' ? Math.round(durationMs) : null,
    error: error ? String(error).slice(0, 300) : null,
  });
}
