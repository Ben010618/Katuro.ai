/**
 * guideImport.js — the lesson sequence from the teacher's own curriculum guide.
 * The AI lists the term's competencies in order; code keeps only the ones whose words and
 * codes are really in the guide (verifiedGuideItems), so nothing invented gets in.
 */
import { callDeskLLM } from '../agent/llm.js';
import { verifiedGuideItems } from './sequence.js';

/**
 * text: the guide's text (read by code). → { items, dropped }
 */
export async function extractGuideSequence({ text, subject, grade, term }) {
  const source = String(text || '').slice(0, 60000);
  if (source.replace(/\s+/g, '').length < 200) throw new Error('That file has too little text to read competencies from. Is it a scanned PDF? Use the Word or text version of the curriculum guide.');
  const res = await callDeskLLM({
    kind: 'task',
    tier: 'fast',
    json: true,
    maxTokens: 6000,
    temperature: 0,
    system: 'You copy learning competencies from a DepEd curriculum guide exactly as written. Never add, reword or invent a competency or code.',
    prompt: `From the curriculum guide below, list the learning competencies for ${grade} ${subject}${term ? `, Term/Quarter ${term}` : ''}, in the guide's order. Copy each competency's text WORD FOR WORD from the guide and its code if the guide gives one. "sessions" = the number of days or meetings the guide gives for it, or 1 when it gives none. Return ONLY JSON {"items":[{"code":"","text":"","sessions":1}]}.\n\nCURRICULUM GUIDE:\n${source}`,
  });
  return verifiedGuideItems(source, res?.items);
}
