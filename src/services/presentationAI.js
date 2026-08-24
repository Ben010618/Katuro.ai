/**
 * Presentation AI Service — Powered by NVIDIA NIM AI Engine
 *
 * Dedicated pipeline for PPT Lesson Presentation Generation:
 * 1. Stage 1: Outline Generation (NVIDIA Llama 3.3 / Nemotron)
 * 2. Stage 2: Rich Slide Content Expansion & Teacher Script Notes
 * 3. Stage 3: Educational Image Generation for Visual Slides (NVIDIA SDXL)
 * 4. Stage 4: Layout & Visual Design Mapping for PPTX Export
 *
 * Falls back to Firebase Cloud Functions (Gemini) if NVIDIA key is not configured.
 */

import app, { auth } from '../firebase';
import { reportAIError } from './db';
import { getNvidiaConfig, callNvidiaChat, generateNvidiaImage } from './nvidiaConfig';
import { parseAIJson } from './aiJsonParse';

// Language detection helpers for Philippine Curriculum
const TAGALOG_SUBJECTS = ['filipino', 'araling panlipunan', 'makabansa'];
const CONVERSATIONAL_TAGALOG_SUBJECTS = ['gmrc', 'epp', 'esp', 'edukasyon sa pagpapakatao'];

function isTagalog(subject) {
  const s = (subject || '').toLowerCase();
  return TAGALOG_SUBJECTS.some(t => s.includes(t)) || CONVERSATIONAL_TAGALOG_SUBJECTS.some(t => s.includes(t));
}

function isConversationalTagalog(subject) {
  const s = (subject || '').toLowerCase();
  return CONVERSATIONAL_TAGALOG_SUBJECTS.some(t => s.includes(t));
}

function langLabel(subject) {
  if (isConversationalTagalog(subject)) return 'formal conversational Tagalog (warm, teacher-student dialogue)';
  return isTagalog(subject) ? 'Filipino/Tagalog' : 'English';
}

// Cloud Function fallback wrapper
async function callPresentationFn(name, data, timeout) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const call = httpsCallable(getFunctions(app, 'us-central1'), name, { timeout });
  try {
    const res = await call(data);
    return res.data;
  } catch (err) {
    const code = err?.code || '';
    const rawMessage = err?.message || '';
    const looksGeneric = !rawMessage || rawMessage.toLowerCase() === code.replace('functions/', '').toLowerCase();
    const isUnexplainedFailure = (code === 'functions/internal' || code === 'functions/unavailable') && looksGeneric;

    if (code === 'functions/internal' || code === 'functions/unavailable' || code === 'functions/deadline-exceeded') {
      reportAIError({
        uid: auth.currentUser?.uid,
        feature: name,
        errorMessage: `[${code || 'no-code'}]${isUnexplainedFailure ? ' (unexplained — possible deploy/IAM issue)' : ''} ${rawMessage}`,
        inputContext: { subject: data?.subject, topic: data?.topic },
      }).catch(() => {});
    }

    if (isUnexplainedFailure) {
      throw new Error('Something went wrong on our end. We’ve been notified — please try again shortly.', { cause: err });
    }
    // FIX: Provide a clear, actionable message for deadline-exceeded errors.
    // The old behaviour threw the raw Firebase error which shows as "deadline-exceeded"
    // with no guidance. Teachers reported PPT generation as "not working" because of this.
    if (code === 'functions/deadline-exceeded') {
      throw new Error(
        'Slide generation took too long. Try reducing the number of slides to 10 or fewer, or try again in a moment.',
        { cause: err }
      );
    }
    throw err;
  }
}

