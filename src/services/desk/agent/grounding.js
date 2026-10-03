/**
 * grounding.js — KaTuroDesk must never hallucinate or assume data.
 *
 * GROUNDING_RULES goes into every AI prompt. verifySpec() then checks what the AI
 * wrote: competency codes it cannot back up are removed (and the teacher is told),
 * and learner-style names that appear in no source are flagged.
 */

export const GROUNDING_RULES = `STRICT ACCURACY RULES — always follow:
1. Use ONLY facts from: the teacher's message, the files given to you, the teacher profile, and any official competency list included here.
2. NEVER invent or assume real-world data: names (learners, teachers, signatories, parents), numbers (scores, item counts, percentages, class sizes, days), dates, school details, competency codes, or what a file contains.
3. If something you need is missing or unreadable, leave it out and say exactly what is missing — or ask the teacher. Never fill a gap with a typical, sample, or "example" value.
4. Competency codes: copy a code only if it appears in the official list or the source files given to you; otherwise write the competency without a code.
5. Dates: write a date only if the teacher or a file gave it.
6. You may write NEW teaching content when asked (activities, explanations, test questions, slides), but never present made-up facts about the teacher's class, learners, school, or files as real.
7. If you are not sure, say you are not sure. Do not guess.`;

// DepEd/MATATAG competency codes, e.g. S7LT-IIa-1, M7NS-Ia-1, EN7RC-I-a-1, SCI7-Q1-01, MT1PA-Ia-i-1.
// A code starts with letters + grade (2+ letters, or 1 letter followed by more letters) and ends in a
// numbered segment, so ordinary text like "A4-size", "Q1-01" or "COVID-19" is never mistaken for a code.
const CODE_RE = /\b(?:[A-Z]{2,6}\d{1,2}[A-Z]{0,4}|[A-Z]\d{1,2}[A-Z]{1,4})(?:-[A-Za-z0-9]{1,6}){0,3}-[A-Za-z]{0,4}\d{1,3}[a-z]?\b/g;
// Roster-style learner names: "Surname, Given M."
const PERSON_RE = /\b[A-ZÑ][a-zñ]+(?: [A-Z][a-zñ]+)*, [A-ZÑ][a-zñ]+(?: [A-ZÑ][a-zñ]+)*(?: [A-Z]\.)?/g;
const NOT_NAMES = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|grade|quarter|week|day|dear|good|hello|yes|no|however|therefore|first|second|third|finally|note|example|class|teacher|learners?|students?)\b/i;

export function extractCodes(text) {
  return [...new Set(String(text || '').match(CODE_RE) || [])];
}

function mapStrings(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  return value;
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

/** Removes "(CODE)", "[CODE]", "CODE:" and bare CODE for each unverified code, tidying spacing. */
function stripCode(text, code) {
  const esc = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(`\\s*[([]\\s*${esc}\\s*[)\\]]`, 'g'), '')
    .replace(new RegExp(`${esc}\\s*[:–—-]\\s*`, 'g'), '')
    .replace(new RegExp(`\\b${esc}\\b`, 'g'), '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Checks an AI-written spec (document, slides, sheet) against the text it was allowed to use.
 * allowedText: teacher's message + source files + official competency list + profile facts.
 * knownNames:  learner names KaTuro read from files (masker / tables).
 * Returns { spec, warnings }.
 */
export function verifySpec(spec, { allowedText = '', knownNames = [] } = {}) {
  const warnings = [];
  const allowedCodes = new Set(extractCodes(allowedText));
  const written = collectStrings(spec).join('\n');

  const unverified = extractCodes(written).filter((c) => !allowedCodes.has(c));
  let out = spec;
  if (unverified.length) {
    out = mapStrings(spec, (s) => unverified.reduce((acc, c) => (acc.includes(c) ? stripCode(acc, c) : acc), s));
    warnings.push(`I removed competency code(s) I could not verify from the official list or your files: ${unverified.join(', ')}. Please add the correct codes from your curriculum guide.`);
  }

  // Only meaningful when a class list was involved: then any other roster-style name is suspicious.
  const known = new Set(knownNames.map((n) => String(n).toLowerCase()));
  const allowedLower = String(allowedText).toLowerCase();
  const strangers = known.size
    ? [...new Set(written.match(PERSON_RE) || [])].filter((n) => !NOT_NAMES.test(n) && !NOT_NAMES.test(n.split(', ')[1] || '') && !known.has(n.toLowerCase()) && !allowedLower.includes(n.toLowerCase()))
    : [];
  if (strangers.length) {
    warnings.push(`Please check these names — they are not in your files: ${strangers.slice(0, 5).join('; ')}${strangers.length > 5 ? '…' : ''}.`);
  }
  return { spec: out, warnings };
}
