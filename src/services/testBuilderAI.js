// kaTuro Test Builder — AI-assisted Bloom's-level suggestion.
// Advisory only: the caller decides whether/how to apply the result — this
// module never touches the wizard's store directly.

import { callGeminiProxy } from './geminiConfig';
import { parseAIJson } from './aiJsonParse';
import { KEY_STAGE_LABELS } from '../config/testBuilderConfig';

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

async function callGemini(prompt, isRetry) {
  const { text } = await callGeminiProxy({
    action: 'test_builder_blooms',
    contents: [{ parts: [{ text: prompt }] }],
    temperature: 0.4,
    maxTokens: 512,
    responseMimeType: 'application/json',
    isRetry,
  });
  return parseAIJson(text);
}

/**
 * Suggests a Remembering/Understanding/Applying/Analyzing/Evaluating/Creating
 * weight split (intended to sum to 100) based on the teacher's competencies.
 * Returns { remembering, understanding, applying, analyzing, evaluating, creating, rationale }.
 */
export async function suggestCognitiveWeights(context, { isRetry } = {}) {
  const prompt = `You are a Filipino DepEd MATATAG curriculum expert and master teacher, helping a teacher build a Table of Specifications for a classroom test.

${buildCtx(context)}

Based on the competencies above, suggest an appropriate distribution of test items across Bloom's six cognitive levels (Remembering, Understanding, Applying, Analyzing, Evaluating, Creating). Favor the higher-order levels (Analyzing, Evaluating, Creating) when competencies call for analysis, evaluation, synthesis, or creation, and keep the HOTS floor for this key stage in mind. Favor the lower levels for competencies that are mostly recall, comprehension, or routine procedure.

Return ONLY JSON, no markdown fences, no explanation before or after, in exactly this shape:
{ "remembering": number, "understanding": number, "applying": number, "analyzing": number, "evaluating": number, "creating": number, "rationale": "one short sentence explaining the suggestion" }
The six numbers must be integers that sum to exactly 100.`;

  return callGemini(prompt, isRetry);
}
