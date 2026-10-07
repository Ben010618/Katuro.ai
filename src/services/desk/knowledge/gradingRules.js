/**
 * gradingRules.js — DepEd grading rules as DATA, per school year, each with its
 * official source. KaTuroDesk computes grades from these in code; the AI never
 * decides a grade (DO 15, s. 2026, Table 6: AI may not be used for "determining FGs").
 *
 * Sources (read from the official PDFs on deped.gov.ph):
 *   DO 15, s. 2026 — Revised Guidelines on Classroom Assessment, Grading System, and
 *                    Awards and Recognition for the K to 12 BEP (June 4, 2026;
 *                    repeals DO 8, s. 2015 and DO 36, s. 2016). Effective SY 2026–2027.
 *   DO 9, s. 2026  — Three-Term School Calendar (SY 2026–2027, public schools K–12).
 */

const DO15 = 'DepEd Order No. 15, s. 2026';

/** Qualitative descriptors of numeric grades (DO 15 Table 11; same words as Table 8 letter grades A–E). */
export const DESCRIPTORS = [
  { min: 90, max: 100, letter: 'A', descriptor: 'Advancing', filipino: 'Namumukod-tangi', remarks: 'Passed' },
  { min: 80, max: 89, letter: 'B', descriptor: 'Benchmarking', filipino: 'Napamamalas', remarks: 'Passed' },
  { min: 75, max: 79, letter: 'C', descriptor: 'Connecting', filipino: 'Natutungo', remarks: 'Passed' },
  { min: 65, max: 74, letter: 'D', descriptor: 'Developing', filipino: 'Napauunlad', remarks: 'Failed' },
  { min: 0, max: 64, letter: 'E', descriptor: 'Emerging', filipino: 'Nagsisimula', remarks: 'Failed' },
];

/** Kindergarten descriptive grading (DO 15 Table 7). */
export const KINDER_DESCRIPTORS = [
  { letter: 'CO', descriptor: 'Consistent', filipino: 'Palagiang Naipapakita' },
  { letter: 'DV', descriptor: 'Developing', filipino: 'Umuusbong' },
  { letter: 'BG', descriptor: 'Beginning', filipino: 'Nagsisimula' },
];

/**
 * Learning areas in the order of the Learner's Performance Report (DO 15 Annex G,
 * Grades 4–12; also used for Grades 2–3 while they are numerical). MAPEH is shown
 * with its two components. `match` recognises the names teachers write in files.
 */
export const LEARNING_AREAS = [
  { key: 'filipino', name: 'Filipino', match: /^(filipino|fil)\b/i },
  { key: 'english', name: 'English', match: /^(english|eng)\b/i },
  { key: 'mathematics', name: 'Mathematics', match: /^(mathematics|math|maths)\b/i },
  { key: 'science', name: 'Science', match: /^(science|sci)\b/i },
  { key: 'ap', name: 'Araling Panlipunan (AP)', match: /^(araling\s+panlipunan|a\.?\s?p\.?)\b/i },
  { key: 'makabansa', name: 'Makabansa', match: /^makabansa\b/i },
  { key: 'gmrc', name: 'GMRC / Values Education', match: /^(gmrc|good\s+manners|values(\s+education)?|v\.?e\.?|esp|edukasyon\s+sa\s+pagpapakatao)\b/i },
  { key: 'epp_tle', name: 'EPP / TLE', match: /^(epp|tle|t\.l\.e\.?|technology\s+and\s+livelihood|edukasyong\s+pantahanan)\b/i },
  { key: 'mapeh', name: 'MAPEH', match: /^mapeh\b/i },
  { key: 'music_arts', name: 'Music and Arts', component: 'mapeh', match: /^music\s*(and|&)\s*arts\b/i },
  { key: 'pe_health', name: 'Physical Education and Health', component: 'mapeh', match: /^(physical\s+education\s*(and|&)\s*health|p\.?e\.?\s*(and|&)\s*health)\b/i },
];

