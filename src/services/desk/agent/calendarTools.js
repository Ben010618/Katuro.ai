/**
 * calendarTools.js — the teacher's schedule, by chat or voice ("Hello Matt, what's my schedule
 * tomorrow?", "schedule a parent meeting on Friday at 3 PM", "move it to 4").
 *
 * Every answer is built HERE from the teacher's real data (never written by the AI):
 *   - My classes (days, times, today's lesson; holidays, INSET and test days respected)
 *   - the teacher's own calendar entries (KaTuroDesk calendar)
 *   - the official DepEd school calendar (DO 9, s. 2026: activities, holidays, terms)
 *   - KaTuroDesk requests the teacher scheduled to run by themselves
 */
import { useDeskStore } from '../../../store/deskStore.js';
import { eventProblem, eventsOn, formatTime, remindLabel, eventAtMs } from '../../../pages/desk/calendar/reminders.js';
import { periodsOn, className, clock, addDays, isoDay, weekday } from '../teaching/teachingDay.js';
import { activitiesOn, holidayOn, upcomingActivities } from '../knowledge/depedActivities.js';
import { calendarPosition } from '../knowledge/schoolCalendar.js';
import { needsInfo } from './tools.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 31;
export const DEFAULT_REMIND = 10; // minutes before, for a timed entry when the teacher did not say

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Friday, October 24" ("today" / "tomorrow" when it is). */
export function dayLabel(iso, today) {
  const [y, m, d] = iso.split('-').map(Number);
  const plain = `${DAY[weekday(iso)]}, ${MONTH[m - 1]} ${d}${y !== Number(today.slice(0, 4)) ? `, ${y}` : ''}`;
  if (iso === today) return `Today (${plain})`;
  if (iso === addDays(today, 1)) return `Tomorrow (${plain})`;
  return plain;
}

/** "today", "tomorrow" or "on Friday, October 24", inside a sentence. */
export function whenText(iso, today) {
  if (iso === today) return 'today';
  if (iso === addDays(today, 1)) return 'tomorrow';
  return `on ${dayLabel(iso, today)}`;
}

