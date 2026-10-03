/**
 * schedule.js — when scheduled tasks run (pure functions, no UI or storage).
 *
 * A schedule is { repeat, date, time, weekdays, dayOfMonth } in the teacher's local time:
 *   repeat:     'once' | 'daily' | 'weekdays' | 'weekly' | 'monthly'
 *   date:       'YYYY-MM-DD' — the run date for 'once', the start date for repeating tasks
 *   time:       'HH:MM' (24-hour)
 *   weekdays:   [0..6] (0 = Sunday) — for 'weekly'
 *   dayOfMonth: 1..31 — for 'monthly' (short months use their last day)
 *
 * Tasks only run while KaTuroDesk is open (or running in the background). A run that was
 * missed while the app was closed happens ONCE when it opens again — never repeated per miss.
 */

export const REPEATS = ['once', 'daily', 'weekdays', 'weekly', 'monthly'];
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A run counts as "late" (missed while closed / asleep) when it starts this long after its time. */
export const LATE_AFTER_MS = 2 * 60 * 1000;
const MAX_HISTORY = 10;

const pad = (n) => String(n).padStart(2, '0');

export function toDateInput(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? { y, mo: mo - 1, d } : null;
}

function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const [h, mi] = [Number(m[1]), Number(m[2])];
  return h <= 23 && mi <= 59 ? { h, mi } : null;
}

function daysInMonth(y, mo) {
  return new Date(y, mo + 1, 0).getDate();
}

/** Returns a list of problems (empty when the schedule is valid). */
export function validateSchedule(s, { now = Date.now(), isNew = true } = {}) {
  const errors = [];
  if (!s || !REPEATS.includes(s.repeat)) errors.push('Choose how often the task repeats.');
  const date = parseDate(s?.date);
  const time = parseTime(s?.time);
  if (!date) errors.push(s?.repeat === 'once' ? 'Choose the date.' : 'Choose the start date.');
  if (!time) errors.push('Choose the time.');
  if (s?.repeat === 'weekly' && !(Array.isArray(s.weekdays) && s.weekdays.some((d) => d >= 0 && d <= 6))) {
    errors.push('Pick at least one day of the week.');
  }
  if (s?.repeat === 'monthly' && !(Number.isInteger(s.dayOfMonth) && s.dayOfMonth >= 1 && s.dayOfMonth <= 31)) {
    errors.push('Choose a day of the month (1–31).');
  }
  if (!errors.length && isNew && s.repeat === 'once') {
    const at = new Date(date.y, date.mo, date.d, time.h, time.mi).getTime();
    if (at <= now) errors.push('That date and time has already passed.');
  }
  return errors;
}

/**
 * The first run time strictly after `after` (ms), or null when there is none
 * (a 'once' task whose time has passed, or an invalid schedule).
 */
export function computeNextRun(s, after = Date.now()) {
  const date = parseDate(s?.date);
  const time = parseTime(s?.time);
  if (!date || !time || !REPEATS.includes(s.repeat)) return null;
  const at = (y, mo, d) => new Date(y, mo, d, time.h, time.mi, 0, 0).getTime();
  const start = at(date.y, date.mo, date.d);

  if (s.repeat === 'once') return start > after ? start : null;

  if (s.repeat === 'monthly') {
    const dom = Number(s.dayOfMonth);
    if (!(dom >= 1 && dom <= 31)) return null;
    for (let i = 0; i < 14; i += 1) {
      const y = date.y + Math.floor((date.mo + i) / 12);
      const mo = (date.mo + i) % 12;
      const t = at(y, mo, Math.min(dom, daysInMonth(y, mo)));
      if (t >= start && t > after) return t;
    }
    // `after` is far beyond the start date: restart the search from the month of `after`.
    const a = new Date(after);
    return computeNextRun({ ...s, date: toDateInput(new Date(a.getFullYear(), a.getMonth(), 1)) }, after);
  }

  const allowed = s.repeat === 'daily' ? [0, 1, 2, 3, 4, 5, 6]
    : s.repeat === 'weekdays' ? [1, 2, 3, 4, 5]
      : (s.weekdays || []).filter((d) => d >= 0 && d <= 6);
  if (!allowed.length) return null;
  // Start from whichever is later: the start date or the day of `after`.
  const from = new Date(Math.max(start, after));
  for (let i = 0; i < 9; i += 1) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const t = at(day.getFullYear(), day.getMonth(), day.getDate());
    if (t >= start && t > after && allowed.includes(day.getDay())) return t;
  }
  return null;
}

function formatTime(time) {
  const t = parseTime(time);
  if (!t) return '';
  const h12 = t.h % 12 || 12;
  return `${h12}:${pad(t.mi)} ${t.h < 12 ? 'AM' : 'PM'}`;
}

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

/** "Every weekday at 7:30 AM", "Once on Fri, Oct 10, 2026 at 4:00 PM", … */
export function describeSchedule(s) {
  const time = formatTime(s?.time);
  const d = parseDate(s?.date);
  const dateText = d ? new Date(d.y, d.mo, d.d).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
  switch (s?.repeat) {
    case 'once': return `Once on ${dateText} at ${time}`;
    case 'daily': return `Every day at ${time}`;
    case 'weekdays': return `Every weekday (Mon–Fri) at ${time}`;
    case 'weekly': {
      const days = [...new Set(s.weekdays || [])].sort().map((i) => DAY_SHORT[i]).join(', ');
      return `Every ${days} at ${time}`;
    }
    case 'monthly': return `Monthly on the ${ordinal(Number(s.dayOfMonth))} at ${time}`;
    default: return '';
  }
}

