import { getGeminiKey } from './geminiConfig';
const GEMINI_MODEL = 'gemini-2.5-flash';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const STEPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

const STEP_LABELS = {
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

async function callGemini(prompt) {
  const key = await getGeminiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const res = await fetch(url, {
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

const TAGALOG_SUBJECTS = ['filipino', 'esp', 'araling panlipunan', 'edukasyon sa pagpapakatao'];

function isTagalogSubject(subject) {
  const s = (subject || '').toLowerCase();
  return TAGALOG_SUBJECTS.some(t => s.includes(t));
}

function emptyDay() {
  return Object.fromEntries(STEPS.map(s => [s, '']));
}

/**
 * Generate all 10 Procedure steps (A–J) for each day of the week.
 * Returns { monday: {A,B,...J}, tuesday: {...}, ... }
 */
export async function generateDLLProcedure({
  subject, gradeLevel, term,
  contentStandards, performanceStandards, melc,
  dailyContent,
}) {
  const lang = isTagalogSubject(subject) ? 'Filipino/Tagalog' : 'English';
  const dayLines = [
    `Monday: ${dailyContent.mon || '(No class)'}`,
    `Tuesday: ${dailyContent.tue || '(No class)'}`,
    `Wednesday: ${dailyContent.wed || '(No class)'}`,
    `Thursday: ${dailyContent.thu || '(No class)'}`,
    `Friday: ${dailyContent.fri || '(No class)'}`,
  ].join('\n');

  const stepDescriptions = STEPS
    .map(s => `${s}. ${STEP_LABELS[s]}`)
    .join('\n');

  const prompt = `
You are a DepEd (Philippines) curriculum expert writing a Daily Lesson Log (DLL) in professional Filipino public-school style.

Subject: ${subject}
Grade Level: ${gradeLevel}
Term: ${term}

Content Standards: ${contentStandards}
Performance Standards: ${performanceStandards}
MELC: ${melc}

Daily Content (topic per day):
${dayLines}

For each day that has a topic, generate ALL 10 procedure steps in DepEd DLL style (concise, action-oriented, 1–3 sentences each):
${stepDescriptions}

Language: Write ALL procedure step content in ${lang} only.

Rules:
- Write as a teacher would fill in the DLL (instructional activities, not meta-descriptions).
- Be specific to the day's content/topic.
- Step I (Evaluating learning) = a concrete formative assessment task.
- Step J (Additional activities) = a brief homework or enrichment task.
- If a day is "(No class)", use empty strings for all its steps.

Return ONLY valid JSON (no markdown, no explanation):
{
  "monday":    { "A": "...", "B": "...", "C": "...", "D": "...", "E": "...", "F": "...", "G": "...", "H": "...", "I": "...", "J": "..." },
  "tuesday":   { "A": "...", ... },
  "wednesday": { "A": "...", ... },
  "thursday":  { "A": "...", ... },
  "friday":    { "A": "...", ... }
}`;

  const raw = await callGemini(prompt);

  // Normalise: ensure all 5 days and all 10 steps exist
  const result = {};
  for (const day of DAYS) {
    const src = raw[day] || {};
    result[day] = Object.fromEntries(STEPS.map(s => [s, src[s] || '']));
  }
  return result;
}

export { STEP_LABELS, STEPS, DAYS };
