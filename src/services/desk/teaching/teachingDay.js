/**
 * teachingDay.js — the teacher's classes, day by day, by code (no AI):
 *   which days a class really meets (the teacher's schedule, the DO 9 calendar, holidays,
 *   INSET, breaks, and days the teacher says have no classes), which lesson falls on each
 *   meeting (the class's lesson sequence, one session per meeting), and which reminders,
 *   briefs and after-class checks are due now.
 *
 * Plain data in, plain data out, so every rule is testable and nothing is guessed.
 */
import { holidayOn, activitiesOn } from '../knowledge/depedActivities.js';
import { calendarPosition } from '../knowledge/schoolCalendar.js';

export const DEFAULT_SETTINGS = {
  remind: [30, 10], // minutes before each class
  morningBrief: true,
  morningTime: '06:30',
  afterClass: true,
  prepTime: '19:00', // the next school day's lessons are prepared from this time
  planFormat: 'dlp', // 'dlp' (a lesson plan per day) | 'dll' (one Daily Lesson Log per week)
  slides: true,
  worksheet: false,
  slideCount: 10,
  bubble: true,
  voice: false,
};

const pad = (n) => String(n).padStart(2, '0');
/** Local date YYYY-MM-DD of a time. */
export const isoDay = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** "07:30" → 450 */
export const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** The time of a day's minute, as epoch ms (local time). */
export const at = (iso, min) => { const [y, mo, d] = iso.split('-').map(Number); return new Date(y, mo - 1, d, Math.floor(min / 60), min % 60).getTime(); };
export const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoDay(new Date(y, m - 1, d + n, 12).getTime()); };
export const weekday = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12).getDay(); };
/** "13:05" → "1:05 PM" */
export const clock = (hhmm) => { const m = toMin(hhmm); if (m === null) return ''; const h = Math.floor(m / 60); return `${((h + 11) % 12) + 1}:${pad(m % 60)} ${h < 12 ? 'AM' : 'PM'}`; };
/** "Science 7 – Rizal" */
export const className = (c) => `${c.subject} ${String(c.grade || '').replace(/^Grade\s*/i, '')}${c.section ? ` – ${c.section}` : ''}`.replace(/\s+/g, ' ').trim();

/** Problems with one class entry (empty when it is fine). */
export function classProblems(c, others = []) {
  const out = [];
  if (!String(c.subject || '').trim()) out.push('the learning area is missing');
  if (!/^(Grade (1[0-2]|[1-9])|Kindergarten)$/.test(String(c.grade || ''))) out.push('the grade is missing');
  if (!Array.isArray(c.days) || !c.days.length) out.push('pick at least one day');
  const s = toMin(c.start);
  const e = toMin(c.end);
  if (s === null || e === null) out.push('the start or end time is missing');
  else if (e <= s) out.push('the class must end after it starts');
  for (const o of others) {
    if (o.id === c.id || s === null || e === null) continue;
    const os = toMin(o.start);
    const oe = toMin(o.end);
    const shared = (c.days || []).filter((d) => (o.days || []).includes(d));
    if (shared.length && os !== null && oe !== null && s < oe && os < e) out.push(`it overlaps ${className(o)} (${clock(o.start)}–${clock(o.end)})`);
  }
  return out;
}

/**
 * Does this class meet on this day?
 * → { meets: true, special? } or { meets: false, reason }
 *   special: { kind: 'assessment'|'endOfTerm'|'opening', title } — the class meets but no new lesson
 */
