/**
 * sequence.js — the order of lessons for one class (competencies and how many meetings
 * each takes). Three sources, never guessed:
 *   1. the built-in MATATAG data, EXACT subject + grade + term only;
 *   2. topics the teacher types ("S7MT-Ic-3 | Mixtures and solutions | 3");
 *   3. the teacher's own curriculum guide: the AI lists the competencies, and only the
 *      ones whose words are really in the file are kept.
 */
import { DEPED_CURRICULUM_DATABASE } from '../../../data/depedMatatagCurriculum.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();

/** Terms the built-in data has for this subject and grade (exact names only). */
export function matatagTerms(subject, grade) {
  const key = Object.keys(DEPED_CURRICULUM_DATABASE).find((k) => k.toLowerCase() === String(subject || '').trim().toLowerCase());
  const g = key ? DEPED_CURRICULUM_DATABASE[key][grade] : null;
  return g ? Object.keys(g).map((q) => Number(q.replace(/\D/g, ''))).filter(Boolean).sort() : [];
}

/** The built-in competencies of one term, or null when the data has no exact match. */
export function matatagSequence(subject, grade, term) {
  const key = Object.keys(DEPED_CURRICULUM_DATABASE).find((k) => k.toLowerCase() === String(subject || '').trim().toLowerCase());
  const list = key ? DEPED_CURRICULUM_DATABASE[key]?.[grade]?.[`Quarter ${term}`] : null;
  if (!Array.isArray(list) || !list.length) return null;
  return list.map((c) => ({
    code: c.code, text: c.text, sessions: Math.max(1, Number(c.days) || 1), domain: c.domain,
    contentStandard: c.contentStandard, performanceStandard: c.performanceStandard, source: c.source,
  }));
}

/**
 * Topics typed by the teacher, one per line:
 *   "S7MT-Ic-3 | Mixtures and solutions | 3"   (code | topic | meetings)
 *   "Mixtures and solutions (3)"                (topic and meetings)
 *   "Mixtures and solutions"                    (one meeting)
 * → { items, problems: [text] }
 */
export function typedSequence(text) {
  const items = [];
  const problems = [];
  String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
    let code = '';
    let topic = line.replace(/^\d{1,3}[.)]\s+/, '');
    let sessions = 1;
    const parts = topic.split('|').map((p) => p.trim());
    if (parts.length >= 2) {
      if (parts.length === 3) { [code, topic] = parts; sessions = Number(parts[2]); } else if (/^\d+$/.test(parts[1])) { [topic] = parts; sessions = Number(parts[1]); } else { [code, topic] = parts; }
    } else {
      const m = topic.match(/^(.*?)\s*\((\d{1,2})\s*(?:meetings?|days?|sessions?)?\)$/i);
      if (m) { topic = m[1]; sessions = Number(m[2]); }
    }
    if (!/[A-Za-zÑñ]{3,}/.test(topic)) { problems.push(`line ${i + 1} has no topic`); return; }
    if (!Number.isInteger(sessions) || sessions < 1 || sessions > 40) { problems.push(`line ${i + 1}: the number of meetings must be 1 to 40`); return; }
    items.push({ code, text: topic, sessions });
  });
  return { items, problems };
}

/** The same list as typed text (for editing it again). */
export const sequenceText = (items = []) => items.map((it) => [it.code, it.text, it.sessions].filter((v) => v !== '' && v !== undefined).join(' | ')).join('\n');

/**
 * Competencies the AI found in a curriculum guide, kept only when their words are in the file.
 *   aiItems: [{ code, text, sessions }] → { items, dropped }
 */
export function verifiedGuideItems(fileText, aiItems) {
  const hay = norm(fileText);
  const items = [];
  let dropped = 0;
  for (const it of Array.isArray(aiItems) ? aiItems : []) {
    const text = String(it?.text || '').trim();
    const words = norm(text).split(' ').filter((w) => w.length > 3);
    // Most of its words, in order, must be found in the guide.
    const found = words.length >= 3 && hay.includes(norm(text).slice(0, 60));
    const code = String(it?.code || '').trim();
    const codeOk = !code || hay.includes(norm(code));
    if (!found || !codeOk) { dropped += 1; continue; }
    const sessions = Number(it.sessions);
    items.push({ code: codeOk ? code : '', text, sessions: Number.isInteger(sessions) && sessions >= 1 && sessions <= 40 ? sessions : 1 });
  }
  return { items, dropped };
}
