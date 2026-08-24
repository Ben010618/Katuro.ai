import { callGeminiProxy } from './geminiConfig';
import { parseAIJson } from './aiJsonParse';

export const DAYS      = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
export const STEPS     = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
export const STEP_LABELS = {
  A: 'Reviewing previous lesson or presenting a new lesson',
  B: 'Establishing a purpose for the lesson',
  C: 'Presenting examples/instances of the new lesson',
  D: 'Discussing new concepts and practicing new skills #1',
  E: 'Discussing new concepts and practicing new skills #2',
  F: 'Developing mastery (Leads to Formative Assessment)',
  G: 'Finding practical applications of concepts and skills in daily living',
  H: 'Making generalizations and abstractions about the lesson',
  I: 'Evaluating learning',
  J: 'Additional activities for application or remediation',
};

const TAGALOG_SUBJECTS = ['filipino', 'araling panlipunan'];
// Values/character-education subjects call for a warmer, conversational
// register than the more academic-formal Filipino used for Araling Panlipunan.
const CONVERSATIONAL_TAGALOG_SUBJECTS = ['gmrc', 'epp', 'esp', 'edukasyon sa pagpapakatao'];

function isTagalogSubject(s) {
  const sl = (s || '').toLowerCase();
  return TAGALOG_SUBJECTS.some(t => sl.includes(t)) || CONVERSATIONAL_TAGALOG_SUBJECTS.some(t => sl.includes(t));
}
function isConversationalTagalogSubject(s) {
  const sl = (s || '').toLowerCase();
  return CONVERSATIONAL_TAGALOG_SUBJECTS.some(t => sl.includes(t));
}

async function callGemini(prompt, isRetry) {
  const { text } = await callGeminiProxy({
    action: 'dll_gen',
    contents: [{ parts: [{ text: prompt }] }],
    temperature: 0.6,
    // 5 days x 10 procedure steps (A-J) + 5 objectives + the resources block is
    // ~2.5-3.5k tokens of JSON on its own; 4096 left no margin, so a slightly
    // wordier week hit MAX_TOKENS and came back as truncated, unparseable JSON.
    maxTokens: 8192,
    responseMimeType: 'application/json',
    isRetry,
  });
  return parseAIJson(text);
}

/**
 * Build a per-day lookup from a BOW list: [{ text, days }]
 * Returns an array of 5 entries (one per day Mon–Fri), each being the
 * assigned item text, or null if the total days < 5 (day unassigned).
 */
function buildDayMap(list) {
  const map = [null, null, null, null, null]; // indices 0-4 = Mon-Fri
  let slot = 0;
  for (const item of list) {
    for (let d = 0; d < item.days && slot < 5; d++, slot++) {
      map[slot] = item.text.trim();
    }
  }
  return map;
}

/**
 * Generate per-day learning objectives (one line each) AND all 10 procedure
 * steps (A–J) for each day, given multi-MELC and multi-content BOW lists.
 *
 * @param {object} params
 * @param {string} params.subject
 * @param {string} params.gradeLevel
 * @param {string} params.term
 * @param {string} params.contentStandards
 * @param {string} params.performanceStandards
 * @param {Array}  params.melcList     — [{ text, days }]
 * @param {Array}  params.contentList  — [{ text, days }]
 *
 * @returns {{ objectives: object, procedure: object }}
 *   objectives: { monday: '...', tuesday: '...', ... }
 *   procedure:  { monday: {A,...J}, tuesday: {...}, ... }
 */
