/**
 * organizeFolder.js — an organized copy of the classroom folder, by code: each file's grade,
 * section, term, learning area and kind of document are read from its path and name (then
 * the start of its text when the name does not say), files are copied into
 * Grade / Section / Term folders with consistent names, and exact duplicates are copied once.
 * The originals are never moved, renamed or deleted.
 */

const SUBJECTS = [
  ['Araling Panlipunan', /\b(araling\s*panlipunan|ap)\b/i], ['Mathematics', /\b(math(ematics)?)\b/i], ['Science', /\bscience\b/i],
  ['English', /\benglish\b/i], ['Filipino', /\bfilipino\b/i], ['MAPEH', /\bmapeh\b/i], ['ESP', /\b(esp|edukasyon sa pagpapakatao|values ed(ucation)?)\b/i],
  ['GMRC', /\bgmrc\b/i], ['TLE', /\b(tle|epp)\b/i], ['Makabansa', /\bmakabansa\b/i], ['Reading', /\breading\b/i], ['Music', /\bmusic\b/i],
  ['Arts', /\barts?\b/i], ['PE', /\b(p\.?e\.?|physical education)\b/i], ['Health', /\bhealth\b/i],
];
const KINDS = [
  ['Class Record', /\b(e-?class\s*record|class\s*record|ecr)\b/i], ['Report Card', /\b(report\s*card|sf\s*-?\s*9|form\s*138)\b/i],
  ['DLL', /\b(dll|daily\s*lesson\s*log)\b/i], ['Lesson Plan', /\b(dlp|lesson\s*plan|detailed\s*lesson)\b/i], ['TOS', /\b(tos|table\s*of\s*specifications?)\b/i],
  ['Summative Test', /\b(summative|periodical|exam(ination)?)\b/i], ['Quiz', /\bquiz(zes)?\b/i], ['Attendance', /\b(attendance|sf\s*-?\s*2)\b/i],
  ['Masterlist', /\b(master\s*list|masterlist|class\s*list|roster|sf\s*-?\s*1)\b/i], ['Grades', /\b(grades|conso(lidated)?|grading\s*sheet)\b/i],
  ['Certificate', /\bcertificates?\b/i], ['Letter', /\bletter\b/i], ['Memo', /\b(memo(randum)?)\b/i], ['Report', /\b(accomplishment|narrative)\s*report\b/i],
  ['IPCRF', /\bipcrf\b/i], ['Worksheet', /\b(worksheet|activity\s*sheet|las)\b/i], ['Slides', /\bslides?\b/i],
];
const NOT_SECTION = /^(term|quarter|q\d|t\d|sy|school|year|class|record|grades?|section|final|copy|draft|v\d|\d+|and|for|of|the|summative|quiz|test|exam|week)$/i;

const title = (s) => s.replace(/\b([a-zñ])([a-zñ]*)/g, (m, a, b) => a.toUpperCase() + b.toLowerCase());

/** What a file is about. → { grade, section, term, subject, kind, form } (each may be '') */
export function classify(path, text = '') {
  const read = (src) => {
    const s = ` ${String(src).replace(/[_]+/g, ' ')} `;
    const out = {};
    const g = s.match(/(?:\bgrade|\bgr\.?|\bg)\s*-?\s*(\d{1,2}|k|kinder(?:garten)?)\b/i);
    if (g) out.grade = /^k/i.test(g[1]) ? 'Kindergarten' : Number(g[1]) >= 1 && Number(g[1]) <= 12 ? `Grade ${Number(g[1])}` : '';
    // The section: the word after the grade ("Grade 5 - Rizal", "G5-Rizal"), or after "Section".
    const sec = s.match(/(?:grade|gr\.?|\bg)\s*-?\s*(?:\d{1,2}|k)\s*[-–:,/ ]\s*([A-Za-zÑñ][A-Za-zÑñ'-]{2,20})/i) || s.match(/\bsection\s*:?\s*([A-Za-zÑñ][A-Za-zÑñ'-]{2,20})/i);
    if (sec && !NOT_SECTION.test(sec[1]) && !SUBJECTS.some(([, re]) => re.test(sec[1])) && !KINDS.some(([, re]) => re.test(sec[1]))) out.section = title(sec[1]);
    const t = s.match(/(?:\bterm|\bquarter|\bq|\bt)\s*-?\s*([1-4])\b/i);
    if (t) out.term = `Term ${t[1]}`;
    const subj = SUBJECTS.find(([, re]) => re.test(s));
    if (subj) out.subject = subj[0];
    const kind = KINDS.find(([, re]) => re.test(s));
    if (kind) out.kind = kind[0];
    const sf = s.match(/\bsf\s*-?\s*(\d{1,2})\b/i);
    if (sf) out.form = `SF${sf[1]}`;
    return out;
  };
  // The path and name decide; the file's own text fills only what they leave out.
  const fromName = read(path);
  const fromText = read(String(text).slice(0, 1500));
  const pick = (k) => fromName[k] || fromText[k] || '';
  return { grade: pick('grade'), section: fromName.section || (fromName.grade && fromText.grade && fromName.grade !== fromText.grade ? '' : fromText.section) || '', term: pick('term'), subject: pick('subject'), kind: pick('kind'), form: pick('form') };
}

/** A tidy version of the original name: no underscores, "copy", "(2)", "final final", extra spaces. */
export function tidyName(base) {
  return String(base)
    .replace(/[_]+/g, ' ')
    .replace(/\b(copy( of)?|final(\s+final)*|latest|new)\b/gi, ' ')
    .replace(/\(\s*\d+\s*\)|-\s*copy\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '')
    .trim() || String(base).trim();
}

/** The consistent file name: "Science - Class Record - Grade 5 Rizal - Term 1.xlsx" (only the known parts). */
export function consistentName(info, original) {
  const ext = original.includes('.') ? original.slice(original.lastIndexOf('.')) : '';
  const base = original.slice(0, original.length - ext.length);
  // A school form keeps its familiar code (SF2) instead of the kind (Attendance).
  const unique = [...new Set([info.subject, info.form || info.kind].filter(Boolean))];
  const parts = [...unique];
  const cls = [info.grade, info.section].filter(Boolean).join(' ');
  if (cls) parts.push(cls);
  if (info.term) parts.push(info.term);
  // Too little known: keep the (tidied) original name so nothing is lost.
  if (unique.length === 0) return `${tidyName(base)}${ext}`;
  return `${parts.join(' - ')}${ext}`.replace(/[\\/:*?"<>|]/g, '');
}

/** Folder inside the organized copy: Grade / Section / Term, or "Unsorted". */
export function folderFor(info) {
  if (!info.grade) return 'Unsorted';
  return [info.grade, info.section, info.term].filter(Boolean).join('/');
}

/** A content fingerprint (SHA-256) to find exact duplicates. */
export async function fingerprint(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
