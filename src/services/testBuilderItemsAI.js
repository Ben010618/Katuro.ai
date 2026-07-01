// kaTuro Test Builder — AI test-item generation.
// One call per TOS row (competency): asks for exactly the item count the TOS
// already computed for that competency, broken down per cognitive level, and
// lets the AI pick the best-fit format per item from the teacher's allowed list.

import { getGeminiKey, geminiWithRetry } from './geminiConfig';
import { COGNITIVE_LEVELS } from '../config/testBuilderConfig';

const GEMINI_MODEL = 'gemini-2.5-flash';

async function callGemini(prompt, maxOutputTokens = 3072) {
  const key = await getGeminiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const res = await geminiWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error?.message || `AI error ${res.status}`);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/s);
  if (!m) throw new Error('AI returned no valid JSON');
  return JSON.parse(m[1] ?? m[0]);
}

/**
 * Generates test items for one TOS row. `cells` is the [R,U,Ap,An,Ev,Cr]
 * count array in COGNITIVE_LEVELS order (same shape computeTOS produces).
 * Returns a flat array of items — empty if the row has no items to generate.
 */
export async function generateItemsForCompetency({ competencyText, cells, subject, gradeLevel, questionFormats }) {
  const breakdown = COGNITIVE_LEVELS
    .map((l, i) => (cells[i] > 0 ? `${cells[i]} ${l.label}` : null))
    .filter(Boolean)
    .join(', ');

  const totalCount = cells.reduce((a, b) => a + b, 0);
  if (!breakdown || totalCount === 0) return [];

  const formats = questionFormats?.length ? questionFormats : ['Multiple Choice'];

  const prompt = `You are a Filipino DepEd MATATAG curriculum expert and master teacher, writing test items for a classroom examination.

Subject: ${subject || ''}
Grade Level: ${gradeLevel || ''}
Competency: ${competencyText}

Write exactly these items, matched to Bloom's cognitive level: ${breakdown}.
Allowed item formats — choose the best fit per item, using ONLY formats from this list: ${formats.join(', ')}.
- "Multiple Choice": 4 choices (A-D), exactly one correct.
- "True or False": a single factual/conceptual statement; answer is "TRUE" or "FALSE".
- "Matching Type": a short term/concept as "question", its definition/description as "matchDefinition".
- "Identification": a short-answer prompt; answer is a single word or short phrase.
- "Enumeration": a prompt asking learners to list/name multiple items; answer is a comma-separated list.
- "Essay": an open-ended prompt; answer is a brief model-answer / key points summary.
Favor Multiple Choice / True or False / Identification for Remembering, Understanding, and Applying items. Favor Essay, Enumeration, Matching Type, or analytical Multiple Choice for Analyzing, Evaluating, and Creating items.

Return ONLY JSON, no markdown fences, no explanation before or after, in exactly this shape:
{ "items": [ { "cognitiveLevel": "remembering", "format": "Multiple Choice", "question": "...", "choices": { "A": "...", "B": "...", "C": "...", "D": "..." }, "matchDefinition": "...", "answer": "..." } ] }
cognitiveLevel must be one of: remembering, understanding, applying, analyzing, evaluating, creating.
Omit "choices" for anything other than Multiple Choice, and omit "matchDefinition" for anything other than Matching Type.
The items array must contain exactly ${totalCount} items, matching the level breakdown exactly.`;

  const result = await callGemini(prompt);
  return result.items || [];
}
