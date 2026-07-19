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

const TAGALOG_SUBJECTS = ['filipino', 'esp', 'araling panlipunan', 'edukasyon sa pagpapakatao'];
function isTagalogSubject(s) {
  const sl = (s || '').toLowerCase();
  return TAGALOG_SUBJECTS.some(t => sl.includes(t));
}

async function callGemini(prompt) {
  const { text } = await callGeminiProxy({
    action: 'dll_gen',
    contents: [{ parts: [{ text: prompt }] }],
    temperature: 0.7,
    maxTokens: 8192,
    responseMimeType: 'application/json',
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
  melcList, contentList,
}) {
  const lang       = isTagalogSubject(subject) ? 'Filipino/Tagalog' : 'English';
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

TASK 1 — LEARNING OBJECTIVES (one per day)
CRITICAL: You MUST write a unique, non-empty learning objective for EVERY day that has content — even when multiple days share the same MELC. Differentiate each day's objective by focusing on that day's specific Content topic.
- Start with a Bloom's Taxonomy action verb appropriate to the lesson stage (e.g., identify, describe, explain, compare, analyze, evaluate)
- Be specific to THAT DAY'S Content topic (not just the MELC)
- Keep it achievable in one 60-minute period (one verb, one concept)
- Write in complete sentence form: "The learners will be able to [verb] [specific content]…"
- Only write an empty string "" if the day is explicitly marked "(No class)"

TASK 2 — PROCEDURE STEPS (A–J per day)
For each day that has a class, generate all 10 DepEd DLL procedure steps:
${stepDescriptions}

Rules for procedure:
- Write as a teacher filling in the DLL (instructional activities, not meta-descriptions)
- Be specific to that day's Content topic and MELC
- Step I = concrete formative assessment task
- Step J = brief homework or enrichment task
- If a day is "(No class)" use empty strings for all its steps

TASK 3 — LEARNING RESOURCES (Section III of the DLL)
Based on the subject, grade level, and MELC above, suggest realistic DepEd-aligned learning resources:
- teacherGuidePages: Specific page range from the official DepEd Teacher's Guide for this subject and grade (e.g., "pp. 45–52")
- learnersMaterialPages: Page range from the DepEd Learner's Materials / LM (e.g., "pp. 38–44")
- textbookPages: Additional textbook reference with unit/chapter and pages (e.g., "Unit 2 Chapter 3, pp. 78–85")
- lrmdsPortal: Name of a specific material available on the DepEd LRMDS portal (e.g., "Grade 8 Science – Module 4: Chemical Reactions, DepEd Learning Portal")
- otherResources: Supplementary materials — be specific (e.g., "Chart of the periodic table; video: 'Evidence of Chemical Change' via YouTube; activity sheets")

Return ONLY valid JSON (no markdown, no explanation):
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

  const raw = await callGemini(prompt);

  // Normalise objectives — fallback from day's content if AI returned empty
  const objectives = {};
  for (let i = 0; i < DAYS.length; i++) {
    const day = DAYS[i];
    const aiObj = raw.objectives?.[day] ?? '';
    if (aiObj.trim()) {
      objectives[day] = aiObj.trim();
    } else if (contentMap[i]) {
      // AI skipped this day — derive a basic objective from content + MELC
      const content = contentMap[i];
      objectives[day] = lang === 'Filipino/Tagalog'
        ? `Natutukoy at naipapaliwanag ng mga mag-aaral ang mga pangunahing konsepto ng ${content}.`
        : `The learners will be able to identify and explain key concepts related to ${content}.`;
    } else {
      objectives[day] = '';
    }
  }

  // Normalise procedure
  const procedure = {};
  for (const day of DAYS) {
    const src = raw.procedure?.[day] || {};
    procedure[day] = Object.fromEntries(STEPS.map(s => [s, src[s] || '']));
  }

  // Normalise resources
  const r = raw.resources || {};
  const resources = {
    teacherGuidePages:     r.teacherGuidePages     || '',
    learnersMaterialPages: r.learnersMaterialPages || '',
    textbookPages:         r.textbookPages         || '',
    lrmdsPortal:           r.lrmdsPortal           || '',
    otherResources:        r.otherResources        || '',
  };

  return { objectives, procedure, resources };
}
