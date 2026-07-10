// Pure scoring logic for scanned answer sheets — no Firestore/network access,
// so it stays trivially testable and reusable between the review UI and any
// future batch/report tooling.

/**
 * Compares AI-detected answers against a quiz's stored answer key.
 * @param {Record<string,string|null>} detectedAnswers - keyed by 1-indexed question number as a string, e.g. { "1": "A", "2": null }
 * @param {string[]} answerKey - 0-indexed, e.g. ["A", "C", "B"] for questions 1, 2, 3
 * @returns {{ score: number, total: number, perQuestion: Array<{ num: number, detected: string|null, correct: string, isCorrect: boolean }> }}
 */
export function gradeScan(detectedAnswers, answerKey) {
  const total = answerKey.length;
  let score = 0;

  const perQuestion = answerKey.map((correct, i) => {
    const num = i + 1;
    const detected = detectedAnswers?.[String(num)] ?? null;
    const isCorrect = !!detected && detected === correct;
    if (isCorrect) score++;
    return { num, detected, correct, isCorrect };
  });

  return { score, total, perQuestion };
}