const days = (from, to) => {
  const out = [];
  for (let d = from; d <= to && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
};

/** What one class period is about that day. */
function lessonText(p) {
  const l = p.lesson;
  if (l.kind === 'lesson') return `${l.item.text}${l.sessions > 1 ? ` (session ${l.session} of ${l.sessions})` : ''}`;
  if (l.kind === 'special') return `${l.special.title}, no new lesson`;
  if (l.kind === 'noSequence') return 'lesson not set in My classes';
  if (l.kind === 'finished') return 'all set lessons are done';
  return '';
}

/**
 * The schedule from `from` to `to` (YYYY-MM-DD), as lines for the teacher.
 *   state: { calendarEvents, myClasses, lessonSequences, teachingLog, scheduledTasks }
 *   focus: 'all' | 'classes' | 'events' | 'school' | 'next'
 * → { text, count }
 */
export function scheduleSummary({ from, to = from, focus = 'all', state, now = Date.now() }) {
  const today = isoDay(now);
  const s = state || {};
  const want = (k) => focus === 'all' || focus === k;

  if (focus === 'next') {
    // The next class or own entry from now on (two weeks ahead at most).
    const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
    for (const d of days(today, addDays(today, 14))) {
      const items = [];
      for (const p of periodsOn(s.myClasses, d, s.lessonSequences, s.teachingLog)) {
        if (d === today && p.start < nowMin) continue;
        items.push({ min: p.start, text: `${className(p.cls)} at ${clock(p.cls.start)}${lessonText(p) ? `: ${lessonText(p)}` : ''}` });
      }
      for (const ev of eventsOn(s.calendarEvents, d)) {
        if (!ev.time) continue;
        const [h, m] = ev.time.split(':').map(Number);
        if (d === today && h * 60 + m < nowMin) continue;
        items.push({ min: h * 60 + m, text: `${ev.title} at ${formatTime(ev.time)}` });
      }
      items.sort((a, b) => a.min - b.min);
      if (items.length) return { text: `Next: ${items[0].text}, ${whenText(d, today)}.`, count: 1 };
    }
    return { text: 'Nothing is scheduled for the next two weeks: no classes in My classes and no timed entries in your calendar.', count: 0 };
  }

  const lines = [];
  let count = 0;
  for (const d of days(from, to)) {
    const parts = [];
    if (want('classes')) {
      const periods = periodsOn(s.myClasses, d, s.lessonSequences, s.teachingLog);
      if (periods.length) parts.push(`Classes: ${periods.map((p) => `${clock(p.cls.start)} ${className(p.cls)}${lessonText(p) ? ` (${lessonText(p)})` : ''}`).join('; ')}.`);
      else if ((s.myClasses || []).length && focus === 'classes') {
        const h = holidayOn(d);
        parts.push(h ? `No classes: ${h.title}.` : 'No classes.');
      }
      count += periods.length;
    }
    if (want('events')) {
      const evs = eventsOn(s.calendarEvents, d);
      if (evs.length) {
        parts.push(`Your schedule: ${evs.map((ev) => `${ev.time ? `${formatTime(ev.time)} ` : ''}${ev.title}${ev.remindMinutes !== null && ev.remindMinutes !== undefined ? ` (reminder ${remindLabel(ev.remindMinutes).toLowerCase()})` : ''}`).join('; ')}.`);
        count += evs.length;
      }
      const tasks = (s.scheduledTasks || []).filter((t) => t.enabled !== false && t.nextRunAt && isoDay(t.nextRunAt) === d);
      if (tasks.length) {
        parts.push(`KaTuroDesk will run: ${tasks.map((t) => `${formatTime(new Date(t.nextRunAt).toTimeString().slice(0, 5))} ${t.name}`).join('; ')}.`);
        count += tasks.length;
      }
    }
    if (want('school')) {
      const { school, observances } = activitiesOn(d);
      const all = [...school.map((a) => a.title + (a.holiday ? ` (${a.holiday})` : '')), ...observances.map((o) => o.title)];
      if (all.length) {
        parts.push(`School calendar: ${all.join('; ')}.`);
        count += all.length;
      }
    }
    if (parts.length) lines.push(`${dayLabel(d, today)}: ${parts.join(' ')}`);
  }
  const noClasses = !(s.myClasses || []).length && want('classes') ? '(Your classes are not set yet: add them in My classes.)' : '';
  if (!lines.length) {
    const span = from === to ? whenText(from, today) : `from ${dayLabel(from, today)} to ${dayLabel(to, today)}`;
    const what = { classes: 'classes', events: 'entries in your calendar', school: 'school calendar activities' }[focus] || 'classes, calendar entries or school activities';
    return { text: `Nothing scheduled ${span}: no ${what}.${noClasses ? ` ${noClasses}` : ''}`, count: 0 };
  }
  if (noClasses) lines.push(noClasses);
  // Where the school year stands, for "calendar updates".
  if (focus === 'school' || (focus === 'all' && from !== to)) {
    const pos = calendarPosition(from);
    if (pos?.term) lines.push(`(Term ${pos.term}; it ends in ${pos.daysToTermEnd} day${pos.daysToTermEnd === 1 ? '' : 's'}.)`);
  }
  return { text: lines.join('\n'), count };
}

const stateNow = () => {
  const s = useDeskStore.getState();
  return { calendarEvents: s.calendarEvents, myClasses: s.myClasses, lessonSequences: s.lessonSequences, teachingLog: s.teachingLog, scheduledTasks: s.scheduledTasks };
};

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const matchTitle = (ev, q) => {
  const a = clean(ev.title).toLowerCase();
  const b = clean(q).toLowerCase();
  return Boolean(b) && (a.includes(b) || b.includes(a) || b.split(' ').filter((w) => w.length > 3).every((w) => a.includes(w)));
};

export const CALENDAR_TOOLS = {
  my_schedule: {
    label: 'My schedule',
    description: "Answer questions about the teacher's own schedule, from their real data: classes (My classes, with today's lesson), their KaTuroDesk calendar entries and reminders, the official DepEd school calendar (activities, holidays, test days, term dates) and KaTuroDesk requests scheduled to run. Use for \"what's my schedule today/tomorrow/this week\", \"what's my next class\", \"what's coming up\", \"any school activities or holidays next week\", \"calendar updates\". Dates as YYYY-MM-DD from today's date; focus 'next' = only the next class or timed entry.",
    args: '{ "from"?: "YYYY-MM-DD" (default today), "to"?: "YYYY-MM-DD" (default = from; at most 31 days), "focus"?: "all" | "classes" | "events" | "school" | "next" }',
    async run({ from, to, focus = 'all' } = {}) {
      const today = isoDay();
      const start = ISO.test(from || '') ? from : today;
      let end = ISO.test(to || '') ? to : start;
      if (end < start) end = start;
      if (end > addDays(start, MAX_DAYS - 1)) end = addDays(start, MAX_DAYS - 1);
      const f = ['all', 'classes', 'events', 'school', 'next'].includes(focus) ? focus : 'all';
      const out = scheduleSummary({ from: start, to: end, focus: f, state: stateNow() });
      // Coming school activities, for "what's coming up" (two weeks).
      let extra = '';
      if (f === 'school' && start === end) {
        const next = upcomingActivities(addDays(start, 1), 14).slice(0, 5);
        if (next.length) extra = `\nComing up: ${next.map((x) => `${x.activity.title} (${dayLabel(x.iso, today).replace(/ \(.*\)$/, '')})`).join('; ')}.`;
      }
      return { summary: out.count ? `${out.count} item${out.count === 1 ? '' : 's'}` : 'nothing scheduled', reply: out.text + extra };
    },
  },

  add_calendar_event: {
    label: 'Add to my calendar',
    description: "Add an entry to the teacher's KaTuroDesk calendar (shows in the Calendar; a timed entry rings an alarm). Use for \"schedule a parent meeting on Friday at 3 PM\", \"add LAC session next Wednesday 1 PM\", \"remind me to submit grades tomorrow at 8\". date = YYYY-MM-DD worked out from today's date; time = 24-hour HH:MM only if the teacher said a time; remindMinutes only if the teacher said when to be reminded (default 10 minutes before a timed entry). Ask when the day is not clear.",
    args: '{ "title": string, "date": "YYYY-MM-DD", "time"?: "HH:MM", "remindMinutes"?: number (minutes before; 0 = at the time), "note"?: string }',
    async run({ title, date, time = '', remindMinutes, note = '' } = {}) {
      const draft = { title: clean(title).slice(0, 120), date: String(date || ''), time: String(time || ''), note: clean(note) };
      if (!draft.title) throw needsInfo('What should I call this calendar entry?');
      if (!ISO.test(draft.date)) throw needsInfo(`Which day is "${draft.title}"?`);
      const said = remindMinutes !== undefined && remindMinutes !== null && remindMinutes !== '';
      draft.remindMinutes = draft.time ? (said ? Math.max(0, Math.round(Number(remindMinutes) || 0)) : DEFAULT_REMIND) : null;
      const problem = eventProblem(draft);
      if (problem) throw needsInfo(problem);
      const today = isoDay();
      const at = eventAtMs(draft);
      if (draft.date < today || (at !== null && at < Date.now())) throw needsInfo(`${dayLabel(draft.date, today)}${draft.time ? ` at ${formatTime(draft.time)}` : ''} has already passed. Which day did you mean?`);
      const s = useDeskStore.getState();
      const same = (s.calendarEvents || []).find((ev) => ev.date === draft.date && ev.time === draft.time && clean(ev.title).toLowerCase() === draft.title.toLowerCase());
      const when = `${dayLabel(draft.date, today)}${draft.time ? ` at ${formatTime(draft.time)}` : ' (all day)'}`;
      if (same) return { summary: 'already in your calendar', reply: `"${draft.title}" is already in your calendar: ${when}.` };
      s.addCalendarEvent(draft);
      const reminder = draft.remindMinutes === null ? '' : draft.remindMinutes === 0 ? ' I will remind you at that time.' : ` I will remind you ${remindLabel(draft.remindMinutes).toLowerCase() || `${draft.remindMinutes} minutes before`}${said ? '' : ' (say another time if you prefer)'}.`;
      return { summary: `added: ${draft.title}`, reply: `Added to your calendar: ${draft.title}, ${when}.${reminder}` };
    },
  },

  change_calendar_event: {
    label: 'Change my calendar',
    description: "Move, rename, change the reminder of, or cancel an entry the teacher made in their KaTuroDesk calendar (not classes, not the DepEd school calendar). Find it by title words and/or its date. Use for \"move my parent meeting to 4 PM\", \"cancel the LAC session on Wednesday\", \"rename tomorrow's meeting\". New dates as YYYY-MM-DD, times as 24-hour HH:MM.",
    args: '{ "title"?: string (words of the entry\'s title), "date"?: "YYYY-MM-DD" (its current date), "cancel"?: boolean, "newTitle"?: string, "newDate"?: "YYYY-MM-DD", "newTime"?: "HH:MM" | "" (all day), "remindMinutes"?: number | null (null = no reminder) }',
    async run({ title, date, cancel = false, newTitle, newDate, newTime, remindMinutes } = {}) {
      const s = useDeskStore.getState();
      const today = isoDay();
      if (!clean(title) && !ISO.test(date || '')) throw needsInfo('Which calendar entry do you mean? Tell me its name or its day.');
      let found = (s.calendarEvents || []).filter((ev) => ev.date >= today);
      if (clean(title)) found = found.filter((ev) => matchTitle(ev, title));
      if (ISO.test(date || '')) found = found.filter((ev) => ev.date === date);
      if (!found.length) throw needsInfo(`I couldn't find ${clean(title) ? `"${clean(title)}"` : 'an entry'}${ISO.test(date || '') ? ` on ${dayLabel(date, today)}` : ''} among your coming calendar entries. What is it called?`);
      if (found.length > 1) throw needsInfo(`Which one? ${found.slice(0, 5).map((ev) => `"${ev.title}" on ${dayLabel(ev.date, today)}${ev.time ? ` at ${formatTime(ev.time)}` : ''}`).join('; ')}.`);
      const ev = found[0];
      if (cancel) {
        s.removeCalendarEvent(ev.id);
        return { summary: `cancelled: ${ev.title}`, reply: `Removed from your calendar: ${ev.title}, ${dayLabel(ev.date, today)}${ev.time ? ` at ${formatTime(ev.time)}` : ''}.` };
      }
      const next = { ...ev };
      if (clean(newTitle)) next.title = clean(newTitle).slice(0, 120);
      if (ISO.test(newDate || '')) next.date = newDate;
      if (newTime !== undefined && newTime !== null) next.time = String(newTime);
      if (remindMinutes === null) next.remindMinutes = null;
      else if (remindMinutes !== undefined && remindMinutes !== '') next.remindMinutes = Math.max(0, Math.round(Number(remindMinutes) || 0));
      if (!next.time) next.remindMinutes = null;
      else if (remindMinutes === undefined && !ev.time) next.remindMinutes = DEFAULT_REMIND; // an all-day note that now has a time
      const problem = eventProblem(next);
      if (problem) throw needsInfo(problem);
      const at = eventAtMs(next);
      if (next.date < today || (at !== null && at < Date.now())) throw needsInfo('That new time has already passed. When should it be?');
      // A moved entry rings again at its new time.
      s.updateCalendarEvent(ev.id, { title: next.title, date: next.date, time: next.time, remindMinutes: next.remindMinutes, snoozeUntil: null, doneAt: null });
      return { summary: `updated: ${next.title}`, reply: `Updated: ${next.title}, ${dayLabel(next.date, today)}${next.time ? ` at ${formatTime(next.time)}` : ' (all day)'}${next.remindMinutes !== null ? `, reminder ${remindLabel(next.remindMinutes).toLowerCase() || `${next.remindMinutes} minutes before`}` : ''}.` };
    },
  },
};