export function classDay(c, iso, log = {}) {
  if (!(c.days || []).includes(weekday(iso))) return { meets: false, reason: 'not a day of this class' };
  if ((log.noClass || []).includes(iso)) return { meets: false, reason: 'no classes (you said so)' };
  if ((log.noClassFor?.[c.id] || []).includes(iso)) return { meets: false, reason: 'no class (you said so)' };
  const holiday = holidayOn(iso);
  if (holiday) return { meets: false, reason: `holiday: ${holiday.title}` };
  const school = activitiesOn(iso).school;
  const inset = school.find((a) => a.kind === 'inset');
  if (inset) return { meets: false, reason: `INSET: ${inset.title}` };
  const pos = calendarPosition(iso);
  if (pos && (pos.block === 'eosyBreak' || pos.block === 'betweenTerms')) return { meets: false, reason: 'school break' };
  if (pos?.block === 'opening') return { meets: true, special: { kind: 'opening', title: 'Opening days of the school year (orientation and assessments)' } };
  if (pos?.block === 'endOfTerm') return { meets: true, special: { kind: 'endOfTerm', title: `End-of-term block of Term ${pos.term} (grades, report cards, remediation)` } };
  // School-wide test days only (grade-specific national tests like NAT do not stop every class).
  const test = school.find((a) => a.kind === 'assessment' && /teacher-made summative test|term \d examination/i.test(a.title));
  if (test) return { meets: true, special: { kind: 'assessment', title: test.title } };
  return { meets: true };
}

/** One lesson key, shared by sections that have the same lesson that day (prepared once). */
export const lessonKey = (iso, c, item, session) => `${iso}|${c.subject}|${c.grade}|${item.code || item.text}|${session}`.toLowerCase();

/**
 * What this class does on this day.
 *   seq: { items: [{ code?, text, sessions }], startDate, startIndex = 0, startSession = 0 }
 *   log: { noClass, noClassFor, repeat: { [classId]: [iso] } } — "repeat" = a meeting that did not
 *        finish its lesson, so the same session comes again next time
 * → { kind: 'lesson', item, index, session (1-based), sessions, key }
 *   | { kind: 'special', special } | { kind: 'none', reason } | { kind: 'noSequence' } | { kind: 'finished' }
 */
export function lessonFor(c, iso, seq, log = {}) {
  const day = classDay(c, iso, log);
  if (!day.meets) return { kind: 'none', reason: day.reason };
  if (day.special) return { kind: 'special', special: day.special };
  if (!seq || !Array.isArray(seq.items) || !seq.items.length || !seq.startDate) return { kind: 'noSequence' };
  if (iso < seq.startDate) return { kind: 'noSequence' };
  let index = Number(seq.startIndex) || 0;
  let session = Number(seq.startSession) || 0;
  const repeat = new Set(log.repeat?.[c.id] || []);
  for (let d = seq.startDate; d < iso; d = addDays(d, 1)) {
    const cd = classDay(c, d, log);
    if (!cd.meets || cd.special || repeat.has(d)) continue;
    session += 1;
    while (index < seq.items.length && session >= Math.max(1, Number(seq.items[index].sessions) || 1)) { session -= Math.max(1, Number(seq.items[index].sessions) || 1); index += 1; }
  }
  if (index >= seq.items.length) return { kind: 'finished' };
  const item = seq.items[index];
  const sessions = Math.max(1, Number(item.sessions) || 1);
  return { kind: 'lesson', item, index, session: session + 1, sessions, key: lessonKey(iso, c, item, session + 1) };
}

/** A day's class periods, earliest first: [{ cls, start, end, lesson }] */
export function periodsOn(classes, iso, sequences = {}, log = {}) {
  return (classes || [])
    .filter((c) => !classProblems(c).length && (c.days || []).includes(weekday(iso)))
    .map((c) => ({ cls: c, start: toMin(c.start), end: toMin(c.end), lesson: lessonFor(c, iso, sequences[c.id], log) }))
    .filter((p) => p.lesson.kind !== 'none')
    .sort((a, b) => a.start - b.start);
}

/** The next day with classes after `iso` (within two weeks), or null. */
export function nextSchoolDay(classes, iso, sequences = {}, log = {}) {
  for (let i = 1; i <= 14; i += 1) {
    const d = addDays(iso, i);
    if (periodsOn(classes, d, sequences, log).length) return d;
  }
  return null;
}

/**
 * Lessons that should be prepared now: today's lessons that have not started yet, and
 * the next school day's lessons once it is past the prep time. Shared lessons appear once.
 * → [{ key, iso, cls, sections: [cls], lesson }]
 */
