import { getAuth } from 'firebase/auth';
import { getGeminiKey, geminiWithRetry } from './geminiConfig';
import { checkDailyLimit } from './usageLimit';

const MODEL = 'gemini-2.5-flash';
const ACTION_RESEARCH_DAILY_LIMIT = 30;

export const THEME_LABELS = {
  'teaching-learning': 'Teaching and Learning',
  'child-protection':  'Child Protection',
  'hrd':               'Human Resource Development',
  'governance':        'Governance',
};

async function callGemini(prompt, maxTokens = 2048) {
  const uid = getAuth().currentUser?.uid;
  await checkDailyLimit(uid, 'action_research_ai', ACTION_RESEARCH_DAILY_LIMIT);
  const key = await getGeminiKey();
  const res = await geminiWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5, maxOutputTokens: maxTokens,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `AI error ${res.status}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function parseJSON(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const clean  = fenced ? fenced[1] : raw;
  const match  = clean.match(/(\{[\s\S]*\})/s);
  if (!match) throw new Error('No JSON in AI response — please try again.');
  return JSON.parse(match[1]);
}

// ── Phase 1: 5 research titles ────────────────────────────────────────────────

export async function generateResearchTitles({ beraTheme, problemText, subjectArea, gradeLevel }) {
  const theme = THEME_LABELS[beraTheme] ?? beraTheme;
  const text = await callGemini(
    `You are a DepEd action research expert helping Filipino public school teachers write BERF-ready action research papers.

Generate exactly 5 formal, publishable action research titles.

Context:
- BERA Theme: ${theme}
- Subject: ${subjectArea || 'Not specified'}
- Grade Level: ${gradeLevel || 'Not specified'}
- Observed Problem: ${problemText}

Rules:
- Each title must be specific, measurable, and academic in tone
- Use format variations: "[Strategy] to [Improve/Enhance] [Outcome] Among Grade [X] [Subject] Learners"
- Vary the intervention types (e.g., differentiated instruction, gamification, collaborative learning, etc.)
- Sentence case only — no ALL CAPS
- No numbering inside the title text

Return ONLY this JSON (no markdown):
{ "titles": ["title 1", "title 2", "title 3", "title 4", "title 5"] }`,
    1024
  );
  return parseJSON(text);
}

// ── Phase 2: 5 research questions ────────────────────────────────────────────

export async function generateResearchQuestions({ title, problemText, beraTheme, subjectArea, gradeLevel }) {
  const theme = THEME_LABELS[beraTheme] ?? beraTheme;
  const text = await callGemini(
    `You are a DepEd action research expert. Generate exactly 5 research questions.

Research Title: "${title}"
BERA Theme: ${theme}
Subject: ${subjectArea || 'Not specified'}
Grade Level: ${gradeLevel || 'Not specified'}
Problem: ${problemText}

Rules:
- Question 1: Describes the baseline / initial status of learners
- Question 2: Describes implementation of the intervention
- Questions 3–4: Measure effectiveness and learner outcomes
- Question 5: Determines the significance of the effect
- Specific, measurable, and answerable through data collection
- End each with a question mark

Return ONLY this JSON (no markdown):
{ "questions": ["Q1?", "Q2?", "Q3?", "Q4?", "Q5?"] }`,
    1024
  );
  return parseJSON(text);
}

// ── Phase 3: Literature review (Funnel format) ────────────────────────────────

export async function generateLiteratureReview({ title, selectedQuestions, problemText, beraTheme, subjectArea, gradeLevel, schoolName, schoolYear }) {
  const theme = THEME_LABELS[beraTheme] ?? beraTheme;
  const text = await callGemini(
    `You are an expert in academic writing for Philippine DepEd action research. Write a comprehensive Review of Related Literature using the FUNNEL FORMAT (Global → National → Local → Classroom → Synthesis).

Research Title: "${title}"
BERA Theme: ${theme}
Subject: ${subjectArea || 'Not specified'}
Grade Level: ${gradeLevel || 'Not specified'}
School: ${schoolName || 'Philippine public school'}
School Year: ${schoolYear || '2025-2026'}
Problem: ${problemText}
Research Questions:
${(selectedQuestions ?? []).map((q, i) => `${i + 1}. ${q}`).join('\n')}

Funnel sections (write 2-4 paragraphs each):
1. GLOBAL PERSPECTIVE — International studies, global trends, and foundational theories (cite Vygotsky, Bloom, Piaget, or other relevant authors as appropriate)
2. NATIONAL PERSPECTIVE — Philippine education context, DepEd policies (MATATAG, K-12), national BERF-funded research
3. LOCAL PERSPECTIVE — Regional or provincial data, Schools Division studies, local education statistics
4. CLASSROOM PERSPECTIVE — Direct connection to the teacher's specific classroom problem
5. SYNTHESIS — 1-2 paragraphs connecting all perspectives to justify this action research

Write in formal academic language. Each section must reference at least 2 studies or frameworks.

Return ONLY this JSON (no markdown):
{
  "globalPerspective": "...",
  "nationalPerspective": "...",
  "localPerspective": "...",
  "classroomPerspective": "...",
  "synthesis": "..."
}`,
    4096
  );
  return parseJSON(text);
}

// ── Phase 4: Action plan ──────────────────────────────────────────────────────

export async function generateActionPlan({ title, selectedQuestions, problemText, beraTheme, subjectArea, gradeLevel, schoolName, schoolYear }) {
  const theme = THEME_LABELS[beraTheme] ?? beraTheme;
  const text = await callGemini(
    `You are a DepEd action research expert. Create a comprehensive, implementable action plan for a Filipino public school teacher.

Research Title: "${title}"
BERA Theme: ${theme}
Subject: ${subjectArea || 'Not specified'}
Grade Level: ${gradeLevel || 'Not specified'}
School: ${schoolName || 'Philippine public school'}
School Year: ${schoolYear || '2025-2026'}
Problem: ${problemText}
Research Questions:
${(selectedQuestions ?? []).map((q, i) => `${i + 1}. ${q}`).join('\n')}

Return ONLY this JSON (no markdown):
{
  "objectives": ["SMART objective 1", "SMART objective 2", "SMART objective 3"],
  "interventionDescription": "2–3 sentences describing what the teacher will do differently...",
  "timeline": [
    { "phase": "Pre-Implementation", "duration": "Week 1–2", "activities": ["activity 1", "activity 2"], "outputs": "Baseline data, prepared materials" },
    { "phase": "Implementation",     "duration": "Week 3–8", "activities": ["activity 1", "activity 2"], "outputs": "Session logs, observation notes" },
    { "phase": "Post-Implementation","duration": "Week 9–10","activities": ["activity 1", "activity 2"], "outputs": "Post-assessment data, analysis" }
  ],
  "resources": ["Human resources", "Materials (specific)", "Budget considerations"],
  "successIndicators": ["Indicator 1 with target %", "Indicator 2", "Indicator 3"],
  "ethicalConsiderations": "Brief statement on learner privacy, parental consent, and ethical conduct of the research..."
}`,
    3072
  );
  return parseJSON(text);
}

// ── Phase 5: Data collection methodology ─────────────────────────────────────

export async function generateDataCollection({ title, selectedQuestions, beraTheme, subjectArea, gradeLevel }) {
  const theme = THEME_LABELS[beraTheme] ?? beraTheme;
  const text = await callGemini(
    `You are a DepEd educational research expert in measurement and evaluation. Design a practical data collection methodology for a Filipino public school teacher.

Research Title: "${title}"
BERA Theme: ${theme}
Subject: ${subjectArea || 'Not specified'}
Grade Level: ${gradeLevel || 'Not specified'}
Research Questions:
${(selectedQuestions ?? []).map((q, i) => `${i + 1}. ${q}`).join('\n')}

Return ONLY this JSON (no markdown):
{
  "primaryTool": {
    "name": "e.g., Pre-test/Post-test Achievement Test",
    "type": "Quantitative",
    "description": "...",
    "rationale": "Why this is the best tool for this research...",
    "administration": "How and when to administer...",
    "sampleItems": ["Sample test item 1", "Sample test item 2", "Sample test item 3"]
  },
  "secondaryTool": {
    "name": "e.g., Classroom Observation Checklist",
    "type": "Qualitative",
    "description": "...",
    "sampleItems": ["Criterion/item 1", "Criterion/item 2", "Criterion/item 3"]
  },
  "statisticalTreatment": [
    { "formula": "Mean and Standard Deviation", "purpose": "Measure central tendency of pre/post scores", "interpretation": "Higher mean post-test score indicates improvement" },
    { "formula": "Paired-samples t-test",        "purpose": "Determine significant difference between pre and post scores", "interpretation": "p < 0.05 indicates significant improvement" },
    { "formula": "Percentage / Frequency",        "purpose": "Describe distribution of qualitative responses", "interpretation": "Higher percentage indicates stronger trend" }
  ],
  "analysisApproach": "Narrative description of how you will analyze all data and how analysis answers each research question..."
}`,
    3072
  );
  return parseJSON(text);
}

// ── Research Instruments ─────────────────────────────────────────────────────

export async function generateResearchInstrument({ instrumentType, title, subjectArea, gradeLevel, selectedQuestions, problemText }) {
  const qText = (selectedQuestions ?? []).map((q, i) => `${i + 1}. ${q}`).join('\n');
  const ctx = `Research Title: "${title}"
Subject: ${subjectArea || 'Not specified'}
Grade Level: ${gradeLevel || 'Not specified'}
Problem: ${problemText || 'Not specified'}
Research Questions:
${qText}`;

  const prompts = {
    questionnaire: `You are a DepEd educational measurement expert. Create a complete, ready-to-use QUESTIONNAIRE for a Philippine public school action research.

${ctx}

Generate a complete, photocopy-ready Likert-scale questionnaire with:
- Part I: Respondent profile (3-4 demographic items)
- Part II: Main assessment (15 Likert items, 1=Strongly Disagree to 5=Strongly Agree)
- Part III: Open-ended reflection (2-3 questions)

Return ONLY this JSON (no markdown):
{
  "title": "Questionnaire on [Topic] for Grade [X] [Subject] Learners",
  "instructions": "Direction: ...",
  "sections": [
    {
      "sectionTitle": "Part I – Respondent Profile",
      "type": "profile",
      "items": [
        { "num": 1, "text": "Name (optional): ___________" },
        { "num": 2, "text": "Grade and Section: ___________" },
        { "num": 3, "text": "Age: ___  Sex: ___ Male  ___ Female" }
      ]
    },
    {
      "sectionTitle": "Part II – [Main Topic] Assessment",
      "type": "likert",
      "scale": "5 = Strongly Agree  4 = Agree  3 = Neutral  2 = Disagree  1 = Strongly Disagree",
      "items": [
        { "num": 1, "text": "I understand the lessons better because of the intervention." },
        { "num": 2, "text": "..." }
      ]
    },
    {
      "sectionTitle": "Part III – Open-Ended Reflection",
      "type": "open",
      "items": [
        { "num": 1, "text": "What did you find most helpful about the [intervention]? Why?" },
        { "num": 2, "text": "What suggestions do you have to improve the [intervention]?" }
      ]
    }
  ]
}`,

    'interview-guide': `You are a DepEd qualitative research expert. Create a complete SEMI-STRUCTURED INTERVIEW GUIDE for a Philippine public school action research.

${ctx}

Generate a complete, ready-to-use interview guide with an opening script, 3 thematic sections with main questions and probing questions, and a closing statement.

Return ONLY this JSON (no markdown):
{
  "title": "Semi-Structured Interview Guide on [Topic]",
  "purpose": "This interview aims to gather qualitative data on...",
  "estimatedTime": "15–20 minutes",
  "introduction": "Good morning/afternoon. I am [name], a teacher-researcher at [school]. Thank you for participating in this study. Your responses will be kept strictly confidential and will only be used for research purposes. Feel free to answer honestly. There are no right or wrong answers. May I record this interview for note-taking purposes?",
  "sections": [
    {
      "sectionTitle": "A. Background and Context",
      "questions": [
        { "num": 1, "mainQuestion": "How would you describe your learning experience in [subject] before the intervention?", "probes": ["Can you give a specific example?", "How did that make you feel as a learner?"] },
        { "num": 2, "mainQuestion": "...", "probes": ["..."] }
      ]
    },
    {
      "sectionTitle": "B. Experience with the Intervention",
      "questions": [
        { "num": 3, "mainQuestion": "How did you find the [intervention] activities?", "probes": ["What specific parts did you enjoy or find challenging?", "How was it different from your usual class activities?"] }
      ]
    },
    {
      "sectionTitle": "C. Perceived Impact and Suggestions",
      "questions": [
        { "num": 5, "mainQuestion": "Do you think the [intervention] helped you understand [subject] better? How?", "probes": ["Can you describe a moment when you realized you learned something new?"] },
        { "num": 6, "mainQuestion": "What improvements would you suggest for the [intervention]?", "probes": ["..."] }
      ]
    }
  ],
  "closing": "Thank you very much for your time and candid responses. Your insights are very valuable to this research and will help improve how we teach [subject] to future learners."
}`,

    checklist: `You are a DepEd educational measurement expert. Create a complete CLASSROOM OBSERVATION CHECKLIST for a Philippine public school action research.

${ctx}

Generate a complete observation checklist with 3–4 thematic sections, each with 5–6 specific, observable indicators. Use a 4-point rating scale.

Return ONLY this JSON (no markdown):
{
  "title": "Classroom Observation Checklist: [Topic/Intervention]",
  "purpose": "To observe and document the presence and frequency of [teaching/learning behaviors] during implementation of [intervention].",
  "instructions": "Put a check mark (✓) in the column that best describes the observed behavior or practice. Rate each indicator objectively based on what is actually observed.",
  "scale": "4 = Always (90–100%)  |  3 = Often (70–89%)  |  2 = Sometimes (50–69%)  |  1 = Rarely/Never (below 50%)",
  "sections": [
    {
      "sectionTitle": "A. Teacher's Instructional Practices",
      "indicators": [
        { "num": 1, "indicator": "Teacher clearly presents learning objectives at the start of the lesson." },
        { "num": 2, "indicator": "Teacher uses varied teaching strategies aligned to the intervention." },
        { "num": 3, "indicator": "Teacher provides clear instructions before each activity." },
        { "num": 4, "indicator": "Teacher gives timely and constructive feedback to learners." },
        { "num": 5, "indicator": "Teacher manages the class effectively during implementation." }
      ]
    },
    {
      "sectionTitle": "B. Learner Engagement and Participation",
      "indicators": [
        { "num": 6, "indicator": "Learners actively participate in the activities." },
        { "num": 7, "indicator": "Learners collaborate and help each other during group tasks." },
        { "num": 8, "indicator": "Learners ask questions and seek clarification when needed." }
      ]
    },
    {
      "sectionTitle": "C. Effectiveness of the Intervention Materials",
      "indicators": [
        { "num": 11, "indicator": "Materials used are appropriate for the grade level and subject." },
        { "num": 12, "indicator": "Learning activities are aligned to the research objectives." }
      ]
    }
  ],
  "scoringGuide": "Total Score: 48–56 = Outstanding  |  40–47 = Very Satisfactory  |  32–39 = Satisfactory  |  24–31 = Needs Improvement  |  Below 24 = Poor"
}`,

    'pretest-posttest': `You are a DepEd educational measurement expert. Create a complete 20-item ACHIEVEMENT TEST (usable as both Pretest and Posttest) for a Philippine public school action research.

${ctx}

Generate 20 multiple-choice items (4 choices each: A, B, C, D) aligned to the research topic and grade level. Vary cognitive levels: recall (30%), understanding (40%), application (30%). Write clear, unambiguous items with one correct answer.

Return ONLY this JSON (no markdown):
{
  "title": "Achievement Test in [Subject]: [Topic]",
  "instructions": "Directions: Read each item carefully. Choose the letter of the BEST answer. Write your answer on the blank before each number.",
  "timeAllotment": "30 minutes",
  "items": [
    {
      "num": 1,
      "question": "Which of the following best describes [concept]?",
      "choices": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "answer": "B",
      "competency": "[Specific learning competency from DepEd curriculum]"
    }
  ],
  "answerKey": ["B", "C", "A", "D"]
}`,
  };

  const text = await callGemini(prompts[instrumentType] ?? prompts.questionnaire, 6000);
  return parseJSON(text);
}

// ── Phase 6: Findings & report ────────────────────────────────────────────────

export async function interpretFindings({ title, selectedQuestions, problemText, beraTheme, subjectArea, gradeLevel, schoolName, schoolYear, rawData }) {
  const theme = THEME_LABELS[beraTheme] ?? beraTheme;
  const text = await callGemini(
    `You are a DepEd action research expert. Analyze the teacher's collected data and write the complete Findings, Discussion, Conclusions, and Recommendations chapter.

Research Title: "${title}"
BERA Theme: ${theme}
Subject: ${subjectArea || 'Not specified'}
Grade Level: ${gradeLevel || 'Not specified'}
School: ${schoolName || 'Philippine public school'}
School Year: ${schoolYear || '2025-2026'}
Problem: ${problemText}

Research Questions:
${(selectedQuestions ?? []).map((q, i) => `${i + 1}. ${q}`).join('\n')}

Raw Data / Results Collected by the Teacher:
${rawData}

Instructions:
- Interpret the data in relation to EACH research question
- Use formal, academic language appropriate for DepEd research
- Be specific about what the data shows and what it means for learners
- Recommendations must be actionable

Return ONLY this JSON (no markdown):
{
  "findings": [
    { "questionNumber": 1, "question": "...", "analysis": "3-4 sentence interpretation...", "significance": "What this means for the classroom..." }
  ],
  "discussion": "2-3 paragraphs connecting findings to literature and the research problem...",
  "conclusions": ["Conclusion 1 directly answering RQ", "Conclusion 2", "Conclusion 3"],
  "recommendations": [
    { "for": "Teachers",               "text": "Specific, actionable recommendation..." },
    { "for": "School Administrators",  "text": "Specific, actionable recommendation..." },
    { "for": "Future Researchers",     "text": "Specific, actionable recommendation..." }
  ],
  "reflections": "1-2 paragraph personal reflection from the teacher-researcher on conducting this action research..."
}`,
    5000
  );
  return parseJSON(text);
}
