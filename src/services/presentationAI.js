/**
 * Presentation AI — thin wrappers around the dedicated generateOutline and
 * expandSlides Cloud Functions (functions/index.js). Both the prompts and
 * the token deduction for expandSlides (3 tokens) live server-side there —
 * callers here must NOT also deduct tokens for this feature client-side.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

// ── Stage 1: Generate outline (free — teachers iterate before committing tokens)
export async function generateOutline({ subject, gradeLevel, melcCode, topic, slideCount = 12 }) {
  const call = httpsCallable(functions, 'generateOutline', { timeout: 60000 });
  const res = await call({ subject, gradeLevel, melcCode, topic, slideCount });
  return res.data; // { outline, cached }
}

// ── Stage 2: Expand slides (costs tokens — deducted server-side inside this function)
export async function expandSlides({ subject, gradeLevel, melcCode, topic, slides, style = 'Academic' }) {
  const call = httpsCallable(functions, 'expandSlides', { timeout: 180000 });
  const res = await call({ subject, gradeLevel, melcCode, topic, slides, style });
  return res.data; // { slides }
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
