// kaTuro Test Builder — AI test-item generation.
// One call per TOS row (competency). Format and cognitive level per item are
// decided deterministically on our side (buildItemSlots) BEFORE the AI ever
// runs — the AI only writes content for a fixed, numbered list of slots. This
// is what guarantees "only the selected format(s) appear" rather than leaving
// it to the model's judgment.

import { callGeminiProxy } from './geminiConfig';
import { parseAIJson } from './aiJsonParse';
import { buildItemSlots } from '../utils/testBuilderCalc';
import { deriveLanguage, proficiencyLevelLabel } from '../config/testBuilderConfig';

// Filipino and Araling Panlipunan are taught in Filipino — every other
// subject defaults to English. Structural/protocol values (TRUE/FALSE, MC
// letters A-D) stay literal regardless of language so parsing stays reliable;
// only natural-language content (questions, choices, definitions, free-text
// answers) follows this rule.
//
// GMRC / EPP / ESP get a warmer, conversational Tagalog register instead of
// the more academic-formal Filipino used for Araling Panlipunan.
const CONVERSATIONAL_TAGALOG_SUBJECTS = ['gmrc', 'epp', 'esp', 'edukasyon sa pagpapakatao'];
function isConversationalTagalogSubject(subject) {
  const sl = (subject || '').toLowerCase();
  return CONVERSATIONAL_TAGALOG_SUBJECTS.some(t => sl.includes(t));
}

function langInstruction(subject) {
  const structuralNote = ' (Exception: for True or False items, still return "answer" as the literal word "TRUE" or "FALSE"; for Multiple Choice, still return "answer" as the literal letter A/B/C/D — these are structural values, not sentence content.)';
  if (isConversationalTagalogSubject(subject)) {
    return `LANGUAGE: Write ALL natural-language content — questions, choices, matchDefinition text, and free-text answers — in formal conversational Tagalog: warm and natural, the way a teacher actually speaks to guide values/character formation, while still grammatically formal (not casual slang/jejemon). This subject's medium of instruction is Tagalog.${structuralNote}`;
  }
  return deriveLanguage(subject) === 'fil'
    ? `LANGUAGE: Write ALL natural-language content — questions, choices, matchDefinition text, and free-text answers — in Filipino (Tagalog). Filipino is the medium of instruction for this subject.${structuralNote}`
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

async function callGemini(prompt, maxOutputTokens = 4096, isRetry) {
  // responseMimeType constrains Gemini to emit syntactically valid JSON
  // (no markdown fences, no trailing commas) — parseAIJson's repair
  // chain is the fallback for whatever still slips through.
  const { text } = await callGeminiProxy({
    action: 'test_builder_items',
    contents: [{ parts: [{ text: prompt }] }],
    temperature: 0.6,
    maxTokens: maxOutputTokens,
    responseMimeType: 'application/json',
    isRetry,
  });
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
export async function generateItemsForCompetency({ competencyText, cells, subject, gradeLevel, questionFormats, proficiencyLevel, contextNotes, startIndex = 0, isRetry }) {
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

  const result = await callGemini(prompt, undefined, isRetry);
  const rawItems = Array.isArray(result)
    ? result
    : (result?.items && Array.isArray(result.items) ? result.items : []);

  if (rawItems.length === 0) {
    throw new Error('AI returned an empty item list. Please try again.');
  }

  // Zip our own deterministic cognitiveLevel/format onto each item by
  // position — never trust whatever (if anything) the AI echoed back.
  // Also guarantee required properties per format so DOCX export never renders undefined.
  const items = slots.map((slot, i) => {
    const raw = rawItems[i] || {};
    const question = (raw.question || '').trim() || `Item on ${competencyText} (${slot.cognitiveLevel})`;
    let choices = raw.choices;
    let matchDefinition = raw.matchDefinition;
    let answer = (raw.answer ?? '').toString().trim();

    if (slot.format === 'Multiple Choice') {
      const srcChoices = choices && typeof choices === 'object' ? choices : {};
      choices = {
        A: String(srcChoices.A || 'Option A'),
        B: String(srcChoices.B || 'Option B'),
        C: String(srcChoices.C || 'Option C'),
        D: String(srcChoices.D || 'Option D'),
      };
      if (!['A', 'B', 'C', 'D'].includes(answer.toUpperCase())) {
        answer = 'A';
      } else {
        answer = answer.toUpperCase();
      }
    } else if (slot.format === 'True or False') {
      if (!['TRUE', 'FALSE'].includes(answer.toUpperCase())) {
        answer = 'TRUE';
      } else {
        answer = answer.toUpperCase();
      }
    } else if (slot.format === 'Matching Type') {
      matchDefinition = (matchDefinition || '').trim() || question;
    } else if (!answer) {
      answer = 'Model answer / key points';
    }

    return {
      question,
      choices,
      matchDefinition,
      answer,
      cognitiveLevel: slot.cognitiveLevel,
      format: slot.format,
    };
  });

  return { items, nextIndex: startIndex + slots.length };
}
