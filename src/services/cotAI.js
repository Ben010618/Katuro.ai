import { callGeminiProxy } from './geminiConfig';
import { parseAIJson } from './aiJsonParse';

/**
 * Generate a complete PPST-aligned, COT-optimized 4As lesson plan.
 *
 * @param {object} params
 * @param {string} params.teacherName
 * @param {string} params.school
 * @param {string} params.subject
 * @param {string} params.grade
 * @param {string} params.quarter
 * @param {string} params.topic
 * @param {string} params.melc
 * @param {string} params.materials
 * @param {string} params.objectives           — optional; AI generates if blank
 * @param {Array}  params.selectedIndicators   — array of indicator objects { id, code, num, description }
 * @param {string} params.contentStandards     — optional; from DLL so COT aligns with it
 * @param {string} params.performanceStandards — optional; from DLL
 */
export async function generateCotLesson({
  teacherName, school, subject, grade, quarter, topic,
  melc, materials, objectives, selectedIndicators,
  contentStandards, performanceStandards, isRetry,
}) {
  const indicatorsText = selectedIndicators
    .map(ind => `• ${ind.code} (Indicator ${ind.num}): ${ind.description}`)
    .join('\n');

  const prompt = `
You are a master Filipino public school teacher and an expert in DepEd's RPMS-PPST system. You will generate a COMPLETE, HIGHLY DETAILED 4As lesson plan (Activity → Analysis → Abstraction → Application) using the PIVOT 4A / IDEA Instructional Process format.

This lesson plan is designed for a CLASSROOM OBSERVATION TOOL (COT) evaluation. Every section must contain embedded, visible evidence of the selected PPST indicators so the teacher can defend a high IPCRF rating.

═══════════════════════════════════════════════════════
LESSON INFORMATION
═══════════════════════════════════════════════════════
Teacher: ${teacherName || 'Teacher'}
School: ${school || 'School'}
Subject: ${subject}
Grade Level: ${grade}
Quarter: ${quarter}
Topic / Lesson: ${topic}
MELC Competency: ${melc}
Available Materials: ${materials || 'Textbook, chalk, board, printed worksheets'}
${contentStandards     ? `Content Standards: ${contentStandards}` : ''}
${performanceStandards ? `Performance Standards: ${performanceStandards}` : ''}
${objectives
  ? `Teacher's Draft Objectives:\n${objectives}\n(Refine these to align with Bloom's Taxonomy and PPST.)`
  : "(No draft objectives provided — generate all three domains using Bloom's Taxonomy.)"}

═══════════════════════════════════════════════════════
SELECTED COT INDICATORS — EMBED EVIDENCE FOR EACH
═══════════════════════════════════════════════════════
${indicatorsText}

═══════════════════════════════════════════════════════
GENERATION TASKS
═══════════════════════════════════════════════════════

TASK 1 — OBJECTIVES (Three Domains)
Write objectives using Bloom's Taxonomy. Start each with "By the end of the lesson, the learners will be able to..."
• Cognitive: Use an APPLICATION or higher verb (analyze, evaluate, create, solve, demonstrate, etc.)
• Affective: Use a value or attitude verb (appreciate, value, show, manifest, etc.)
• Psychomotor: Use a physical/demonstration verb (perform, construct, demonstrate, sketch, etc.)

TASK 2 — CONTENT & PERFORMANCE STANDARDS
Write DepEd-style statements (1-2 sentences each). If standards were provided above, align with them:
• contentStandards: What learners should know and understand about the topic
• performanceStandards: What learners should be able to do with their knowledge

TASK 3 — ENABLING COMPETENCIES
List 2-3 prerequisite skills or knowledge the learners need to have before this lesson.

TASK 4 — INTRODUCTION PHASE (15 minutes total)

A. Mood Setting / Motivation (5 minutes)
   Create an ENERGETIC, FUN game or challenge that:
   - Has a catchy title (e.g., "Topic Toss," "Concept Race," "Vocab Burst")
   - Actively involves ALL learners (not just listening)
   - Has clear teacher-led instructions with a call-and-response element
   - Connects loosely to the lesson topic
   - Embeds PPST 2.4.2 (positive, engaging environment) and PPST 3.4.2 (behavior management)

B. Pre-Test: PISA-Like Quiz (5 minutes)
   Write EXACTLY 5 multiple-choice questions with FULL A-B-C-D choices. Each question must:
   - Cover a different cognitive skill: Understanding, Prediction, Real-Life Application, Data Interpretation, Critical Thinking
   - Use PISA-style wording (contextual, realistic scenarios)
   - Have ONE clearly correct answer
   - Answers should vary (not all B or all A)

C. Review of Past Lesson (5 minutes)
   Write a brief teacher-led review connecting to a prior related lesson or prerequisite concept.

TASK 5 — ACTIVITY PHASE: "Paint Me a Picture" or similar (10 minutes)
Design a GROUP GAME or COLLABORATIVE ACTIVITY. It must:
- Have a creative title in quotes (e.g., "Concept Charades," "Science Snap," "Picture This!")
- Divide class into exactly 4 groups
- Have a clear GAME OBJECTIVE (1 sentence)
- List MATERIALS NEEDED (bulleted)
- Have STEP-BY-STEP INSTRUCTIONS (numbered, at least 5 steps)
- Include SCENARIOS the teacher will present (2-3 scenarios relevant to the topic)
- Have a SCORING RUBRIC with 4 criteria (Creativity & Expression, Accuracy of Concept, Teamwork & Cooperation, Audience Impact), each worth 25 points = 100 total
- Embed PPST 1.5.2 (HOTS), PPST 2.4.2 (engagement), PPST 3.1.2 (classroom structure)

TASK 6 — ANALYSIS PHASE: Hands-On Experiment or Exploration (15 minutes)
Design a guided inquiry/experiment activity. It must:
- Have a descriptive title in quotes
- State an OBJECTIVE (what learners will discover)
- List MATERIALS NEEDED
- Have step-by-step INSTRUCTIONS (numbered, at least 4 steps)
- Have 1 "Define Key Concepts" instruction step where teacher explains key terms
- End with guide questions that lead into Abstraction
- Embed PPST 1.1.2 (content knowledge), PPST 1.5.2 (critical thinking), PPST 3.1.2 (exploration)

TASK 7 — ABSTRACTION PHASE: Concept Introduction (10 minutes)
Write the teacher-delivered conceptual explanation. It must:
- Reference a specific module (e.g., "Quarter ${quarter} – Module 1.2: ${topic}")
- Include a HISTORICAL BACKGROUND or scientist/discovery story (2-3 sentences)
- Define at least 3 KEY TERMS with clear, age-appropriate definitions
- State the CORE PRINCIPLE or LAW in bold-worthy language
- Include a FORMULA or RULE if applicable to the subject
- Reference a specific DepEd learning resource (textbook, module page, etc.)
- Embed PPST 1.1.2 (content knowledge) and PPST 1.2.2 (research-based teaching via Ausubel, Bloom, etc.)

TASK 8 — APPLICATION PHASE: Differentiated Presentation Activity (15 minutes)
Design a DIFFERENTIATED creative output task. It must:
- Be titled "Observation & Discussion: DIFFERENTIATED ACTIVITIES"
- State GUIDE QUESTIONS (3 questions that connect the lesson to real life)
- Offer EXACTLY 5 CREATIVE PRESENTATION OPTIONS: Dramatization, Newscasting, Singing, Dancing, Other Creative Methods (poetry/comic strip/rap)
- Include a RUBRIC with 5 criteria (Accuracy of Content, Creativity & Originality, Clarity of Presentation, Performance & Engagement, Teamwork & Collaboration), each worth 20 points = 100 total
- Embed PPST 3.3.2 (differentiation), PPST 3.4.2 (managed behavior), PPST 5.1.2 (assessment)

TASK 9 — REFLECTION (Real-Life Applications)
Write a paragraph explaining the real-life importance of this lesson, then list applications in 4-5 categories (e.g., Safety, Health, Technology, Environment, Daily Life). Each category should have 2-3 bullet examples.

TASK 10 — HOMEWORK
Write ONE meaningful homework task. Format:
"Homework for Tomorrow: [Topic]
Dear Students,
To get ready for our next lesson on [topic], please bring: [checklist with 3 items using checkmark emoji ✅]
We will be [brief preview of next lesson activity]. See you tomorrow! 😊"

TASK 11 — COT INDICATOR EVIDENCE MAP
For EACH selected indicator listed above, write:
• objectiveLabel: Short label like "Objective No. 1 — [PPST code] [short phrase]"
• mov: The specific lesson sections that serve as Means of Verification (e.g., "Learning Task #1, Analysis Activity, Abstraction Section"). Be SPECIFIC, name actual activities.
• annotation: 2-3 sentences explaining HOW the lesson addressed this indicator, citing specific activities and connecting to a relevant learning theory (Bloom's Taxonomy, Constructivism, Piaget, Vygotsky, Ausubel, Kolb, Skinner, etc.)

═══════════════════════════════════════════════════════
OUTPUT FORMAT — RETURN ONLY THIS JSON. NO MARKDOWN. NO BACKTICKS. NO TEXT BEFORE OR AFTER.
═══════════════════════════════════════════════════════

{
  "objectives": {
    "cognitive": "By the end of the lesson, the learners will be able to ...",
    "affective": "By the end of the lesson, the learners will be able to ...",
    "psychomotor": "By the end of the lesson, the learners will be able to ..."
  },
  "contentStandards": "...",
  "performanceStandards": "...",
  "enablingCompetencies": ["...", "...", "..."],
  "introduction": {
    "moodSetting": {
      "gameName": "...",
      "duration": "5 minutes",
      "objective": "...",
      "instructions": "...",
      "callAndResponse": { "teacher": "...", "students": "..." }
    },
    "pretest": {
      "title": "5-Item PISA-Like Quiz on ...",
      "duration": "5 minutes",
      "items": [
        { "num": 1, "type": "Understanding the Concept", "stem": "...", "A": "...", "B": "...", "C": "...", "D": "...", "answer": "B" },
        { "num": 2, "type": "Experiment and Prediction", "stem": "...", "A": "...", "B": "...", "C": "...", "D": "...", "answer": "C" },
        { "num": 3, "type": "Real-Life Application", "stem": "...", "A": "...", "B": "...", "C": "...", "D": "...", "answer": "A" },
        { "num": 4, "type": "Data Interpretation", "stem": "...", "A": "...", "B": "...", "C": "...", "D": "...", "answer": "A" },
        { "num": 5, "type": "Critical Thinking", "stem": "...", "A": "...", "B": "...", "C": "...", "D": "...", "answer": "A" }
      ]
    },
    "reviewOfPastLesson": "..."
  },
  "activity": {
    "title": "Learning Task #1. \"...\" (...Edition)",
    "duration": "10 minutes",
    "objective": "...",
    "materials": ["...", "...", "..."],
    "instructions": ["...", "...", "...", "...", "..."],
    "scenarios": ["...", "..."],
    "rubric": [
      { "criterion": "Creativity & Expression", "description": "...", "points": 25 },
      { "criterion": "Accuracy of Science Concept", "description": "...", "points": 25 },
      { "criterion": "Teamwork & Cooperation", "description": "...", "points": 25 },
      { "criterion": "Audience Impact", "description": "...", "points": 25 }
    ]
  },
  "analysis": {
    "title": "ANALYSIS: \"...\" (...minutes)",
    "duration": "15 minutes",
    "objective": "...",
    "materials": ["...", "..."],
    "instructions": ["...", "...", "...", "..."]
  },
  "abstraction": {
    "module": "Quarter ${quarter} – Module X.X: ${topic}",
    "duration": "10 minutes",
    "historicalBackground": "...",
    "corePrinciple": "...",
    "keyTerms": [
      { "term": "...", "definition": "...", "additionalInfo": "..." },
      { "term": "...", "definition": "...", "additionalInfo": "..." },
      { "term": "...", "definition": "...", "additionalInfo": "..." }
    ],
    "reference": "..."
  },
  "application": {
    "title": "Observation & Discussion: DIFFERENTIATED ACTIVITIES",
    "duration": "15 minutes",
    "guideQuestions": ["...", "...", "..."],
    "options": [
      { "type": "Dramatization", "description": "..." },
      { "type": "Newscasting", "description": "..." },
      { "type": "Singing", "description": "..." },
      { "type": "Dancing", "description": "..." },
      { "type": "Other Creative Methods", "description": "..." }
    ],
    "rubric": [
      { "criterion": "Accuracy of Content", "description": "...", "points": 20 },
      { "criterion": "Creativity & Originality", "description": "...", "points": 20 },
      { "criterion": "Clarity of Presentation", "description": "...", "points": 20 },
      { "criterion": "Performance & Engagement", "description": "...", "points": 20 },
      { "criterion": "Teamwork & Collaboration", "description": "...", "points": 20 }
    ]
  },
  "reflection": {
    "overview": "...",
    "categories": [
      { "label": "...", "examples": ["...", "..."] },
      { "label": "...", "examples": ["...", "..."] },
      { "label": "...", "examples": ["...", "..."] },
      { "label": "...", "examples": ["...", "..."] }
    ]
  },
  "homework": "...",
  "cotEvidenceMap": [
    {
      "indicatorId": "ppst-1-1-2",
      "indicatorCode": "PPST 1.1.2",
      "indicatorNum": "1",
      "description": "Applied knowledge of content within and across curriculum teaching areas",
      "objectiveLabel": "Objective No. 1 — PPST 1.1.2 Applied Knowledge of Content",
      "mov": "Learning Objectives, Analysis Activity: \\\"...\\\", Abstraction Section",
      "annotation": "..."
    }
  ]
}
`.trim();

  const { text } = await callGeminiProxy({
    action: 'cot_gen',
    contents: [{ parts: [{ text: prompt }] }],
    temperature: 0.7,
    maxTokens: 16384,
    responseMimeType: 'application/json',
    isRetry,
  });
  if (!text) throw new Error('No content returned from Gemini. Please try again.');

  return parseAIJson(text);
}
