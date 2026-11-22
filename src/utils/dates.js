/**
 * dates.js — the teacher's local calendar days and clock times, shared by KaTuroDesk
 * (teaching/teachingDay.js re-exports these) and the KaTuro App. Never UTC: a day is the
 * teacher's own day in the Philippines.
 */
const pad = (n) => String(n).padStart(2, '0');

/** Local date YYYY-MM-DD of a time. */
export const isoDay = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** "07:30" → 450 */
export const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** "2026-11-16" + 3 → "2026-11-19" */
/** { year, month: 1–12 } moved by `by` months (the calendars' arrows). */
export function shiftMonth({ year, month }, by) {
  const d = new Date(year, month - 1 + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
export const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoDay(new Date(y, m - 1, d + n, 12).getTime()); };
/** "13:05" → "1:05 PM" */
export const clock = (hhmm) => { const m = toMin(hhmm); if (m === null) return ''; const h = Math.floor(m / 60); return `${((h + 11) % 12) + 1}:${pad(m % 60)} ${h < 12 ? 'AM' : 'PM'}`; };
