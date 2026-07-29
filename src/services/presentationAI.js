/**
 * Presentation AI — thin wrappers around the dedicated generateOutline and
 * expandSlides Cloud Functions (functions/index.js). Both the prompts and
 * the token deduction for expandSlides (3 tokens) live server-side there —
 * callers here must NOT also deduct tokens for this feature client-side.
 */

import app, { auth } from '../firebase';
import { reportAIError } from './db';

// A bare code-shaped message ("internal", "unavailable"...) means the request
// likely never reached the function's code at all — e.g. a lost Cloud Run
// invoker IAM binding, the exact outage that motivated this reporting.
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
    throw err;
  }
}

// ── Stage 1: Generate outline (free — teachers iterate before committing tokens)
export async function generateOutline({ subject, gradeLevel, melcCode, topic, slideCount = 12 }) {
  return callPresentationFn('generateOutline', { subject, gradeLevel, melcCode, topic, slideCount }, 60000); // { outline, cached }
}

// ── Stage 2: Expand slides (costs tokens — deducted server-side inside this function)
export async function expandSlides({ subject, gradeLevel, melcCode, topic, slides, style = 'Academic' }) {
  return callPresentationFn('expandSlides', { subject, gradeLevel, melcCode, topic, slides, style }, 180000); // { slides }
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
