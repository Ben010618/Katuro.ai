/**
 * reminders.js — the teacher's own schedules and notes in the KaTuroDesk calendar,
 * and when their alarms ring. Plain functions (no timers), so they are tested alone.
 *
 * Event: { id, date: 'YYYY-MM-DD', time: 'HH:MM' | '', title, note, remindMinutes:
 *          null | minutes before, doneAt?, snoozeUntil?, createdAt }
 */

export const REMIND_OPTIONS = [
  { value: null, label: 'No reminder (note only)' },
  { value: 0, label: 'At the time' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

/** An alarm keeps ringing until dismissed or snoozed, at most this long; then it counts as missed. */
export const RING_LIMIT_MS = 30 * 60 * 1000;

export function remindLabel(minutes) {
  return REMIND_OPTIONS.find((o) => o.value === minutes)?.label || '';
}

/** When the event itself happens (local time), or null for an all-day note. */
export function eventAtMs(ev) {
  if (!ev?.date || !ev.time) return null;
  const t = new Date(`${ev.date}T${ev.time}:00`).getTime();
  return Number.isFinite(t) ? t : null;
}

/** When the alarm should ring (snooze moves it), or null when there is no reminder. */
export function alarmAtMs(ev) {
  if (ev?.remindMinutes === null || ev?.remindMinutes === undefined) return null;
  const at = eventAtMs(ev);
  if (at === null) return null;
  return ev.snoozeUntil || at - ev.remindMinutes * 60000;
}

/** Alarms that should be ringing now (due, not dismissed, not past the ring limit). */
export function ringingAlarms(events, now = Date.now()) {
  return (events || [])
    .filter((ev) => {
      const at = alarmAtMs(ev);
      return at !== null && !ev.doneAt && at <= now && now - at < RING_LIMIT_MS;
    })
    .sort((a, b) => alarmAtMs(a) - alarmAtMs(b));
}

/** Alarms that rang out (or were due while the computer was off) and were never dismissed. */
export function missedAlarms(events, now = Date.now()) {
  return (events || []).filter((ev) => {
    const at = alarmAtMs(ev);
    return at !== null && !ev.doneAt && now - at >= RING_LIMIT_MS;
  });
}

/** Checks a new or edited event. → '' when fine, or what to fix. */
export function eventProblem(draft) {
  const title = String(draft?.title || '').trim();
  if (!title) return 'Give it a title.';
  if (title.length > 120) return 'The title can be at most 120 characters.';
  if (String(draft?.note || '').length > 1000) return 'The note can be at most 1000 characters.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(draft?.date || '')) || Number.isNaN(new Date(`${draft.date}T12:00:00`).getTime())) return 'Choose a date.';
  if (draft.time && !/^\d{2}:\d{2}$/.test(draft.time)) return 'Choose a valid time.';
  if (draft.remindMinutes !== null && draft.remindMinutes !== undefined && !draft.time) return 'A reminder needs a time. Set the time, or choose "No reminder".';
  return '';
}

/** Events on one day, timed ones first by time, then all-day notes. */
export function eventsOn(events, iso) {
  return (events || [])
    .filter((ev) => ev.date === iso)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || String(a.title).localeCompare(String(b.title)));
}

/** "7:30 AM" from "07:30". */
export function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}