// ── Stage 1: Generate outline (NVIDIA NIM or Cloud Function Fallback) ─────────
export async function generateOutline({ subject, gradeLevel, melcCode, topic, slideCount = 14 }) {
  const nvidiaConfig = await getNvidiaConfig();

  // If NVIDIA key is available, use NVIDIA NIM
  if (nvidiaConfig.apiKey) {
    const lang = langLabel(subject);
    const systemPrompt = `You are kaTuro AI, an elite lesson presentation architect for Philippine K-12 DepEd MATATAG curriculum.
Design an engaging, structured presentation outline for classroom teaching.
Output ONLY a valid JSON object. Do NOT include markdown fences, code blocks, or conversational commentary.`;

    const userPrompt = `Subject: ${subject}
Grade Level: ${gradeLevel}
MELC / Competency: ${melcCode || 'Standard Competency'}
Topic: ${topic}
Total Slides: ${slideCount}
Medium of Instruction: ${lang}

Structure the outline into a clear pedagogical flow:
1. Title slide (type: "title", expand: false)
2. Learning Objectives & MELC (type: "objectives", expand: false)
3. Motivation / Hook (type: "activity", expand: true)
4. Key Concepts & Definitions (type: "concept", expand: true)
5. Deep Dive / Analysis (type: "concept", expand: true)
6. Concrete Example / Case (type: "example", expand: true)
7. Visual Diagram / Illustration (type: "illustration", expand: true)
8. Philippine Context / Real-world Application (type: "example", expand: true)
9. Interactive Question / Discussion (type: "activity", expand: true)
10. Guided Practice (type: "activity", expand: true)
11. Key Takeaways & Summary (type: "summary", expand: false)
12. Formative Check / Exit Ticket (type: "assessment", expand: true)

Return JSON with this EXACT structure:
{
  "slides": [
    {
      "id": 1,
      "type": "title",
      "title": "${topic}",
      "keyPoints": ["Lesson Overview"],
      "expand": false
    },
    {
      "id": 2,
      "type": "objectives",
      "title": "Learning Objectives",
      "keyPoints": ["Identify key concepts", "Apply understanding in activities"],
      "expand": false
    }
  ]
}`;

    try {
      const reply = await callNvidiaChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model: nvidiaConfig.model,
        temperature: 0.3,
        maxTokens: 2500,
      });

      const parsed = parseAIJson(reply);
      if (Array.isArray(parsed?.slides) && parsed.slides.length > 0) {
        const outline = parsed.slides.map((s, i) => ({
          id:        s.id        ?? i + 1,
          type:      s.type      ?? 'concept',
          title:     String(s.title ?? ''),
          keyPoints: Array.isArray(s.keyPoints) ? s.keyPoints.map(String) : [],
          expand:    s.expand !== false,
        }));
        return { outline, cached: false, engine: 'nvidia' };
      }
    } catch (err) {
      console.warn('NVIDIA outline generation encountered an issue, falling back to Cloud Function:', err);
    }
  }

  // Fallback to Cloud Function
  return callPresentationFn('generateOutline', { subject, gradeLevel, melcCode, topic, slideCount }, 60000);
}

