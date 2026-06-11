const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

/**
 * Generate fully-explained, DepEd-module-grounded slides via Gemini + Google Search.
 *
 * Returns:
 *   slides:     Array<{ layout, title, bullets, notes }>
 *   references: string[]   — sources Gemini used (DepEd URLs / module titles)
 *
 * Each bullet is a full explanatory sentence (not a keyword), strictly sourced
 * from the DepEd MATATAG Learner's Module / Curriculum Guide found by search.
 */
export async function generateSlides({
  title, subject, gradeLevel, numSlides, style,
  competencyText = '', sessions = [], objectives = '',
}) {
  if (!GEMINI_KEY) throw new Error('VITE_GEMINI_API_KEY is not set — add it to .env');

  const sessionBlock = sessions.length
    ? sessions.map(s => [
        `Session ${s.day} — ${s.bloomsLevel}: ${s.objective}`,
        s.prelesson           ? `Hook: ${s.prelesson}`                     : '',
        s.flow                ? `Activities:\n${s.flow}`                   : '',
        s.formativeAssessment ? `Assessment: ${s.formativeAssessment}`     : '',
        s.extendedLearning    ? `Extended: ${s.extendedLearning}`          : '',
      ].filter(Boolean).join('\n')).join('\n\n')
    : objectives ? `Objectives: ${objectives}` : '';

  const styleGuide = {
    Academic:  'formal academic language; define terms precisely; include examples from the module',
    Modern:    'clear direct sentences; bold key terms; professional but readable',
    Engaging:  'conversational explanations; connect to student experience; use examples and analogies',
  }[style] ?? 'clear and informative';

  const prompt = `You are a Filipino DepEd MATATAG curriculum expert building a detailed classroom PowerPoint.

STEP 1 — RESEARCH USING GOOGLE SEARCH
Search the web for the official DepEd Philippines MATATAG materials for this lesson:
• Subject: ${subject}
• Grade Level: ${gradeLevel}
${competencyText ? `• Competency: ${competencyText}` : ''}

Specifically search for:
1. DepEd MATATAG Learner's Module for ${subject} ${gradeLevel} — the exact content, definitions, illustrations, and examples in that module
2. DepEd Curriculum Guide for ${subject} ${gradeLevel} — the learning competency details and content standards
3. Any official DepEd learning materials portal (lrmds.deped.gov.ph, depedresources.com, or deped.gov.ph)

Record every URL and source title you find — you will list them in the references field.

STEP 2 — WRITE THE PRESENTATION
Using ONLY what you found in Step 1, generate a detailed classroom presentation.

LESSON DETAILS
Title: "${title}"
Subject: ${subject} | Grade Level: ${gradeLevel}
Style: ${style} — ${styleGuide}
${competencyText ? `\nLearning Competency: ${competencyText}` : ''}
${sessionBlock ? `\nTeacher's ILAW Plan:\n${sessionBlock}` : ''}

SLIDE COUNT: Generate exactly ${numSlides} slides (not counting title or closing — those are automatic).

SLIDE TYPES
"content" — has title + 4 to 6 bullets. Use for most slides.
"section" — has only a bold title, bullets = []. Use 2–3 times to separate major parts.

BULLET FORMAT (CRITICAL — read carefully)
Every bullet in a "content" slide MUST:
• Be a complete sentence (15–30 words) that fully explains the concept
• Come directly from the DepEd module content found in Step 1
• Include a key term in bold using **asterisks** if it is a definition: e.g. "**Photosynthesis** is the process by which…"
• Give an example or illustration from the module where relevant
• NOT be a vague keyword like "Definition of cell" — expand it fully

CONTENT STRUCTURE
1. Open with a "section" slide: Learning Competency / Lesson Overview
2. State the specific competency and objectives (content slide)
3. Cover all key concepts from the DepEd module — definitions, explanations, examples
4. Include a practical activity or application slide based on the module
5. Formative assessment or check-for-understanding slide
6. Summary / key takeaways slide
7. Distribute remaining slides across the module's topic sequence

SPEAKER NOTES
Each content slide: write 2 sentences the teacher says aloud — what to emphasize and a classroom connection.

REFERENCES FIELD
List every source you actually used:
• Full title of DepEd module (e.g. "Science 8 Learner's Module, Quarter 1, Module 2 — pp. 5–18")
• Curriculum Guide citation (e.g. "DepEd MATATAG CG — Science Grade 8, 2023")
• Any URL from lrmds.deped.gov.ph or official DepEd sites

RETURN FORMAT
Return ONLY the JSON below. No markdown fences, no extra text, nothing outside the JSON object.

{
  "slides": [
    {
      "layout": "section",
      "title": "...",
      "bullets": [],
      "notes": ""
    },
    {
      "layout": "content",
      "title": "...",
      "bullets": [
        "**Key Term** is a complete explanatory sentence from the DepEd module.",
        "Another full sentence with explanation, example, or illustration.",
        "Another full sentence."
      ],
      "notes": "Teacher says this aloud. And a classroom connection."
    }
  ],
  "references": [
    "DepEd MATATAG Learner's Module — ${subject} ${gradeLevel}, Quarter X, Module Y",
    "DepEd Curriculum Guide — ${subject} ${gradeLevel} (2023)",
    "https://lrmds.deped.gov.ph/..."
  ]
}`;

  const res = await fetch(GEMINI_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature:     0.4,
        maxOutputTokens: 8192,
        thinkingConfig:  { thinkingBudget: 2048 },
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini error ${res.status}: ${err?.error?.message ?? res.statusText}`);
  }

  const data = await res.json();

  // Gemini with search grounding may return multiple parts — join them
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text  = parts.map(p => p.text ?? '').join('');

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI did not return JSON — please try again.');

  let parsed;
  try { parsed = JSON.parse(match[0]); }
  catch {
    // Try to recover from truncation
    const partial = match[0].replace(/,\s*$/, '') + '}}';
    try { parsed = JSON.parse(partial); }
    catch { throw new Error('AI returned malformed JSON — please try again.'); }
  }

  if (!Array.isArray(parsed.slides)) throw new Error('AI response missing slides array.');

  const slides = parsed.slides.slice(0, numSlides).map(s => ({
    layout:  s.layout === 'section' ? 'section' : 'content',
    title:   String(s.title   ?? ''),
    bullets: Array.isArray(s.bullets) ? s.bullets.map(String) : [],
    notes:   String(s.notes   ?? ''),
  }));

  const references = Array.isArray(parsed.references)
    ? parsed.references.map(String).filter(Boolean)
    : [];

  return { slides, references };
}