/** "Fri, Oct 10, 4:00 PM" for a timestamp. */
export function formatWhen(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Builds a new task record. Throws with the validation message when the schedule is invalid. */
export function createTask({ name, prompt, attachedPaths = [], schedule, workspaceId, workspaceName }, now = Date.now()) {
  const title = String(name || '').trim();
  const text = String(prompt || '').trim();
  if (!text) throw new Error('Write what the task should do.');
  if (!workspaceId) throw new Error('Open your classroom folder first.');
  const errors = validateSchedule(schedule, { now, isNew: true });
  if (errors.length) throw new Error(errors[0]);
  const nextRunAt = computeNextRun(schedule, now);
  if (!nextRunAt) throw new Error('This schedule has no upcoming run.');
  return {
    id: `task-${now}-${Math.random().toString(36).slice(2, 6)}`,
    name: title || shortName(text),
    prompt: text,
    attachedPaths: [...new Set(attachedPaths)],
    schedule: normalizeSchedule(schedule),
    workspaceId,
    workspaceName: workspaceName || '',
    enabled: true,
    nextRunAt,
    lastRunAt: null,
    lastStatus: null,
    runs: [],
    createdAt: now,
  };
}

/** The first words of the request as a task name, cut at a word boundary. */
export function shortName(text, max = 60) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > 20 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,.;:–—-]+$/, '')}…`;
}

export function normalizeSchedule(s) {
  const out = { repeat: s.repeat, date: s.date, time: s.time };
  if (s.repeat === 'weekly') out.weekdays = [...new Set(s.weekdays)].filter((d) => d >= 0 && d <= 6).sort();
  if (s.repeat === 'monthly') out.dayOfMonth = Number(s.dayOfMonth);
  return out;
}

/** Applies edits to an existing task, recomputing its next run. */
export function updateTask(task, patch, now = Date.now()) {
  const next = { ...task, ...patch };
  if (patch.prompt !== undefined && !String(patch.prompt).trim()) throw new Error('Write what the task should do.');
  if (patch.name !== undefined) next.name = String(patch.name).trim() || shortName(next.prompt);
  if (patch.schedule) {
    // A changed 'once' time must be in the future; an unchanged one may be in the past (already ran).
    const changed = JSON.stringify(normalizeSchedule(patch.schedule)) !== JSON.stringify(task.schedule);
    const errors = validateSchedule(patch.schedule, { now, isNew: changed });
    if (errors.length) throw new Error(errors[0]);
    next.schedule = normalizeSchedule(patch.schedule);
  }
  if (patch.schedule || patch.enabled === true) {
    next.nextRunAt = computeNextRun(next.schedule, now);
    if (!next.nextRunAt && patch.enabled === true) throw new Error('This task has no upcoming run. Change its date or time first.');
    if (!next.nextRunAt) next.enabled = false;
    else if (patch.schedule && patch.enabled === undefined && !task.nextRunAt) next.enabled = true; // a finished task given a new time runs again
  }
  return next;
}

/** Tasks whose time has come and whose folder is the one open now, oldest first. */
export function dueTasks(tasks, now, workspaceId) {
  return (tasks || [])
    .filter((t) => t.enabled && t.nextRunAt && t.nextRunAt <= now && t.workspaceId === workspaceId && t.lastStatus !== 'running')
    .sort((a, b) => a.nextRunAt - b.nextRunAt);
}

/** Enabled tasks that are due but wait for a different folder to be opened. */
export function waitingForFolder(tasks, now, workspaceId) {
  return (tasks || []).filter((t) => t.enabled && t.nextRunAt && t.nextRunAt <= now && t.workspaceId !== workspaceId);
}

/** Marks a task as started: its next run moves past `now` so it can never start twice. */
export function startRun(task, now = Date.now()) {
  const nextRunAt = computeNextRun(task.schedule, now);
  return {
    ...task,
    scheduledFor: task.nextRunAt,
    lastStatus: 'running',
    nextRunAt,
    enabled: Boolean(nextRunAt) && task.enabled,
  };
}

/** Records how a run ended (status: 'done' | 'needs_info' | 'error'). */
export function finishRun(task, { status, summary = '', startedAt, finishedAt = Date.now(), files = [] }) {
  const run = {
    at: startedAt || finishedAt,
    scheduledFor: task.scheduledFor || null,
    late: Boolean(task.scheduledFor && (startedAt || finishedAt) - task.scheduledFor > LATE_AFTER_MS),
    status,
    summary: String(summary || '').slice(0, 400),
    files: files.slice(0, 20),
  };
  const rest = { ...task };
  delete rest.scheduledFor;
  return { ...rest, lastRunAt: run.at, lastStatus: status, runs: [run, ...(task.runs || [])].slice(0, MAX_HISTORY) };
}

/** After an app restart, a run that was cut off is shown as interrupted, never left "running". */
export function recoverInterrupted(tasks) {
  return (tasks || []).map((t) => (t.lastStatus === 'running' ? finishRun(t, { status: 'error', summary: 'Interrupted — KaTuroDesk was closed while this task was running.' }) : t));
}
