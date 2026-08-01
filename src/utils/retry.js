/**
 * Retries an async function with exponential backoff. Built for the
 * post-generation Firestore save of ILAW/DLL/COT lesson plans -- a save
 * that fails silently there is the #1 cause of "I generated a lesson but
 * can't download it later": the plan never reaches Firestore, so it never
 * shows up in My Lessons, and the only copy left is the in-memory store
 * for that one session. Most such failures are transient (a teacher's
 * mobile hotspot dropping for a second), so a few retries recover the
 * overwhelming majority without the user ever noticing.
 */
export async function retryAsync(fn, { attempts = 3, baseDelayMs = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, baseDelayMs * 2 ** i));
      }
    }
  }
  throw lastErr;
}
