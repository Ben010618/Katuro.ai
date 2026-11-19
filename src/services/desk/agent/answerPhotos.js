/**
 * answerPhotos.js — reads photos of learners' answer sheets with the AI (the name and the answer
 * marked for each item) and scores them by code. Used by the check_answer_sheets tool and by the
 * phone's checkPhotos request (rows for the teacher to review; nothing saved or recorded).
 *
 * ctx: { llm(opts), readBytes(path), heicToJpeg(bytes) }
 * Only the photo goes to the AI: no learner names are sent (the class list is matched here).
 */

import { visionPartsFor } from './visionPrep.js';
import { GROUNDING_RULES } from './grounding.js';

const toB64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return typeof btoa === 'function' ? btoa(s) : globalThis.Buffer.from(s, 'binary').toString('base64');
};

/** A photo in the folder → vision parts for the AI (HEIC converted to JPEG first). */
export async function photoParts(ctx, p) {
  let bytes = await ctx.readBytes(p);
  let mime = /\.png$/i.test(p) ? 'image/png' : 'image/jpeg';
  if (/\.(heic|heif)$/i.test(p)) {
    bytes = await ctx.heicToJpeg(bytes);
    if (!bytes) throw new Error(`${p.split('/').pop()} is an iPhone photo (HEIC). Converting it needs the KaTuroDesk desktop app.`);
    mime = 'image/jpeg';
  }
  return visionPartsFor({ needsVision: true, vision: { mimeType: mime, base64: toB64(bytes) } }, async () => bytes);
}

/**
 * photos: paths   key: ['A', …]   roster: learner names (optional, for matching the written name)
 * timeLimitMs: stop at this time (no new photo is started, and the answer does not wait for the
 *   ones being read): what was read so far comes back, `late` lists the photos not read in time.
 * → { results: [ { path, file, name, matched, score, total, wrong, unclear, blank, responses } | undefined ] (same order as photos),
 *     failed: [{ path, file, error }], late: [path] }
 */
export async function readAnswerPhotos({ photos, key, roster = [], ctx, report = () => {}, workers = 3, timeLimitMs = 0 }) {
  const A = await import('../generators/answerSheets.js');
  const { matchLearnerName } = await import('../generators/fillTemplates.js');
  const results = [];
  const failed = [];
  let next = 0;
  let fatal = null; // no AI (offline, signed out, today's limit): stop, and say so once
  let stopped = false;
  const worker = async () => {
    while (next < photos.length && !fatal && !stopped) {
      const i = next;
      next += 1;
      const p = photos[i];
      report(`Reading sheet ${i + 1} of ${photos.length}…`);
      try {
        const read = await ctx.llm({
          system: `You read learners' answer sheets for a Filipino DepEd teacher. Copy exactly what the learner marked or wrote; never correct it or guess.\n${GROUNDING_RULES}`,
          parts: await photoParts(ctx, p),
          prompt: `This photo is one learner's answer sheet for a ${key.length}-item test. Return ONLY JSON {"name": "<the learner's name as written, or empty>", "answers": {"1": "<answer>", ...}} for items 1 to ${key.length}. Use the letter marked/shaded/encircled or the word written; "" when the item is left blank; "?" when it is unclear, erased, or has two answers.`,
          json: true,
          maxTokens: 2500,
        });
        const s = A.scoreSheet(read, key);
        const name = String(read?.name || '').trim();
        let matched = '';
        if (roster.length && name) {
          const best = roster.map((r) => ({ r, score: matchLearnerName(name, r) })).sort((a, b) => b.score - a.score)[0];
          if (best && best.score >= 0.8) matched = best.r;
        }
        if (stopped) return;
        results[i] = { path: p, file: p.split('/').pop(), name, matched, ...s };
      } catch (err) {
        if (stopped) return;
        if (err?.code === 'AI_UNAVAILABLE' || err?.dailyLimit || err?.status === 429) {
          fatal = fatal || err;
          return;
        }
        failed.push({ path: p, file: p.split('/').pop(), error: err?.message || 'could not be read' });
      }
    }
  };
  const all = Promise.all(Array.from({ length: Math.max(1, workers) }, worker));
  let timer = null;
  if (timeLimitMs > 0) await Promise.race([all, new Promise((resolve) => { timer = setTimeout(resolve, timeLimitMs); })]);
  else await all;
  clearTimeout(timer);
  stopped = true;
  if (fatal) throw fatal;
  const done = new Set([...results.filter(Boolean).map((r) => r.path), ...failed.map((f) => f.path)]);
  return { results: [...results], failed: [...failed], late: photos.filter((p) => !done.has(p)) };
}

/** What the teacher should look at on one read sheet ('' when nothing). */
export function sheetNote(r, { hasRoster = false } = {}) {
  return [
    !r.name && 'no name read',
    hasRoster && r.name && !r.matched && 'name not in the class list',
    r.unclear.length && `unclear: item${r.unclear.length > 1 ? 's' : ''} ${r.unclear.join(', ')}`,
    r.blank.length && `blank: ${r.blank.join(', ')}`,
  ].filter(Boolean).join('; ');
}
