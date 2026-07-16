/**
 * Presentation AI — calls Gemini directly from the client.
 *
 * NOTE: Once Firebase Functions are deployed, swap generateOutline and
 * expandSlides back to httpsCallable wrappers for full server-side security.
 * The functions/index.js is already written and ready to deploy:
 *   cd functions && npm install
 *   cd .. && firebase functions:secrets:set GEMINI_API_KEY
 *   firebase deploy --only functions
 */

import { getGeminiKey, geminiWithRetry } from './geminiConfig';
import { parseAIJson } from './aiJsonParse';
const GEMINI_MODEL = 'gemini-2.5-flash';

const TAGALOG_SUBJECTS = ['filipino', 'esp', 'araling panlipunan', 'edukasyon sa pagpapakatao'];
function isTagalog(subject) {
  return TAGALOG_SUBJECTS.some(t => (subject || '').toLowerCase().includes(t));
}

async function callGemini(prompt, { temperature = 0.5, maxTokens = 2048 } = {}) {
  const key = await getGeminiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const res = await geminiWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini ${res.status}: ${err?.error?.message ?? res.statusText}`);
  }
  const data  = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map(p => p.text ?? '').join('');
}

function parseJSON(text, label) {
  try {
    return parseAIJson(text);
  } catch {
    throw new Error(`AI returned malformed JSON for ${label} — please try again.`);
  }
}

// ── Stage 1: Generate outline (free, ~1 API call) ─────────────────────────────
export async function generateOutline({ subject, gradeLevel, melcCode, topic, slideCount = 12 }) {
  const lang = isTagalog(subject) ? 'Filipino/Tagalog' : 'English';

  const prompt = `You are kaTuro, an AI lesson outline planner for Philippine public school teachers following the K–12 MELC curriculum.
Generate a structured slide OUTLINE only — not full content. Output ONLY valid JSON, no markdown, no explanation.

Rules:
- Start with a title slide and an objectives slide (expand: false for both)
- End with a summary slide and an activity or assessment slide
- Middle slides cover topic content based on the MELC competency
- Slide types: title | objectives | concept | example | illustration | activity | assessment | summary
- title, objectives, summary → expand: false (template, no AI expansion needed)
- All others → expand: true
- keyPoints: 2–3 short phrases hinting at the slide content
- Total slides: exactly ${slideCount}
- Language: ALL text output in ${lang}

Subject: ${subject}
Grade Level: ${gradeLevel}
MELC Code: ${melcCode || 'N/A'}
Topic: ${topic}
Number of slides: ${slideCount}

Return ONLY this JSON structure:
{
  "lesson": { "subject": "", "gradeLevel": "", "melcCode": "", "topic": "" },
  "slides": [
    { "id": 1, "type": "title", "title": "", "keyPoints": [], "expand": false }
  ]
}`;

  const text   = await callGemini(prompt, { temperature: 0.3, maxTokens: 2048 });
  const parsed = parseJSON(text, 'outline');

  if (!Array.isArray(parsed.slides)) throw new Error('Outline missing slides array.');

  const outline = parsed.slides.map((s, i) => ({
    id:        s.id        ?? i + 1,
    type:      s.type      ?? 'concept',
    title:     String(s.title ?? ''),
    keyPoints: Array.isArray(s.keyPoints) ? s.keyPoints.map(String) : [],
    expand:    s.expand !== false,
  }));

  return { outline, cached: false };
}

// ── Stage 2: Expand slides in parallel (~N API calls) ─────────────────────────
export async function expandSlides({ subject, gradeLevel, melcCode, topic, slides, style = 'Academic' }) {
  const lang      = isTagalog(subject) ? 'Filipino/Tagalog' : 'English';
  const styleGuide = {
    Academic:  'formal, define terms precisely, include DepEd module examples',
    Modern:    'clear direct sentences, bold key terms, professional and readable',
    Engaging:  'conversational, connect to student experience, use analogies and questions',
  }[style] ?? 'clear and informative';

  const needsExpansion = slides.filter(s => s.expand !== false);
  const templateSlides = slides.filter(s => s.expand === false);

  async function expandOne(slide) {
    const useBody = ['example', 'illustration', 'activity', 'assessment'].includes(slide.type);

    const prompt = `You are kaTuro, an AI lesson content writer for Philippine DepEd K–12 MELC curriculum.
Expand this ${slide.type} slide for a lesson on "${topic}", ${gradeLevel}, ${subject}${melcCode ? `, MELC: ${melcCode}` : ''}.
Style: ${style} — ${styleGuide}
Language: Write ALL content in ${lang}.

Slide scaffold: ${JSON.stringify(slide)}

Rules:
- Body/bullets combined: 60–120 words maximum (this is a presentation, not a module)
- Short declarative sentences only
${useBody
  ? '- body: short paragraph (3–5 sentences explaining the concept/activity)\n- bullets: leave as []'
  : '- bullets: 3–5 items, each a complete explanatory sentence (15–25 words)\n- body: leave as ""'}
- teacherNote: 1–2 sentences the teacher says aloud while showing this slide
- suggestedVisual: brief description of a helpful diagram or image
- headline: 5–8 word subtitle reinforcing the slide title

Return ONLY this JSON (no markdown, no explanation):
{
  "id": ${slide.id},
  "type": "${slide.type}",
  "title": "",
  "headline": "",
  "body": "",
  "bullets": [],
  "teacherNote": "",
  "suggestedVisual": ""
}`;

    const text     = await callGemini(prompt, { temperature: 0.6, maxTokens: 1024 });
    const expanded = parseJSON(text, `slide ${slide.id}`);

    return {
      id:              slide.id,
      type:            String(expanded.type            ?? slide.type),
      title:           String(expanded.title           ?? slide.title),
      headline:        String(expanded.headline        ?? ''),
      body:            String(expanded.body            ?? ''),
      bullets:         Array.isArray(expanded.bullets) ? expanded.bullets.map(String) : [],
      teacherNote:     String(expanded.teacherNote     ?? ''),
      suggestedVisual: String(expanded.suggestedVisual ?? ''),
    };
  }

  // All content slides expand simultaneously
  const results = await Promise.allSettled(needsExpansion.map(expandOne));

  const expanded = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    // Graceful fallback — use key points as bullets
    return {
      id:              needsExpansion[i].id,
      type:            needsExpansion[i].type,
      title:           needsExpansion[i].title,
      headline:        '',
      body:            '',
      bullets:         needsExpansion[i].keyPoints ?? [],
      teacherNote:     '',
      suggestedVisual: '',
    };
  });

  // Fill template slides without AI
  const filled = templateSlides.map(s => ({
    id:              s.id,
    type:            s.type,
    title:           s.title,
    headline:        s.type === 'objectives' ? `MELC: ${melcCode || 'See competency'}` : '',
    body:            '',
    bullets:         s.keyPoints ?? [],
    teacherNote:     '',
    suggestedVisual: '',
  }));

  return { slides: [...expanded, ...filled].sort((a, b) => a.id - b.id) };
}

// ── Map expanded slides → pptxExport format ───────────────────────────────────
export function toExportSlides(expandedSlides) {
  return expandedSlides.map(s => {
    const isSection = ['title', 'objectives', 'summary'].includes(s.type);
    const isVisual  = ['illustration', 'example', 'activity'].includes(s.type);
    return {
      layout:          isSection ? 'section' : isVisual ? 'visual' : 'content',
      type:            s.type,
      title:           s.title,
      headline:        s.headline || '',
      bullets:         s.bullets?.length ? s.bullets : (s.body ? [s.body] : []),
      notes:           s.teacherNote || '',
      suggestedVisual: s.suggestedVisual || '',
    };
  });
}
