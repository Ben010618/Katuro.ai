// kaTuro Test Builder — AI test-item generation.
// One call per TOS row (competency). Format and cognitive level per item are
// decided deterministically on our side (buildItemSlots) BEFORE the AI ever
// runs — the AI only writes content for a fixed, numbered list of slots. This
// is what guarantees "only the selected format(s) appear" rather than leaving
// it to the model's judgment.

import { getGeminiKey, geminiWithRetry } from './geminiConfig';
import { parseAIJson } from './aiJsonParse';
import { buildItemSlots } from '../utils/testBuilderCalc';
import { deriveLanguage, proficiencyLevelLabel } from '../config/testBuilderConfig';

const GEMINI_MODEL = 'gemini-2.5-flash';

// Filipino, ESP, and Araling Panlipunan are taught in Filipino — every other
// subject defaults to English. Structural/protocol values (TRUE/FALSE, MC
// letters A-D) stay literal regardless of language so parsing stays reliable;
// only natural-language content (questions, choices, definitions, free-text
// answers) follows this rule.
function langInstruction(subject) {
  return deriveLanguage(subject) === 'fil'
    ? 'LANGUAGE: Write ALL natural-language content — questions, choices, matchDefinition text, and free-text answers — in Filipino (Tagalog). Filipino is the medium of instruction for this subject. (Exception: for True or False items, still return "answer" as the literal word "TRUE" or "FALSE"; for Multiple Choice, still return "answer" as the literal letter A/B/C/D — these are structural values, not sentence content.)'
    : 'LANGUAGE: Write ALL content in English. English is the medium of instruction for this subject.';
}

// Optional class-average calibration — nudges phrasing/distractor difficulty
// without changing the cognitive level or format a slot already fixes.
function proficiencyInstruction(proficiencyLevel) {
  const label = proficiencyLevelLabel(proficiencyLevel);
  if (!label) return '';
  return `\nCLASS PROFICIENCY: This class's current average score is around ${label}. Calibrate item difficulty to match — for lower averages, favor clearer wording and less subtle distractors; for higher averages, favor more nuanced phrasing and more plausible distractors. Do not change the required cognitive level or format of any slot.`;
}

// Free-text classroom context from the teacher's Setup-step Context Box —
// student-specific notes to ground phrasing/examples/emphasis in, without
// overriding the fixed cognitive level or format of any slot.
function contextInstruction(contextNotes) {
  const trimmed = contextNotes?.trim();
  if (!trimmed) return '';
  return `\nCLASSROOM CONTEXT (from the teacher): ${trimmed}\nFactor this into phrasing, examples, and emphasis wherever relevant. Do not change the required cognitive level or format of any slot.`;
}

const LEVEL_LABELS = {
  remembering: 'Remembering', understanding: 'Understanding', applying: 'Applying',
  analyzing: 'Analyzing', evaluating: 'Evaluating', creating: 'Creating',
};

const FORMAT_SPEC = {
  'Multiple Choice': '4 choices (A-D), exactly one correct. Return "choices": {"A":"","B":"","C":"","D":""} and "answer" as the correct letter.',
  'True or False':   'A single factual/conceptual statement as "question". Return "answer" as "TRUE" or "FALSE".',
  'Matching Type':   'A short term/concept as "question" and its definition/description as "matchDefinition". No "answer" needed.',
  'Identification':  'A short-answer prompt as "question". Return "answer" as a single word or short phrase.',
  'Enumeration':     'A prompt asking learners to list/name multiple items as "question". Return "answer" as a comma-separated list.',
  'Essay':           'An open-ended prompt as "question". Return "answer" as a brief model-answer / key points summary.',
};

async function callGemini(prompt, maxOutputTokens = 4096) {
  const key = await getGeminiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const res = await geminiWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // responseMimeType constrains Gemini to emit syntactically valid JSON
      // (no markdown fences, no trailing commas) — parseAIJson's repair
      // chain is the fallback for whatever still slips through.
      generationConfig: { temperature: 0.6, maxOutputTokens, thinkingConfig: { thinkingBudget: 0 }, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error?.message || `AI error ${res.status}`);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  return parseAIJson(text);
}

/**
 * Generates test items for one TOS row. `cells` is the [R,U,Ap,An,Ev,Cr]
 * count array (same shape computeTOS produces). `questionFormats` is the
 * teacher's Setup-step selection — every returned item's format comes from
 * this list, never the AI's choice. `startIndex` continues the round-robin
 * format assignment across competencies (pass the running total item count).
 * Returns { items, nextIndex }.
 */
export async function generateItemsForCompetency({ competencyText, cells, subject, gradeLevel, questionFormats, proficiencyLevel, contextNotes, startIndex = 0 }) {
  const slots = buildItemSlots(cells, questionFormats, startIndex);
  if (slots.length === 0) return { items: [], nextIndex: startIndex };

  const slotList = slots
    .map((s, i) => `${i + 1}. Cognitive level: ${LEVEL_LABELS[s.cognitiveLevel]}. Format: ${s.format}. ${FORMAT_SPEC[s.format]}`)
    .join('\n');

  const prompt = `You are a Filipino DepEd MATATAG curriculum expert and master teacher, writing test items for a classroom examination.

Subject: ${subject || ''}
Grade Level: ${gradeLevel || ''}
Competency (MELC): ${competencyText}
${langInstruction(subject)}${proficiencyInstruction(proficiencyLevel)}${contextInstruction(contextNotes)}

Ground every item strictly in this Most Essential Learning Competency (MELC) — do not test anything outside it. Match the depth, phrasing, and rigor of DepEd's own instructional materials for this competency:
- DepEd PIVOT 4A learning modules (their Explore/Firm Up/Deepen/Transfer question style and how they scaffold from simple recall toward application)
- DepEd Alternative Delivery Mode (ADM) self-learning modules (their clear, self-contained, learner-friendly phrasing, since a learner may answer this without a teacher present to clarify)
Keep language age- and grade-appropriate for a Filipino public school classroom, consistent with how MELCs are assessed in those materials.

Write exactly ${slots.length} items, one for each required slot below, IN THIS EXACT ORDER. Each slot's cognitive level and format are fixed — do not change or reorder them, just write the content.

${slotList}

Return ONLY JSON, no markdown fences, no explanation before or after, in exactly this shape:
{ "items": [ { "question": "...", "choices": { "A": "...", "B": "...", "C": "...", "D": "..." }, "matchDefinition": "...", "answer": "..." } ] }
Include "choices" only for Multiple Choice slots and "matchDefinition" only for Matching Type slots. The items array must have exactly ${slots.length} entries, in the same order as the slot list.`;

  const result = await callGemini(prompt);
  const rawItems = result.items || [];

  // Zip our own deterministic cognitiveLevel/format onto each item by
  // position — never trust whatever (if anything) the AI echoed back.
  const items = slots.map((slot, i) => ({
    ...rawItems[i],
    cognitiveLevel: slot.cognitiveLevel,
    format: slot.format,
  }));

  return { items, nextIndex: startIndex + slots.length };
}