export function lessonsToPrepare(now, { classes, sequences, log, settings = DEFAULT_SETTINGS, prepared = {} }) {
  const today = isoDay(now);
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const days = [today];
  const prepMin = toMin(settings.prepTime) ?? 19 * 60;
  if (nowMin >= prepMin) { const next = nextSchoolDay(classes, today, sequences, log); if (next) days.push(next); }
  const out = new Map();
  for (const d of days) {
    for (const p of periodsOn(classes, d, sequences, log)) {
      if (p.lesson.kind !== 'lesson') continue;
      if (d === today && p.end <= nowMin) continue; // already over
      const k = p.lesson.key;
      const status = prepared[k]?.status;
      const age = now - (prepared[k]?.at || 0);
      // A failed lesson is tried again after 30 minutes; one stuck "preparing" (app closed mid-way) after 20.
      const retry = (status === 'failed' && age > 30 * 60000) || (status === 'preparing' && age > 20 * 60000);
      if ((status === 'ready' || status === 'preparing' || status === 'failed') && !retry) continue;
      if (out.has(k)) out.get(k).sections.push(p.cls);
      else out.set(k, { key: k, iso: d, cls: p.cls, sections: [p.cls], lesson: p.lesson, start: p.start });
    }
  }
  // Soonest first.
  return [...out.values()].sort((a, b) => (a.iso === b.iso ? a.start - b.start : a.iso < b.iso ? -1 : 1));
}

/**
 * Events due now that have not been shown yet (`fired` = keys already shown).
 * → [{ type: 'brief'|'remind'|'after', key, period?, minutes?, periods? }]
 *   When the app opens late, only the latest reminder of a class is shown (the earlier ones are
 *   returned in `skip` so they are not shown afterwards either).
 */
export function dueEvents(now, { classes, sequences, log, settings = DEFAULT_SETTINGS, fired = {} }) {
  const today = isoDay(now);
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const periods = periodsOn(classes, today, sequences, log);
  const events = [];
  const skip = [];
  if (!periods.length) return { events, skip };
  const briefMin = toMin(settings.morningTime);
  const briefKey = `brief|${today}`;
  if (settings.morningBrief && briefMin !== null && !fired[briefKey] && nowMin >= briefMin) {
    // A brief needs some time before the first class; closer than 15 minutes, the reminder says it all.
    if (nowMin <= periods[0].start - 15) events.push({ type: 'brief', key: briefKey, periods });
    else skip.push(briefKey);
  }
  const minutes = [...new Set((settings.remind || []).map(Number).filter((m) => m > 0 && m <= 180))].sort((a, b) => b - a);
  for (const p of periods) {
    const due = minutes.filter((m) => nowMin >= p.start - m && nowMin < p.start);
    const fresh = due.filter((m) => !fired[`remind|${today}|${p.cls.id}|${m}`]);
    if (fresh.length) {
      const latest = Math.min(...fresh);
      events.push({ type: 'remind', key: `remind|${today}|${p.cls.id}|${latest}`, period: p, minutes: p.start - nowMin });
      fresh.filter((m) => m !== latest).forEach((m) => skip.push(`remind|${today}|${p.cls.id}|${m}`));
    }
    const afterKey = `after|${today}|${p.cls.id}`;
    if (settings.afterClass && p.lesson.kind === 'lesson' && !fired[afterKey] && nowMin >= p.end && nowMin < p.end + 60) {
      events.push({ type: 'after', key: afterKey, period: p });
    }
  }
  // The most urgent first: a class about to start, then the brief, then "did you finish?".
  const rank = { remind: 0, brief: 1, after: 2 };
  events.sort((a, b) => rank[a.type] - rank[b.type] || (a.period?.start ?? 0) - (b.period?.start ?? 0));
  return { events, skip };
}

/** Is a class going on right now? (the bubble stays quiet) */
export function inClassNow(now, { classes, sequences, log }) {
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  return periodsOn(classes, isoDay(now), sequences, log).find((p) => nowMin >= p.start && nowMin < p.end) || null;
}

/** Fired-event keys older than three days are dropped (keeps the saved settings small). */
export function pruneFired(fired, now) {
  const cutoff = addDays(isoDay(now), -3);
  return Object.fromEntries(Object.entries(fired || {}).filter(([k]) => { const d = k.split('|')[1]; return !d || d >= cutoff; }));
}
