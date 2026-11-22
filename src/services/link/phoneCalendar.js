/**
 * phoneCalendar.js — the month calendar on the KaTuro App (Today tab). Pure code.
 * Weeks start on Sunday, like the calendars on Filipino classroom walls.
 */
import { isoDay, shiftMonth } from '../../utils/dates.js';

export { shiftMonth };

export const CALENDAR_CACHE_KEY = 'katuro-phone-calendar-v1';
const MONTH_CACHE = CALENDAR_CACHE_KEY;
const KEEP_MONTHS = 4;

/** "2026-11" for a month; month 1–12. */
export const monthKey = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
export const monthOf = (iso) => ({ year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) });

/** First and last day of the month (what KaTuroDesk is asked for: at most 31 days). */
export function monthRange({ year, month }) {
  const last = new Date(year, month, 0).getDate();
  return { from: `${monthKey(year, month)}-01`, to: `${monthKey(year, month)}-${String(last).padStart(2, '0')}` };
}

/** The 6×7 grid of a month: [{ iso, day, inMonth }], Sunday first. */
export function monthGrid({ year, month }) {
  const first = new Date(year, month - 1, 1);
  const start = new Date(year, month - 1, 1 - first.getDay(), 12);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12);
    return { iso: isoDay(d.getTime()), day: d.getDate(), inMonth: d.getMonth() === month - 1 };
  });
}

/** The kinds on a day, for the coloured dots: classes, own events (undone), school days. */
export function dayKinds(items = []) {
  const kinds = new Set();
  for (const it of items) {
    if (it.kind === 'class') kinds.add('class');
    else if (it.kind === 'event' && !it.done) kinds.add('event');
    else if (it.kind === 'school') kinds.add('school');
  }
  return ['event', 'class', 'school'].filter((k) => kinds.has(k));
}

/** schedule answer → { [iso]: items } */
export const itemsByDay = (days = []) => Object.fromEntries((days || []).map((d) => [d.date, d.items || []]));

/**
 * The days to show: the saved month, with the days the 14-day copy covers taken from
 * whichever copy is newer (each answer has from/to and `at`, when it was fetched).
 */
export function mergeDays(month, recent) {
  const a = month?.days ? month : null;
  const b = recent?.days ? recent : null;
  if (!a || !b) return itemsByDay((a || b)?.days);
  const [older, newer] = String(b.at || '') >= String(a.at || '') ? [a, b] : [b, a];
  const out = itemsByDay(older.days);
  // KaTuroDesk sends no empty days: a day in the newer copy's range that it leaves out is empty now.
  if (newer.from && newer.to) for (const iso of Object.keys(out)) if (iso >= newer.from && iso <= newer.to) delete out[iso];
  return { ...out, ...itemsByDay(newer.days) };
}

// ── A copy of the months seen, for no Wi-Fi ──
export function loadMonths() {
  try { return JSON.parse(localStorage.getItem(MONTH_CACHE) || '{}') || {}; } catch { return {}; }
}
/** Keeps the newest few months only. */
export function saveMonth(key, value, store = loadMonths()) {
  const next = { ...store, [key]: { ...value, at: new Date().toISOString() } };
  // The month just saved first, then the most recently seen others.
  const others = Object.keys(store).filter((k) => k !== key).sort((a, b) => String(store[b].at).localeCompare(String(store[a].at)));
  const keys = [key, ...others].slice(0, KEEP_MONTHS);
  const kept = Object.fromEntries(keys.map((k) => [k, next[k]]));
  try { localStorage.setItem(MONTH_CACHE, JSON.stringify(kept)); } catch { /* full */ }
  return kept;
}
