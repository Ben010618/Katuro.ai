// ── Gemini configuration ─────────────────────────────────────────────────────
// AI calls run through the generateAI Cloud Function (services/geminiConfig.js)
// instead of hitting Gemini directly from the browser — the key never reaches
// the client, and the server enforces a per-user daily limit per action.
import { callGeminiProxy } from './geminiConfig';
import { parseAIJson } from './aiJsonParse';

export const AI_ENABLED = true; // key is managed server-side; always available to a signed-in user

// Subjects officially taught in Filipino medium per DepEd MATATAG curriculum.
// All other subjects use English as the medium of instruction.
const FILIPINO_MEDIUM = new Set(['Filipino', 'Araling Panlipunan', 'GMRC / ESP', 'Makabansa']);

// Values/character-education subjects (GMRC / ESP) call for a warmer,
// conversational register than the more academic-formal Filipino used for
// Araling Panlipunan — closer to how these are actually taught in class.
const CONVERSATIONAL_TAGALOG_MEDIUM = new Set(['GMRC / ESP']);

function langInstruction(subject) {
  if (CONVERSATIONAL_TAGALOG_MEDIUM.has(subject)) {
    return 'LANGUAGE: Write ALL content in formal conversational Tagalog — warm and natural, the way a teacher actually speaks to guide values/character formation, while still being grammatically formal (not casual slang/jejemon). This subject\'s medium of instruction is Tagalog.';
  }
  return FILIPINO_MEDIUM.has(subject)
    ? 'LANGUAGE: Write ALL content in Filipino (Tagalog). Filipino is the medium of instruction for this subject.'
    : 'LANGUAGE: Write ALL content in English. English is the medium of instruction for this subject.';
}

async function call(action, prompt, opts = {}) {
  const { text } = await callGeminiProxy({
    action,
    contents: [{ parts: [{ text: prompt }] }],
    temperature: opts.temperature ?? 0.4,
    maxTokens: opts.maxOutputTokens ?? 4096,
    // responseMimeType constrains Gemini to emit syntactically valid JSON
    // (no markdown fences, no trailing commas) at generation time — this
    // is the primary defense against "invalid_json" failures; parseAIJson's
    // repair chain is only the fallback for whatever still slips through.
    ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    isRetry: opts.isRetry,
  });
  return text;
}

const trunc = (arr, n, maxChars = 120) =>
  (arr || []).slice(0, n).map((s) => String(s).slice(0, maxChars)).join("; ");

/**
 * Suggest a short quiz title from lesson context. Returns a plain string.
 */
