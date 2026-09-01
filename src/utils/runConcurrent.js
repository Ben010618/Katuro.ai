/**
 * Worker-pool map that never rejects — each result is {status, value|reason},
 * like Promise.allSettled but with a concurrency cap.
 *
 * WHY A CAP AT ALL: these run one AI call per item (per ILAW session, per Test
 * Builder competency). Firing all of them at once would hit the provider's
 * per-minute rate limit, which is what the original fully-sequential version
 * was avoiding — at the cost of making a 5-session lesson plan take four
 * minutes. A small pool gets most of the speed without the 429s.
 */
export async function runConcurrentSettled(items, concurrency, fn) {
  const results = new Array(items.length);
  const queue   = [...items.entries()];

  async function worker() {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      const [i, item] = next;
      try         { results[i] = { status: 'fulfilled', value: await fn(item, i) }; }
      catch (err) { results[i] = { status: 'rejected',  reason: err }; }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker)
  );
  return results;
}

/**
 * How many AI calls to have in flight at once.
 *
 * 3 is deliberate. The provider's per-minute allowance comfortably covers it,
 * and the server now handles a per-minute 429 by backing off and a per-model
 * daily cap by switching model — so the occasional collision is absorbed rather
 * than surfaced. Going wider buys little (the wall time is dominated by the
 * slowest call in each wave) while making rate-limit collisions likely.
 */
export const AI_CONCURRENCY = 3;