/** Which learning area a header/sheet/file label names (or null). */
export function matchLearningArea(label) {
  const t = String(label || '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const byKey = (k) => LEARNING_AREAS.find((a) => a.key === k);
  // MAPEH components first, so "MAPEH – Music and Arts" is the component, not MAPEH.
  if (/music\s*(and|&)\s*arts/i.test(t)) return byKey('music_arts');
  if (/(physical\s+education|\bp\.?\s?e\.?)\s*(and|&)\s*health/i.test(t)) return byKey('pe_health');
  const words = t.split(/[\s,/()|:–-]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    // Short abbreviations (AP, VE, PE) only count at the very start of the label.
    if (i > 0 && words[i].replace(/\./g, '').length <= 2) continue;
    const rest = words.slice(i).join(' ');
    for (const area of LEARNING_AREAS) if (!area.component && area.match.test(rest)) return area;
  }
  return null;
}

/** Key Stage of a grade level: K–3 → 1, 4–6 → 2, 7–10 → 3, 11–12 → 4. */
export function keyStage(grade) {
  const g = gradeNumber(grade);
  if (g === 0) return 1;
  if (g === null) return null;
  if (g <= 3) return 1;
  if (g <= 6) return 2;
  if (g <= 10) return 3;
  return 4;
}

/** "Grade One", "Grade 7", "G10", "Kinder" → 0..12 (Kinder = 0), else null. */
export function gradeNumber(grade) {
  const t = String(grade ?? '').toLowerCase();
  if (/\b(kinder|kindergarten|k)\b/.test(t) && !/\d/.test(t)) return 0;
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const m = t.match(/\d{1,2}/);
  if (m) return Number(m[0]) >= 0 && Number(m[0]) <= 12 ? Number(m[0]) : null;
  for (const [w, n] of Object.entries(words)) if (new RegExp(`\\b${w}\\b`).test(t)) return n;
  return null;
}

/**
 * How a grade level is graded and reported in a school year.
 * → { mode: 'numerical'|'descriptive', report, terms, source, note? }
 */
export function gradingModeFor(schoolYear, grade) {
  const g = gradeNumber(grade);
  const sy = String(schoolYear || '');
  const startYear = Number(sy.slice(0, 4)) || 0;
  if (startYear && startYear < 2026) {
    return { mode: 'numerical', report: 'Report Card (SF9)', terms: 4, source: 'DepEd Order No. 8, s. 2015 (four quarters)', note: 'School years before 2026–2027 used four quarters (DO 8, s. 2015).' };
  }
  const base = { terms: 3, source: `${DO15}; DepEd Order No. 9, s. 2026 (three-term calendar)` };
  if (g === 0) return { ...base, mode: 'descriptive', report: "Kindergarten Progress Report", source: `${DO15}, Table 7 and Annex E` };
  if (g !== null && g <= 3) {
    // Table 12 — KS1 transition to descriptive grading.
    const descriptiveUpTo = startYear >= 2028 ? 3 : startYear === 2027 ? 2 : 1;
    if (g <= descriptiveUpTo) {
      return { ...base, mode: 'descriptive', report: "Learner's Progress Report (SF9)", source: `${DO15}, Table 8, Table 12 and para. 59(a)` };
    }
    return { ...base, mode: 'numerical', report: "Learner's Performance Report (SF9)", source: `${DO15}, Table 12, paras. 56–57 and Annex G` };
  }
  return { ...base, mode: 'numerical', report: "Learner's Performance Report (SF9)", source: `${DO15}, paras. 44–53, 59(b) and Annex G` };
}

/** Rounded to the nearest whole number, halves up (DO 15 paras. 52–53: "rounded to the nearest whole number"). */
export function roundGrade(x) {
  return Math.floor(Number(x) + 0.5 + 1e-9);
}

/** Final Grade = average of the Term Grades, rounded (DO 15 para. 52). null unless every term is a number. */
export function finalGrade(termGrades, terms = 3) {
  const vals = (termGrades || []).slice(0, terms);
  if (vals.length < terms || vals.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  return roundGrade(vals.reduce((a, b) => a + b, 0) / terms);
}

/**
 * MAPEH (and other multi-component areas): FG = average of the components' FGs;
 * passed when that FG is 75 or above even if one component failed (DO 15 Annex D para. 20).
 */
export function compositeFinalGrade(componentFinals) {
  const vals = (componentFinals || []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!vals.length || vals.length !== (componentFinals || []).length) return null;
  return roundGrade(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** General Average = average of the FGs in all learning areas, as a whole number (DO 15 para. 53; not for Grades 11–12, which use units). */
export function generalAverage(finals) {
  const vals = (finals || []).filter((v) => v !== undefined);
  if (!vals.length || vals.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  return roundGrade(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function descriptorFor(grade) {
  if (typeof grade !== 'number' || !Number.isFinite(grade)) return null;
  return DESCRIPTORS.find((d) => grade >= d.min && grade <= d.max) || null;
}

/** "Passed" when FG ≥ 75 (DO 15 para. 52; Annex G remarks). */
export function remarksFor(finalGradeValue) {
  return descriptorFor(finalGradeValue)?.remarks || '';
}

/** Promotion by final grades (DO 15 para. 67): all passed → Promoted; 1–2 failed → Summer Remedial Class; >2 → Retained. */
export function promotionFor(finals) {
  const vals = (finals || []).filter((v) => typeof v === 'number');
  if (!vals.length || vals.length !== (finals || []).length) return '';
  const failed = vals.filter((v) => v < 75).length;
  if (!failed) return 'Promoted';
  if (failed <= 2) return 'Summer Remedial Class';
  return 'Retained';
}

/** Academic Excellence Award by grades only: GA ≥ 90 and no FG below 80 (DO 15 para. 75; the school also checks records). */
export function academicExcellenceByGrades(ga, finals) {
  if (typeof ga !== 'number' || ga < 90) return false;
  return (finals || []).every((v) => typeof v === 'number' && v >= 80);
}

/** Lowest grade normally shown on the report card (DO 15 Annex D para. 18). */
export const DEFAULT_MINIMUM_REPORTED_GRADE = 60;

/** Compact rule text for the planner (only sent when grading/report cards come up). */
export function gradingRulesBrief(schoolYear) {
  const sy = schoolYear || '2026-2027';
  return [
    `Grading rules for SY ${sy} (${DO15}; DO 9, s. 2026):`,
    '- Three terms per school year (Term 1, 2, 3) for all public schools, Kindergarten to Grade 12.',
    '- Final Grade per learning area = average of the three Term Grades, rounded to a whole number; 75+ = met the standard (Passed).',
    '- General Average = average of all Final Grades, whole number (Grades 11–12 use units; separate issuance).',
    '- MAPEH Final Grade = average of its components (Music and Arts; PE and Health); passed if 75+ even if one component failed.',
    '- Descriptors: 90–100 Advancing, 80–89 Benchmarking, 75–79 Connecting, 65–74 Developing, 0–64 Emerging.',
    "- SY 2026–2027: Kindergarten and Grade 1 are DESCRIPTIVE (Progress Report, no numerical grades); Grades 2–3 are still numerical; Grades 4–12 numerical (Learner's Performance Report, SF9).",
    '- Promotion: pass all areas → promoted; fail 1–2 → Summer Remedial Class; fail 3+ → retained. Academic Excellence: GA 90+ with no FG below 80.',
    '- Grades are computed by KaTuroDesk code from the teacher\'s own class records, never estimated by the AI.',
  ].join('\n');
}