export async function suggestQuizTitle(context) {
  const text = await call(
    'quiz_title',
    `Suggest a short, specific quiz title (6 words max) for a ${context.gradeLevel} ${context.subject} quiz on "${context.topic}". Return ONLY the title text, no quotes, no punctuation at the end.`,
    { temperature: 0.7, maxOutputTokens: 30 }
  );
  return text.trim().replace(/^["']|["']$/g, "");
}

/**
 * Generate quiz questions + answer key from a saved context object.
 * lessonPlan (optional) is the parsed 4As plan object — used for richer question content.
 * Returns { questions: [{ num, text, choices:{A,B,C,D[,E]}, answer, competency }] }
 */
export async function generateQuizAI(context, numQ, numChoices, customPrompt = "", lessonPlan = null, { isRetry } = {}) {
  const letters     = ["A", "B", "C", "D", "E"].slice(0, numChoices);
  const choiceShape = letters.map((l) => `"${l}":""`).join(",");

  const absDay = lessonPlan?.days?.find((d) => d.phase === "Abstraction");
  const appDay = lessonPlan?.days?.find((d) => d.phase === "Application");
  const keyPoints = (absDay?.keyPoints  ?? lessonPlan?.abstraction?.keyPoints)  || [];
  const defs      = (absDay?.definitions ?? lessonPlan?.abstraction?.definitions) || [];
  const tasks     = (appDay?.tasks       ?? lessonPlan?.application?.tasks)       || [];
  const planSection = lessonPlan
    ? `\nKey Concepts: ${trunc(keyPoints, 5)}\nDefinitions: ${defs.slice(0, 4).map((d) => `${d.term}: ${String(d.definition).slice(0, 100)}`).join("; ")}\nTasks: ${trunc(tasks, 4)}`
    : "";

  const text = await call(
    'quiz_gen',
    `Create a ${numQ}-item multiple choice quiz.
Subject: ${context.subject} | Topic: ${String(context.topic).slice(0, 150)} | Grade: ${context.gradeLevel}
Objectives: ${trunc(context.objectives, 4)}
Competencies: ${trunc(context.competencies, 4)}${planSection}
${customPrompt ? `Teacher instructions: ${String(customPrompt).slice(0, 300)}` : ""}

Rules: vary difficulty (recall, comprehension, application), clear language, one unambiguous correct answer per item.

Return ONLY JSON (no markdown fences):
{"questions":[{"num":1,"text":"...","choices":{${choiceShape}},"answer":"A","competency":"..."}]}`,
    { temperature: 0.75, maxOutputTokens: 4096, json: true, isRetry }
  );
  return parseAIJson(text);
}

/**
 * Unpack a MATATAG learning competency across N teaching days using Bloom's Taxonomy.
 * Returns { competencyCeiling, fullLadder, sessions: [{ day, date, bloomsLevel, objective }] }
 */
export async function unpackCompetency({ competencyText, content, contentStandards, learningContext = '', subject, gradeLevel, term, numberOfDays, selectedDates, isRetry }) {
  const prompt = `You are a Filipino DepEd MATATAG curriculum expert and master teacher.

A teacher has provided this learning competency:
"${competencyText}"
${content          ? `\nContent (Subject Matter): ${content}`          : ''}${contentStandards ? `\nContent Standards: ${contentStandards}` : ''}
Subject: ${subject}
Grade Level: ${gradeLevel}
Term: ${term}
Number of teaching days selected: ${numberOfDays}
Teaching dates: ${selectedDates.join(', ')}
${learningContext ? `\nLEARNING CONTEXT (teacher's specific classroom/school/community situation):
${learningContext}
→ When writing learning objectives (Task 4), make the action and context of each objective relevant to this setting. Use examples, scenarios, or materials that fit this specific context.` : ''}

TASK 1 — DETECT THE CEILING LEVEL

Read the competency carefully.
Identify the HIGHEST Bloom's Taxonomy level the competency itself requires.

Use these action verbs to detect the level:

REMEMBER: define, identify, list, name, recall, recognize, state, label, enumerate, describe (when purely factual)
UNDERSTAND: describe (conceptually), explain, summarize, classify, compare, discuss, interpret, distinguish, give examples of, differentiate
APPLY: solve, use, demonstrate, calculate, construct, show, conduct, investigate, perform, illustrate, apply, compute, measure, produce
ANALYZE: analyze, examine, differentiate, compare and contrast, break down, relate, categorize, infer, deduce, dissect, determine, separate
EVALUATE: evaluate, assess, judge, justify, argue, defend, critique, recommend, appraise, prioritize, decide, rate, determine the value of
CREATE: design, create, formulate, produce, develop, compose, plan, construct, generate, propose, invent, build, devise

TASK 2 — BUILD THE DOWNWARD LADDER

The ceiling IS the highest level the competency requires.
Unpack DOWNWARD from ceiling to Remember.
Each lower level is a prerequisite that scaffolds up toward the ceiling.

Full ladder for each ceiling:
REMEMBER  → ladder: [Remember]
UNDERSTAND → ladder: [Remember, Understand]
APPLY     → ladder: [Remember, Understand, Apply]
ANALYZE   → ladder: [Remember, Understand, Apply, Analyze]
EVALUATE  → ladder: [Remember, Understand, Apply, Analyze, Evaluate]
CREATE    → ladder: [Remember, Understand, Apply, Analyze, Evaluate, Create]

TASK 3 — MATCH LADDER TO TEACHING DAYS

Full ladder has L levels.
Teacher selected N = ${numberOfDays} days.

Rule 1 — If N equals L: Use the full ladder exactly. Perfect match.

Rule 2 — If N is LESS than L (teacher chose fewer days than ladder length):
Remove levels from the BOTTOM of the ladder.
The ceiling MUST always be the LAST day.

Examples:
APPLY ceiling (R,U,Ap) with N=2 days: Remove Remember → [Understand, Apply]
ANALYZE ceiling (R,U,Ap,An) with N=2 days: Remove Remember+Understand → [Apply, Analyze]
EVALUATE ceiling (R,U,Ap,An,Ev) with N=3 days: Remove R+U → [Apply, Analyze, Evaluate]

Rule 3 — If N is MORE than L (teacher chose more days than ladder length):
Use full ladder for the first L days.
For remaining (N minus L) days, add:
Extra day 1: "[Ceiling] — Review and Practice"
Extra day 2: "[Ceiling] — Enrichment Activity"
Extra day 3+: "[Ceiling] — Extension Task"

Example:
APPLY ceiling (3 levels) with N=5 days:
Day 1: Remember
Day 2: Understand
Day 3: Apply ← ceiling
Day 4: Apply — Review and Practice
Day 5: Apply — Enrichment Activity

TASK 4 — WRITE THE LEARNING OBJECTIVES

For each day in the final matched ladder, write ONE specific measurable learning objective.

${langInstruction(subject)}

Writing rules:
- Start the objective with a Bloom's action verb appropriate for that level
- Be specific to the competency content
- Must be achievable in one 60-minute Filipino public school class period
- Write in clear direct active voice
- Filipino classroom context (public school)
- Do not repeat the same verb across sessions

Bloom's verb suggestions per level:
Remember: recall, identify, name, list, state
Understand: explain, describe, distinguish, summarize, give examples of
Apply: demonstrate, calculate, conduct, solve, illustrate, use, perform
Analyze: analyze, compare, differentiate, examine, relate, categorize
Evaluate: evaluate, assess, justify, recommend, judge, defend
Create: design, create, formulate, develop, construct, propose

For each session also write:
- keyContentFocus: 3–6 words naming the specific concept or skill taught that day (e.g. "Chemical reaction indicators", "Acid-base identification")
- activityType: the primary instructional strategy for that day. Choose the most fitting:
  "Concept Introduction" (Remember days — direct instruction, lecture-demo)
  "Guided Discussion" (Understand days — Socratic questioning, concept unpacking)
  "Guided Practice" (Apply day 1 — worked examples, teacher-led activity)
  "Independent Practice" (Apply day 2+ — individual/pair seatwork)
  "Collaborative Analysis" (Analyze days — group problem-solving, case study)
  "Performance Task" (Evaluate/Create days — output-based, project)
  "Review and Practice" (extra Review days)
  "Enrichment Activity" (extra Enrichment days)

RETURN FORMAT

Return ONLY this JSON structure.
No markdown. No backticks. No explanation.
No text before or after the JSON.
Just the raw JSON object:

{
  "competencyCeiling": "Apply",
  "fullLadder": ["Remember", "Understand", "Apply"],
  "sessions": [
    {
      "day": 1,
      "date": "${selectedDates[0] || 'Day 1'}",
      "bloomsLevel": "Remember",
      "objective": "Write the specific objective text for this session here",
      "keyContentFocus": "3–6 word concept focus",
      "activityType": "Concept Introduction"
    },
    {
      "day": 2,
      "date": "${selectedDates[1] || 'Day 2'}",
      "bloomsLevel": "Understand",
      "objective": "Write the specific objective text for this session here",
      "keyContentFocus": "3–6 word concept focus",
      "activityType": "Guided Discussion"
    }
  ]
}`;

  const { text, finishReason } = await callGeminiProxy({
    action: 'ilaw_unpack',
    contents: [{ parts: [{ text: prompt }] }],
    temperature: 0.3,
    maxTokens: 8192,
    responseMimeType: 'application/json',
    isRetry,
  });
  const rawText = text?.trim();
  if (!rawText) {
    console.error('unpackCompetency: empty response, finishReason:', finishReason);
    throw new Error('AI returned an empty response. Retrying…');
  }

  let parsed;
  try {
    parsed = parseAIJson(rawText);
  } catch (e) {
    console.error('unpackCompetency parse failed. Raw response:', rawText);
    throw new Error('AI returned invalid format. Retrying…', { cause: e });
  }

  if (!parsed.sessions || !Array.isArray(parsed.sessions)) {
    throw new Error('AI response missing sessions array');
  }
  if (!parsed.competencyCeiling) {
    throw new Error('AI response missing competencyCeiling');
  }

  return parsed;
}

/**
 * Generate full ILAW lesson content for ONE session.
 * session: { day, date, bloomsLevel, objective }
 * context: { subject, gradeLevel, term, weekNumber, lessonName, competencyText, totalSessions, allSessions }
 * Returns the session object merged with: prelesson, flow, resources, integration,
 * formativeAssessment, extendedLearning, reflection
 */
export async function generateIlawSession(session, context, { isRetry } = {}) {
  const {
    subject, gradeLevel, term, weekNumber, lessonName,
    competencyText, content, contentStandards, learningContext = '',
    totalSessions, allSessions,
  } = context;

  const VALID_BLOOMS  = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
  const bloomsBase    = VALID_BLOOMS.find(l => session.bloomsLevel.startsWith(l))
                     ?? session.bloomsLevel.split(/\s*[-—–]\s*/)[0].trim();
  const sessionExtra  = bloomsBase.length < session.bloomsLevel.length
    ? session.bloomsLevel.slice(bloomsBase.length).replace(/^\s*[-—–]+\s*/, '').trim() || null
    : null;

  const sessionMap = (allSessions || [])
    .map(s => `  Session ${s.day} (${s.date}): ${s.bloomsLevel} — ${s.objective}`)
    .join('\n');

  const prompt = `You are a Filipino DepEd MATATAG curriculum expert writing a concise ILAW lesson plan.

STYLE RULE — BE BRIEF AND DIRECT. Every field must be short and immediately usable. No filler phrases, no repetition, no long paragraphs. A teacher reading this should get the point in one glance.

FULL LESSON CONTEXT
Subject: ${subject} | Grade: ${gradeLevel} | Term: ${term} | Week: ${weekNumber}
Lesson: ${lessonName}${content ? ` | Content: ${content}` : ''}${contentStandards ? ` | Standards: ${contentStandards}` : ''}
Competency: ${competencyText}
${learningContext ? `\nLEARNING CONTEXT (teacher's specific classroom/school/community):
${learningContext}
→ ALL activities, examples, materials, and assessments in this session MUST be contextualized to this setting. Use locally relevant scenarios, materials available in this context, and language appropriate for this community. Do NOT use generic examples that ignore this context.` : ''}

ALL ${totalSessions} SESSIONS:
${sessionMap}

YOUR TASK — Session ${session.day} only
Date: ${session.date} | Bloom's: ${bloomsBase}${sessionExtra ? ` (${sessionExtra})` : ''}
Objective: ${session.objective}

${langInstruction(subject)}

FIELD SPECIFICATIONS (follow word limits strictly)

prelesson — MAX 2 SHORT sentences:
  Sentence 1: Quick hook or review that connects to today's objective. Be specific, no generic openers.
  Sentence 2: One sentence stating what learners will do today.

flow — EXACTLY 5 lines, each ONE action sentence:
  Format: "1. Meeting Time 1: [what teacher does — max 15 words]\\n2. Work Period 1: [activity — max 15 words]\\n3. Meeting Time 2: [what teacher checks — max 12 words]\\n4. Work Period 2: [independent task — max 15 words]\\n5. Indoor/Outdoor: [closing action — max 10 words]"
  Each step is a direct instruction — specific to the competency, no generic text.

resources — BULLET LIST, one item per line, max 5 items:
  Include only what is actually needed: Curriculum Guide, LM page numbers if known, and materials for the flow above.

integration — 1 sentence max:
  Name the other subject/real-world connection. Write N/A if none.

formativeAssessment — MAX 2 sentences:
  Sentence 1: Specific, observable check (e.g. "Exit ticket: learners write one…").
  Sentence 2: One accommodation for struggling learners. No generic language.

extendedLearning — MAX 2 sentences:
  Sentence 1: Specific take-home task at ${bloomsBase} level, connected to today's objective.
  Sentence 2: How learners will show or submit it (if applicable).

RETURN FORMAT
Return ONLY valid JSON. No markdown, no backticks, no explanation, no text before or after.

{
  "prelesson": "...",
  "flow": "1. Meeting Time 1: ...\\n2. Work Period 1: ...\\n3. Meeting Time 2: ...\\n4. Work Period 2: ...\\n5. Indoor/Outdoor: ...",
  "resources": "...",
  "integration": "...",
  "formativeAssessment": "...",
  "extendedLearning": "..."
}`;

  let text, finishReason;
  try {
    ({ text, finishReason } = await callGeminiProxy({
      action: 'ilaw_session',
      contents: [{ parts: [{ text: prompt }] }],
      temperature: 0.6,
      maxTokens: 3072,
      responseMimeType: 'application/json',
      isRetry,
    }));
  } catch (err) {
    console.error(`generateIlawSession (session ${session.day}) API error:`, err);
    if (!err.reason && err.status !== 429) err.reason = 'api_error';
    throw err;
  }

  const rawText = text?.trim();
  if (!rawText) {
    console.error(`generateIlawSession (session ${session.day}) empty response, finishReason:`, finishReason);
    const err = new Error(`Session ${session.day} — empty response from AI`);
    err.reason = finishReason === 'SAFETY' ? 'safety_block' : 'empty_response';
    throw err;
  }

  let parsed;
  try {
    parsed = parseAIJson(rawText);
  } catch (e) {
    console.error(`generateIlawSession (session ${session.day}) parse failed (finishReason: ${finishReason}):`, rawText);
    const err = new Error(`Session ${session.day} — AI returned invalid JSON`, { cause: e });
    err.reason = finishReason === 'MAX_TOKENS' ? 'truncated' : 'invalid_json';
    throw err;
  }

  return {
    ...session,
    prelesson:           parsed.prelesson           || '',
    flow:                parsed.flow                || '',
    resources:           parsed.resources           || '',
    integration:         parsed.integration         || 'N/A',
    formativeAssessment: parsed.formativeAssessment || '',
    extendedLearning:    parsed.extendedLearning    || '',
    reflection:          '*(To be filled after the lesson)*\nReflection Prompt: What worked? What confused learners? What will you adjust next time?',
  };
}