export async function generateDLLProcedure({
  subject, gradeLevel, term,
  contentStandards, performanceStandards,
  melcList, contentList, isRetry,
}) {
  const tagalog    = isTagalogSubject(subject);
  const lang       = isConversationalTagalogSubject(subject) ? 'formal conversational Tagalog' : (tagalog ? 'Filipino/Tagalog' : 'English');
  const melcMap    = buildDayMap(melcList);
  const contentMap = buildDayMap(contentList);

  const DAY_NAMES_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  // Build a per-day context block for the prompt
  const dayContext = DAY_NAMES_FULL.map((name, i) => {
    const melc    = melcMap[i]    || '(No class)';
    const content = contentMap[i] || '(No class)';
    return `${name}:\n  MELC: ${melc}\n  Content: ${content}`;
  }).join('\n\n');

  // MELC summary for the header
  const melcSummary = melcList
    .filter(m => m.text.trim())
    .map((m, i) => `MELC ${i + 1} (${m.days} day${m.days !== 1 ? 's' : ''}): ${m.text.trim()}`)
    .join('\n');

  const stepDescriptions = STEPS.map(s => `${s}. ${STEP_LABELS[s]}`).join('\n');

  const prompt = `You are a DepEd (Philippines) curriculum expert writing a Daily Lesson Log (DLL).

Subject: ${subject}
Grade Level: ${gradeLevel}
Term: ${term}
Content Standards: ${contentStandards}
Performance Standards: ${performanceStandards}

Learning Competencies (MELC) this week:
${melcSummary}

Per-day assignment (MELC and Content topic for each day):
${dayContext}

Language: Write ALL content in ${lang} only.

CRITICAL INSTRUCTION: Be concise, clear, and actionable. Each procedure step (A–J) must be exactly 1 to 2 sentences of direct instructional activity. Do NOT output long paragraphs or fluff.

TASK 1 — LEARNING OBJECTIVES (one sentence per day)
Write a unique, non-empty learning objective for EVERY day that has content:
- Action verb from Bloom's Taxonomy (e.g., identify, describe, explain, compare, analyze)
- Specific to THAT DAY'S Content topic
- Achievable in one 60-minute period
- Format: "The learners will be able to [verb] [specific content]…"
- Use "" only if explicitly marked "(No class)"

TASK 2 — PROCEDURE STEPS (A–J per day)
For each day that has class, generate concise, practical steps:
${stepDescriptions}

Rules for procedure:
- Write 1–2 practical sentences per step (what the teacher and learners do)
- Specific to that day's Content topic and MELC
- Step I = quick formative assessment question/task
- Step J = short homework/enrichment task
- If a day is "(No class)" use empty strings for all its steps

TASK 3 — LEARNING RESOURCES (Section III)
Suggest concise, realistic DepEd-aligned learning resources:
- teacherGuidePages: e.g., "pp. 45–52"
- learnersMaterialPages: e.g., "pp. 38–44"
- textbookPages: e.g., "Unit 2 Chapter 3, pp. 78–85"
- lrmdsPortal: e.g., "Grade 8 Science Module 4, DepEd Learning Portal"
- otherResources: e.g., "Chart, video clips, activity sheets"

Return ONLY valid JSON (no markdown wrapper, no extra text):
{
  "objectives": {
    "monday":    "objective text or empty string",
    "tuesday":   "objective text or empty string",
    "wednesday": "objective text or empty string",
    "thursday":  "objective text or empty string",
    "friday":    "objective text or empty string"
  },
  "procedure": {
    "monday":    { "A": "...", "B": "...", "C": "...", "D": "...", "E": "...", "F": "...", "G": "...", "H": "...", "I": "...", "J": "..." },
    "tuesday":   { "A": "...", "B": "...", "C": "...", "D": "...", "E": "...", "F": "...", "G": "...", "H": "...", "I": "...", "J": "..." },
    "wednesday": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "...", "F": "...", "G": "...", "H": "...", "I": "...", "J": "..." },
    "thursday":  { "A": "...", "B": "...", "C": "...", "D": "...", "E": "...", "F": "...", "G": "...", "H": "...", "I": "...", "J": "..." },
    "friday":    { "A": "...", "B": "...", "C": "...", "D": "...", "E": "...", "F": "...", "G": "...", "H": "...", "I": "...", "J": "..." }
  },
  "resources": {
    "teacherGuidePages": "...",
    "learnersMaterialPages": "...",
    "textbookPages": "...",
    "lrmdsPortal": "...",
    "otherResources": "..."
  }
}`;

  const raw = await callGemini(prompt, isRetry);

  // Normalise objectives — fallback from day's content if AI returned empty
  const objectives = {};
  for (let i = 0; i < DAYS.length; i++) {
    const day = DAYS[i];
    const aiObj = raw?.objectives?.[day] ?? '';
    if (aiObj.trim()) {
      objectives[day] = aiObj.trim();
    } else if (contentMap[i]) {
      // AI skipped this day — derive a basic objective from content + MELC
      const content = contentMap[i];
      objectives[day] = tagalog
        ? `Natutukoy at naipapaliwanag ng mga mag-aaral ang mga pangunahing konsepto ng ${content}.`
        : `The learners will be able to identify and explain key concepts related to ${content}.`;
    } else {
      objectives[day] = '';
    }
  }

  // Normalise procedure
  const procedure = {};
  for (const day of DAYS) {
    const src = raw?.procedure?.[day] || {};
    procedure[day] = Object.fromEntries(STEPS.map(s => [s, src[s] || '']));
  }

  // Normalise resources
  const r = raw?.resources || {};
  const resources = {
    teacherGuidePages:     r.teacherGuidePages     || '',
    learnersMaterialPages: r.learnersMaterialPages || '',
    textbookPages:         r.textbookPages         || '',
    lrmdsPortal:           r.lrmdsPortal           || '',
    otherResources:        r.otherResources        || '',
  };

  return { objectives, procedure, resources };
}
