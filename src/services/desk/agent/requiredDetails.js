/**
 * requiredDetails.js — the details a job cannot be done without, checked by code
 * before anything runs (no AI tokens). When a detail is not in the teacher's words,
 * the plan, or the attached sources, KaTuro asks one question with tap answers
 * taken from the teacher's own profile ("Teaching load", "Advisory class").
 * Never filled with a typical value.
 */
import { matchLearningArea, gradeNumber } from '../knowledge/gradingRules.js';

const LESSON_DOCS = new Set(['dll', 'dlp', 'tos_test', 'quiz', 'worksheet']);
const DOC_NAMES = { dll: 'Daily Lesson Log', dlp: 'lesson plan', tos_test: 'test and TOS', quiz: 'quiz', worksheet: 'worksheet' };

/** "Grade 7", "G7", "Gr. 10", "Kinder" in free text → number (0 = Kindergarten) or null. */
export function gradeInText(text) {
  const t = String(text || '');
  const m = t.match(/\b(?:grade|gr\.?|g)\s*-?\s*(\d{1,2})\b/i);
  if (m && Number(m[1]) <= 12) return Number(m[1]);
  if (/\bkinder(garten)?\b/i.test(t)) return 0;
  const w = t.match(/\bgrade\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i);
  return w ? gradeNumber(w[1]) : null;
}

/** A learning area named anywhere in free text, or null. */
export function subjectInText(text) {
  return matchLearningArea(String(text || ''))?.name || null;
}

/** "Science 7 – A, B; Math 8 – C" → [{ label: 'Science 7', subject, grade }]. */
export function parseTeachingLoad(load) {
  return String(load || '').split(/[;\n]+/).map((part) => {
    const head = part.split(/\s+[–-]\s+/)[0].trim();
    if (!head) return null;
    const subject = subjectInText(head);
    const grade = gradeInText(head) ?? (head.match(/\b(\d{1,2})\b/) ? Number(head.match(/\b(\d{1,2})\b/)[1]) : null);
    return subject ? { label: head, subject, grade } : null;
  }).filter(Boolean).slice(0, 4);
}

/** "Science 7", "Math 8", "Baitang 7": a grade written right after a learning area (or "baitang"). */
export function gradeNearSubject(text) {
  const b = String(text || '').match(/\bbaitang\s*(\d{1,2})\b/i);
  if (b && Number(b[1]) <= 12) return Number(b[1]);
  const words = String(text || '').split(/[\s,;()]+/).filter(Boolean);
  for (let i = 1; i < words.length; i++) {
    if (!/^\d{1,2}$/.test(words[i]) || Number(words[i]) > 12) continue;
    for (let k = 1; k <= 3 && i - k >= 0; k++) if (matchLearningArea(words.slice(i - k, i).join(' '))) return Number(words[i]);
  }
  return null;
}

/** What the teacher actually wrote: this message and their last few messages. */
function teacherWords(prompt, history) {
  const recent = (history || []).filter((m) => m?.role === 'user').slice(-4).map((m) => m.content || '');
  return [...recent, prompt].join('\n');
}

/**
 * What a task still needs. → null, or { question, missing: [string], choices: [string] }.
 * `context` = { prompt, history, teacher: { teachingLoad, advisoryClass } }.
 * The learning area and grade must be in the teacher's own words (or the source files):
 * a value the AI filled in by itself, even from the profile, is not enough.
 */
export function missingDetails(task, { prompt = '', history = [], teacher = {} } = {}) {
  const a = task?.args || {};
  if (task?.tool === 'write_document' && LESSON_DOCS.has(a.docType) && !(Array.isArray(a.sourcePaths) && a.sourcePaths.length)) {
    const text = teacherWords(prompt, history);
    const needSubject = !subjectInText(text);
    const needGrade = gradeInText(text) === null && gradeNearSubject(text) === null;
    if (!needSubject && !needGrade) return null;
    const load = parseTeachingLoad(teacher.teachingLoad);
    const what = DOC_NAMES[a.docType];
    const missing = [needSubject && 'learning area', needGrade && 'grade level'].filter(Boolean);
    const choices = load.map((l) => l.label);
    return {
      question: `Which ${missing.join(' and ')} is this ${what} for?`,
      missing,
      choices,
    };
  }
  if (task?.tool === 'make_slides' && !String(a.topic || '').trim()) {
    return { question: 'What topic should the slides be about?', missing: ['topic'], choices: [] };
  }
  return null;
}

/** First task that cannot run yet (one question at a time), or null. */
export function firstMissingDetails(tasks, context) {
  for (const t of tasks || []) {
    const gap = missingDetails(t, context);
    if (gap) return { ...gap, task: t };
  }
  return null;
}