// ── Stage 2: Expand Slides & Generate Visuals (NVIDIA NIM or Fallback) ────────
export async function expandSlides({
  subject,
  gradeLevel,
  melcCode,
  topic,
  slides,
  style = 'Modern',
  onProgress,
}) {
  const nvidiaConfig = await getNvidiaConfig();

  // If NVIDIA key is available, execute high-power expansion with NVIDIA NIM + Image Generation
  if (nvidiaConfig.apiKey) {
    const lang = langLabel(subject);
    const styleDescription = {
      Academic: 'formal academic tone, precise vocabulary with bold **key terms**, DepEd aligned definitions',
      Modern:   'clear punchy sentences, highlighted **key concepts**, highly readable cards, dynamic structure',
      Engaging: 'enthusiastic tone, interactive questions, analogies to daily Philippine life, vivid examples',
    }[style] || 'clear, professional, structured';

    const needsExpansion = slides.filter(s => s.expand !== false);
    const templateSlides = slides.filter(s => s.expand === false);

    // Expand individual slide with NVIDIA NIM
    async function expandOneWithNvidia(slide) {
      const isVisualSlide = ['illustration', 'example', 'activity', 'concept'].includes(slide.type);
      
      const prompt = `You are kaTuro AI, writing high-impact presentation slide content for Philippine teachers.
Lesson Topic: "${topic}" (${gradeLevel}, ${subject}${melcCode ? `, MELC: ${melcCode}` : ''}).
Tone & Style: ${style} — ${styleDescription}
Medium of Instruction: ${lang}

Slide Target:
ID: ${slide.id}
Type: ${slide.type}
Title: "${slide.title}"
Key Points: ${JSON.stringify(slide.keyPoints || [])}

Rules:
1. Provide 3 to 5 comprehensive bullet points. Bold key terms using markdown syntax (e.g., **Key Concept**).
2. Write a concise subtitle headline (5–9 words).
3. Provide a realistic teacher spoken note ("teacherNote") — 2 sentences of what the teacher should say when presenting this slide.
4. "imagePrompt": MUST be an ULTRA super-relevant, topic-specific educational visual prompt (scientific diagram, process chart, comparison graph, biological cycle, anatomy illustration, or clear realistic photo) specifically illustrating this exact slide's concept. Specify: "Clean vector infographic / high-contrast educational visual on clean white background, lightweight minimalist presentation style, no messy unreadable text".
5. "suggestedVisual": A concise 4–8 word descriptive label for the graphic (e.g., "Process Diagram of Cell Respiration").

Return ONLY a valid JSON object matching this structure:
{
  "id": ${slide.id},
  "type": "${slide.type}",
  "title": "${slide.title}",
  "headline": "...",
  "bullets": [
    "**Core Point 1**: Detailed explanation sentence.",
    "**Core Point 2**: Application or example sentence.",
    "**Core Point 3**: Key takeaway sentence."
  ],
  "teacherNote": "...",
  "suggestedVisual": "...",
  "imagePrompt": "Detailed prompt for ultra-relevant educational diagram about ${topic}"
}`;

      try {
        const text = await callNvidiaChat({
          messages: [{ role: 'user', content: prompt }],
          model: nvidiaConfig.model,
          temperature: 0.35,
          maxTokens: 1200,
        });

        const parsed = parseAIJson(text);
        
        let imageBase64 = null;
        // If it's a visual, illustration, or concept slide, generate photo/diagram with NVIDIA SDXL
        if (isVisualSlide && (parsed.imagePrompt || parsed.suggestedVisual)) {
          const imgPrompt = `${parsed.imagePrompt || parsed.suggestedVisual}, educational diagram or photo for ${subject} ${topic}`;
          try {
            imageBase64 = await generateNvidiaImage({ prompt: imgPrompt });
          } catch (e) {
            console.warn(`Image generation skipped for slide ${slide.id}:`, e);
          }
        }

        return {
          id:              slide.id,
          type:            String(parsed.type            ?? slide.type),
          title:           String(parsed.title           ?? slide.title),
          headline:        String(parsed.headline        ?? ''),
          bullets:         Array.isArray(parsed.bullets) ? parsed.bullets.map(String) : (slide.keyPoints || []),
          teacherNote:     String(parsed.teacherNote     ?? ''),
          suggestedVisual: String(parsed.suggestedVisual ?? ''),
          imageBase64:     imageBase64,
        };
      } catch (err) {
        console.warn(`NVIDIA slide expansion fallback for slide ${slide.id}:`, err);
        return {
          id:              slide.id,
          type:            slide.type,
          title:           slide.title,
          headline:        '',
          bullets:         slide.keyPoints || [],
          teacherNote:     '',
          suggestedVisual: '',
          imageBase64:     null,
        };
      }
    }

    // Run parallel expansion in chunks of 3 to manage throughput
    const chunkSize = 3;
    const expanded = [];
    for (let i = 0; i < needsExpansion.length; i += chunkSize) {
      const chunk = needsExpansion.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(chunk.map(expandOneWithNvidia));
      expanded.push(...chunkResults);
      if (onProgress) {
        onProgress(Math.min(100, Math.round(((i + chunk.length) / needsExpansion.length) * 100)));
      }
    }

    // Format template slides (Title, Objectives, Summary)
    const filledTemplate = templateSlides.map(s => ({
      id:              s.id,
      type:            s.type,
      title:           s.title,
      headline:        s.type === 'objectives' ? `MELC: ${melcCode || 'DepEd MATATAG Competency'}` : '',
      bullets:         s.keyPoints || [],
      teacherNote:     s.type === 'title' ? `Welcome class. Today we will explore ${topic}.` : '',
      suggestedVisual: '',
      imageBase64:     null,
    }));

    const allSlides = [...expanded, ...filledTemplate].sort((a, b) => a.id - b.id);
    return { slides: allSlides, engine: 'nvidia' };
  }

  // Fallback to Cloud Function — but still enrich visual slides with real AI-generated images!
  const cfResult = await callPresentationFn('expandSlides', { subject, gradeLevel, melcCode, topic, slides, style }, 180000);
  const rawSlides = Array.isArray(cfResult?.slides) ? cfResult.slides : [];

  // Generate real AI educational visual images for visual/illustration slides in parallel
  const enrichedSlides = await Promise.all(
    rawSlides.map(async (s) => {
      const isVisualSlide = ['illustration', 'example', 'activity', 'concept'].includes(s.type);
      if (isVisualSlide && (s.suggestedVisual || s.title)) {
        try {
          const imgPrompt = `${s.suggestedVisual || s.title}, educational diagram for ${subject} ${topic}`;
          const imageBase64 = await generateNvidiaImage({ prompt: imgPrompt, subject, topic });
          return { ...s, imageBase64 };
        } catch (e) {
          console.warn(`Fallback image generation skipped for slide ${s.id}:`, e);
        }
      }
      return s;
    })
  );

  return { slides: enrichedSlides, engine: 'gemini' };
}

// ── Map expanded slides → pptxExport format ───────────────────────────────────
export function toExportSlides(expandedSlides) {
  return expandedSlides.map(s => {
    const isTitle      = s.type === 'title';
    const isObjectives = s.type === 'objectives';
    const isSummary    = s.type === 'summary';
    const isActivity   = ['activity', 'assessment', 'challenge', 'practice'].includes(s.type);
    const isVisual     = Boolean(s.imageBase64 || s.imageUrl || ['illustration', 'example', 'concept'].includes(s.type) || s.suggestedVisual);

    let layout = 'content';
    if (isTitle) layout = 'title';
    else if (isObjectives) layout = 'objectives';
    else if (isSummary) layout = 'summary';
    else if (isActivity) layout = 'activity';
    else if (isVisual) layout = 'visual';

    return {
      layout,
      type:            s.type,
      title:           s.title,
      headline:        s.headline || '',
      bullets:         s.bullets?.length ? s.bullets : (s.body ? [s.body] : []),
      notes:           s.teacherNote || '',
      suggestedVisual: s.suggestedVisual || '',
      imageBase64:     s.imageBase64 || null,
      imageUrl:        s.imageUrl || null,
    };
  });
}

