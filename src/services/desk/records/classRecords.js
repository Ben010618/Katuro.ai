/**
 * classRecords.js — the teacher's class records in the KaTuro folder's Records folder.
 *
 * The rule (decided with the teacher, 2026-11-16):
 *   - one DepEd E-Class Record per class and subject: "Records/Grade 7 - Rizal - Science.xlsx"
 *   - a class record is PREPARED FIRST (the teacher types the learners, or KaTuroDesk fills
 *     them in from the teacher's class list), and only then is anything recorded in it
 *   - READY = every learner has a clear full name AND a 12-digit LRN, with no duplicate
 *     names or LRNs. Recording into a class record that is not ready is refused, with
 *     the exact things to fix. KaTuro never guesses which learner a score belongs to.
 *
 * Pure functions only; the agent tools (understandTools.js) read the file and call these.
 */
import { normalizeLearnerName } from '../generators/fillTemplates.js';

export const RECORDS_DIR = 'Records';
const LESSONS_DIR = 'Lessons';
const MAIN_DIRS = Object.freeze([RECORDS_DIR, LESSONS_DIR]);

const BAD_FILE_CHARS = /[\\/:*?"<>|]+/g;
const tidy = (s) => String(s ?? '').replace(BAD_FILE_CHARS, ' ').replace(/\s+/g, ' ').trim();

/** "7" / "Grade 7" / "grade 7" → "Grade 7"; "Kinder" stays "Kinder". */
export function gradeLabel(gradeLevel) {
  const g = tidy(gradeLevel).replace(/^(grade|gr\.?|g)\s*/i, '');
  return /^\d{1,2}$/.test(g) ? `Grade ${Number(g)}` : tidy(gradeLevel);
}

/** { gradeLevel: '7', section: 'Rizal', subject: 'Science' } → "Grade 7 - Rizal - Science.xlsx" */
export function classRecordFileName({ gradeLevel, section, subject } = {}) {
  const parts = [gradeLabel(gradeLevel), tidy(section), tidy(subject)];
  if (parts.some((p) => !p)) throw new Error('A class record needs the grade level, the section and the subject.');
  return `${parts.join(' - ')}.xlsx`;
}

/** "Records/Grade 7 - Rizal - Science.xlsx" → "Grade 7 - Rizal - Science" (the class's name). */
export const classNameOfRecord = (pathOrName) => String(pathOrName || '').split('/').pop().replace(/\.(xlsx|xlsm)$/i, '');

/**
 * A class record the teacher records into: an Excel file in Records, not an Excel lock file,
 * not KaTuro's own outputs, not an attendance file.
 */
export function isClassRecordPath(path) {
  const p = String(path || '').replace(/\\/g, '/');
  return isInRecords(p) && /\.(xlsx|xlsm)$/i.test(p) && !p.split('/').pop().startsWith('~$') && !/\/KaTuro Outputs\//i.test(p) && !/\/Attendance\//i.test(p);
}

/** "Records/Grade 7 - Rizal - Science.xlsx" → { gradeLevel: 'Grade 7', section: 'Rizal', subject: 'Science' }, else null. */
export function parseClassRecordFileName(pathOrName) {
  const name = classNameOfRecord(pathOrName);
  const parts = name.split(' - ').map((p) => p.trim());
  if (parts.length !== 3 || parts.some((p) => !p)) return null;
  return { gradeLevel: parts[0], section: parts[1], subject: parts[2] };
}

/** True for a file directly or deeper inside Records/ (any letter case). */
const isInTop = (folder) => (path) => String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase().startsWith(`${folder.toLowerCase()}/`);
export const isInRecords = isInTop(RECORDS_DIR);
export const isInLessons = isInTop(LESSONS_DIR);

/** True when the folder tree is the KaTuro home: Records and Lessons at its top. */
export function isKaturoHome(tree = []) {
  const dirs = new Set(tree.filter((e) => e?.kind === 'directory').map((e) => String(e.name).toLowerCase()));
  return MAIN_DIRS.every((d) => dirs.has(d.toLowerCase()));
}

/** Tools whose new files are about learners' records (grades, scores, attendance). */
const RECORD_TOOLS = new Set([
  'make_class_record', 'build_report_cards', 'analyze_scores', 'check_attendance',
  'check_grade_sheets', 'check_answer_sheets', 'consolidate_files', 'record_quiz_scores',
]);

/**
 * Where a tool's new files go by default (the teacher can still name another folder).
 * In the KaTuro folder: record outputs → "Records/KaTuro Outputs/<date>", everything else
 * (lesson plans, slides, worksheets, letters…) → "Lessons/KaTuro Outputs/<date>".
 * Any other folder keeps the old "KaTuro Outputs/<date>".
 */
export function defaultOutputFolder(toolName, { home = false, outputRoot = 'KaTuro Outputs', date } = {}) {
  const base = `${outputRoot}/${date}`;
  if (!home) return base;
  return `${RECORD_TOOLS.has(toolName) ? RECORDS_DIR : LESSONS_DIR}/${base}`;
}

const PLACEHOLDER = /^(learner|student|pupil|name|names|pangalan|sample|test|tbd|n\/?a|none|x+|-+|\?+)(\s*\d+)?$/i;

/** Why a name is not clear enough to record against, or null when it is. */
export function unclearNameReason(name) {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return 'the name is blank';
  if (/\d/.test(s)) return 'the name has numbers in it';
  if (/[?*_#@]/.test(s)) return 'the name has unclear marks in it';
  if (PLACEHOLDER.test(s)) return 'it is a placeholder, not a real name';
  const words = normalizeLearnerName(s).split(' ').filter((w) => w.replace(/[^a-zñ]/gi, '').length >= 2);
  if (words.length < 2) return 'it needs both the last name and the first name';
  return null;
}

/** "1234 5678 9012" / 123456789012 → "123456789012"; anything else → as typed (trimmed). */
export const cleanLrn = (lrn) => {
  const s = String(lrn ?? '').trim();
  return /^[\d\s-]+$/.test(s) ? s.replace(/[\s-]/g, '') : s;
};

/**
 * Checks a class list: learners = [{ name, lrn?, sex?|gender?, row? }].
 * → { ready, learners: [{ name, lrn, sex, row }], problems: [{ type, learner, row, detail }], counts }
 * Every problem blocks recording (the teacher asked for full names AND 12-digit LRNs).
 */
export function checkClassList(learners = []) {
  const list = (learners || []).map((l) => ({
    name: String(l?.name ?? '').replace(/\s+/g, ' ').trim(),
    lrn: cleanLrn(l?.lrn),
    sex: /^m/i.test(String(l?.sex || l?.gender || '')) ? 'M' : /^f/i.test(String(l?.sex || l?.gender || '')) ? 'F' : '',
    ...(l?.row !== undefined ? { row: l.row } : {}),
  }));
  const problems = [];
  const add = (type, l, detail) => problems.push({ type, learner: l.name, ...(l.row !== undefined ? { row: l.row } : {}), detail });

  if (!list.length) problems.push({ type: 'no_learners', learner: '', detail: 'No learner names were found.' });

  const byName = new Map();
  const byLrn = new Map();
  for (const l of list) {
    const why = unclearNameReason(l.name);
    if (why) add('unclear_name', l, `"${l.name || '(blank)'}": ${why}.`);
    if (!l.lrn) add('missing_lrn', l, `${l.name || 'A learner'} has no LRN.`);
    else if (!/^\d{12}$/.test(l.lrn)) add('bad_lrn', l, `${l.name || 'A learner'}: the LRN "${l.lrn}" is not 12 digits.`);

    const key = normalizeLearnerName(l.name);
    if (key) byName.set(key, [...(byName.get(key) || []), l]);
    if (/^\d{12}$/.test(l.lrn)) byLrn.set(l.lrn, [...(byLrn.get(l.lrn) || []), l]);
  }
  for (const same of byName.values()) {
    if (same.length > 1) add('duplicate_name', same[1], `"${same[0].name}" appears ${same.length} times. Add the middle name or initial so each learner is clear.`);
  }
  for (const [lrn, same] of byLrn) {
    if (same.length > 1) add('duplicate_lrn', same[1], `The LRN ${lrn} is used by ${same.map((s) => s.name).join(' and ')}.`);
  }

  return {
    ready: problems.length === 0,
    learners: list,
    problems,
    counts: { learners: list.length, male: list.filter((l) => l.sex === 'M').length, female: list.filter((l) => l.sex === 'F').length },
  };
}

/** Short teacher-facing text: what to fix in `fileName` (at most `max` items listed). */
export function readinessText(fileName, check, { max = 8 } = {}) {
  if (check.ready) return `${fileName} is ready: ${check.counts.learners} learners, each with a full name and an LRN.`;
  const lines = check.problems.slice(0, max).map((p) => `- ${p.detail}`);
  const more = check.problems.length > max ? `\n- …and ${check.problems.length - max} more.` : '';
  return `${fileName} is not ready for recording yet. Every learner needs a clear full name and a 12-digit LRN, so no score lands on the wrong learner. Please fix:\n${lines.join('\n')}${more}`;
}
