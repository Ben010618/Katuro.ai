import { getAuth } from 'firebase/auth';
import { getGeminiKey, geminiWithRetry } from './geminiConfig';
import { checkDailyLimit } from './usageLimit';

const GEMINI_MODEL = 'gemini-2.5-flash';
const DLL_DAILY_LIMIT = 10;

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
  const uid = getAuth().currentUser?.uid;
  await checkDailyLimit(uid, 'dll_gen', DLL_DAILY_LIMIT);
  const key = await getGeminiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const res = await geminiWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('');
  const m = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/s);
  if (!m) throw new Error('AI returned no valid JSON');
  return JSON.parse(m[1] ?? m[0]);
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
For each day that has a class, write ONE clear and measurable learning objective.
- Start with an action verb (Bloom's Taxonomy appropriate to the MELC)
- Be specific to that day's MELC and Content
- Achievable in one 60-minute period
- If a day is "(No class)" write an empty string ""

TASK 2 — PROCEDURE STEPS (A–J per day)
For each day that has a class, generate all 10 DepEd DLL procedure steps:
${stepDescriptions}

Rules for procedure:
- Write as a teacher filling in the DLL (instructional activities, not meta-descriptions)
- Be specific to that day's Content topic and MELC
- Step I = concrete formative assessment task
- Step J = brief homework or enrichment task
- If a day is "(No class)" use empty strings for all its steps

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
  }
}`;

  const raw = await callGemini(prompt);

  // Normalise objectives
  const objectives = {};
  for (const day of DAYS) {
    objectives[day] = raw.objectives?.[day] ?? '';
  }

  // Normalise procedure
  const procedure = {};
  for (const day of DAYS) {
    const src = raw.procedure?.[day] || {};
    procedure[day] = Object.fromEntries(STEPS.map(s => [s, src[s] || '']));
  }

  return { objectives, procedure };
}
