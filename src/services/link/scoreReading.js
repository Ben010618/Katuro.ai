/**
 * scoreReading.js — reads the score a teacher wrote on a checked paper (KaTuro App, Phase 5).
 *
 * Privacy: the teacher taps the score on the photo and ONLY a small square around that spot
 * (the handwritten number) is sent to the KaTuro AI service. The learner is known from the
 * class list on the phone, so no name, LRN or other part of the paper leaves the phone.
 *
 * Every reading is shown next to its picture for the teacher to confirm or correct; an
 * unsure reading is never filled in by itself.
 */

/** Crops a square around the tapped spot (x, y as 0–1 of the photo) → JPEG bytes (≤ 640 px). */
export async function cropAround(file, x, y, { fraction = 0.28, size = 640 } = {}) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const side = Math.round(Math.min(bitmap.width, bitmap.height) * fraction);
    const sx = Math.max(0, Math.min(bitmap.width - side, Math.round(x * bitmap.width - side / 2)));
    const sy = Math.max(0, Math.min(bitmap.height - side, Math.round(y * bitmap.height - side / 2)));
    const out = Math.min(size, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    canvas.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.9));
    if (!blob) throw new Error('This photo could not be prepared.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close?.();
  }
}

/**
 * The AI's answer → { score: number|null, outOf: number|null, sure: boolean }.
 * Anything unclear (no number, two numbers, out of range) comes back as not sure.
 */
export function parseScoreReply(reply, hps) {
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const score = num(reply?.score);
  const outOf = num(reply?.outOf);
  let sure = reply?.sure === true && score !== null;
  if (score !== null && (score < 0 || (Number(hps) > 0 && score > Number(hps)))) sure = false;
  if (outOf !== null && Number(hps) > 0 && outOf !== Number(hps)) sure = false;
  return { score, outOf, sure };
}

const PROMPT = (hps) => `This picture is a close-up of a score a teacher wrote by hand on a learner's checked paper${Number(hps) > 0 ? ` (the highest possible score is ${hps})` : ''}.
Read the score. It may be written like "18", "18/20", "18 over 20", "-2" (meaning items wrong) or circled.
Reply ONLY with JSON: {"score": <the score as a number, or null>, "outOf": <the number after "/" or "over", or null>, "sure": <true only if the digits are clearly readable and there is exactly one score>}.
If it shows items wrong (like "-2") and the highest possible score is known, give the score (highest minus wrong). Never guess unclear digits: use "sure": false.`;

/** Reads one cropped score through the KaTuro AI service (the teacher's account). */
export async function readHandwrittenScore(cropBytes, hps) {
  const { callDeskLLM, bytesToBase64 } = await import('../desk/agent/llm.js');
  const reply = await callDeskLLM({
    prompt: PROMPT(hps),
    parts: [{ inlineData: { mimeType: 'image/jpeg', data: bytesToBase64(cropBytes) } }],
    json: true,
    maxTokens: 200,
    temperature: 0,
  });
  return parseScoreReply(reply, hps);
}
