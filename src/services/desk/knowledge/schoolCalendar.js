/**
 * schoolCalendar.js — the teacher's year, from the official calendar, so "this term",
 * "end of term" and "report cards now" are understood the way teachers mean them.
 *
 * Source: DepEd Order No. 9, s. 2026 (Three-Term School Calendar), read from the
 * official PDF: Summary table p. 27; block definitions paras. 11–13 and Figure 2.
 * Dates outside a known school year give no context (never guessed).
 */

const DO9 = 'DepEd Order No. 9, s. 2026';

/** Work the order assigns to each block (para. 12, para. 13, Figure 2). */
export const BLOCK_WORK = {
  opening: 'beginning-of-school-year activities: orientation of learners and parents, BOSY assessments, health assessments and learner screening, and collecting and submitting required data (language mapping, school forms)',
  instructional: 'teaching and learning of the prescribed competencies, with minimal disruption; ARAL Program remediation sessions after classes (30–60 minutes)',
  endOfTerm: 'computing grades, preparing and checking school forms, the parent-teacher meeting and report card distribution, remediation and enrichment, other teaching-related tasks, co- and extra-curricular activities, INSET, and a wellness break',
};

/** SY 2026–2027 (DO 9, s. 2026, Summary of Three-Term School Calendar, p. 27). */
export const CALENDARS = {
  '2026-2027': {
    source: `${DO9}, p. 27`,
    totalClassDays: 201,
    terms: [
      { term: 1, start: '2026-06-08', end: '2026-09-15', classDays: 69, opening: ['2026-06-08', '2026-06-11'], instructional: ['2026-06-15', '2026-09-01'], endOfTerm: ['2026-09-02', '2026-09-15'] },
      { term: 2, start: '2026-09-16', end: '2026-12-18', classDays: 65, instructional: ['2026-09-16', '2026-12-04'], endOfTerm: ['2026-12-07', '2026-12-18'] },
      { term: 3, start: '2027-01-04', end: '2027-04-08', classDays: 67, instructional: ['2027-01-04', '2027-03-23'], endOfTerm: ['2027-03-24', '2027-04-08'] },
    ],
    eosyBreak: ['2027-04-09', '2027-05-09'],
  },
};

/** Today's date in the Philippines as YYYY-MM-DD. */
export function manilaDate(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

const inRange = (day, [a, b]) => day >= a && day <= b;
const pretty = (iso) => new Date(`${iso}T12:00:00+08:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00+08:00`) - new Date(`${a}T12:00:00+08:00`)) / 86400000);

/**
 * Where a date falls in the school year.
 * → null (unknown year) or { schoolYear, term, block: 'opening'|'instructional'|'endOfTerm'|'betweenTerms'|'eosyBreak', termEnd, daysToTermEnd, source }
 */
export function calendarPosition(d = new Date()) {
  const day = typeof d === 'string' ? d : manilaDate(d);
  for (const [schoolYear, cal] of Object.entries(CALENDARS)) {
    if (inRange(day, cal.eosyBreak)) return { schoolYear, term: null, block: 'eosyBreak', source: cal.source };
    for (const t of cal.terms) {
      if (!inRange(day, [t.start, t.end])) continue;
      const block = t.opening && inRange(day, t.opening) ? 'opening' : inRange(day, t.endOfTerm) ? 'endOfTerm' : 'instructional';
      return { schoolYear, term: t.term, block, termEnd: t.end, daysToTermEnd: daysBetween(day, t.end), source: cal.source };
    }
    const first = cal.terms[0].start;
    const last = cal.eosyBreak[1];
    if (day > first && day < last) {
      const next = cal.terms.find((t) => t.start > day);
      return { schoolYear, term: null, block: 'betweenTerms', nextTerm: next?.term, nextStart: next?.start, source: cal.source };
    }
  }
  return null;
}

/** One short paragraph for the planner ('' when the date is outside a known calendar). */
export function calendarContext(d = new Date()) {
  const pos = calendarPosition(d);
  if (!pos) return '';
  const cal = CALENDARS[pos.schoolYear];
  const head = `School calendar (${cal.source}): today is ${pretty(typeof d === 'string' ? d : manilaDate(d))}, SY ${pos.schoolYear}.`;
  if (pos.block === 'eosyBreak') return `${head} It is the end-of-school-year break (${pretty(cal.eosyBreak[0])} – ${pretty(cal.eosyBreak[1])}).`;
  if (pos.block === 'betweenTerms') return `${head} Classes are between terms; Term ${pos.nextTerm} starts ${pretty(pos.nextStart)}.`;
  const t = cal.terms.find((x) => x.term === pos.term);
  const label = { opening: 'Opening Block', instructional: 'Instructional Block', endOfTerm: 'End-of-Term Block' }[pos.block];
  const range = pos.block === 'opening' ? t.opening : pos.block === 'endOfTerm' ? t.endOfTerm : t.instructional;
  return `${head} It is Term ${pos.term}, ${label} (${pretty(range[0])} – ${pretty(range[1])}); Term ${pos.term} ends ${pretty(t.end)}${pos.daysToTermEnd >= 0 ? ` (${pos.daysToTermEnd} day(s) from today)` : ''}. Teacher work in this block: ${BLOCK_WORK[pos.block]}. "This term" means Term ${pos.term}.`;
}

const ASKS_ABOUT_CALENDAR = /\b(terms?|block|calendar|class\s*days|school\s*days|break|eosy|bosy|opening|school\s*year|sy\s*20\d\d|end[-\s]of[-\s](term|school)|semestral|trimester|kailan|when\s+(does|do|is|will))\b/i;

/**
 * The whole official calendar, for questions about it ("When does Term 1 end?", "What do
 * teachers do in the End-of-Term Block?"). '' unless the text is about the calendar.
 */
export function calendarFacts(text, schoolYear = '', now = new Date()) {
  if (!CALENDARS[schoolYear]) schoolYear = calendarPosition(now)?.schoolYear || '';
  const cal = CALENDARS[schoolYear];
  if (!cal || !ASKS_ABOUT_CALENDAR.test(String(text || ''))) return '';
  const range = ([a, b]) => `${pretty(a)} – ${pretty(b)}`;
  const lines = [`Official three-term calendar, SY ${schoolYear} (${cal.source}; ${cal.totalClassDays} class days):`];
  for (const t of cal.terms) {
    const parts = [t.opening && `Opening Block ${range(t.opening)}`, `Instructional Block ${range(t.instructional)}`, `End-of-Term Block ${range(t.endOfTerm)}`].filter(Boolean);
    lines.push(`- Term ${t.term}: ${range([t.start, t.end])} (${t.classDays} class days). ${parts.join('; ')}.`);
  }
  lines.push(`- End-of-school-year break: ${range(cal.eosyBreak)}.`);
  lines.push(`Work in each block (${DO9}, paras. 12–13, Figure 2): Opening Block = ${BLOCK_WORK.opening}. Instructional Block = ${BLOCK_WORK.instructional}. End-of-Term Block = ${BLOCK_WORK.endOfTerm}.`);
  return lines.join('\n');
}
