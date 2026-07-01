// kaTuro Test Builder — AI-assisted Bloom's-level suggestion.
// Advisory only: the caller decides whether/how to apply the result — this
// module never touches the wizard's store directly.

import { getGeminiKey, geminiWithRetry } from './geminiConfig';
import { KEY_STAGE_LABELS } from '../config/testBuilderConfig';

const GEMINI_MODEL = 'gemini-2.5-flash';

function buildCtx({ gradeLevel, subject, keyStage, hotsFloorPct, competencies }) {
  const compLines = (competencies || [])
    .map((c) => c.text?.trim())
    .filter(Boolean)
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n');

  return `Grade Level: ${gradeLevel || ''}
Subject: ${subject || ''}
Key Stage: ${keyStage ? KEY_STAGE_LABELS[keyStage] : ''}
HOTS floor for this key stage: ${hotsFloorPct ?? 0}%
Competencies covered:
${compLines || '(none entered yet)'}`;
}

async function callGemini(prompt) {
  const key = await getGeminiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const res = await geminiWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } },
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
 * Suggests a Remembering/Understanding/Applying/Analyzing/Evaluating/Creating
 * weight split (intended to sum to 100) based on the teacher's competencies.
 * Returns { remembering, understanding, applying, analyzing, evaluating, creating, rationale }.
 */
export async function suggestCognitiveWeights(context) {
  const prompt = `You are a Filipino DepEd MATATAG curriculum expert and master teacher, helping a teacher build a Table of Specifications for a classroom test.

${buildCtx(context)}

Based on the competencies above, suggest an appropriate distribution of test items across Bloom's six cognitive levels (Remembering, Understanding, Applying, Analyzing, Evaluating, Creating). Favor the higher-order levels (Analyzing, Evaluating, Creating) when competencies call for analysis, evaluation, synthesis, or creation, and keep the HOTS floor for this key stage in mind. Favor the lower levels for competencies that are mostly recall, comprehension, or routine procedure.

Return ONLY JSON, no markdown fences, no explanation before or after, in exactly this shape:
{ "remembering": number, "understanding": number, "applying": number, "analyzing": number, "evaluating": number, "creating": number, "rationale": "one short sentence explaining the suggestion" }
The six numbers must be integers that sum to exactly 100.`;

  return callGemini(prompt);
}
