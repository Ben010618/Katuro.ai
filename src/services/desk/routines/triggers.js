/**
 * triggers.js — when a routine's "When" card fires (pure functions; the scheduler asks every
 * half minute while KaTuroDesk is open).
 *
 *   when.manual    never by itself (the Play button)
 *   when.schedule  like a scheduled task (schedule.js): a missed time runs ONCE when KaTuroDesk opens
 *   when.deped     N days before/after a DepEd calendar date (DO 9, s. 2026), once per date
 *   when.newFiles  new files in a folder (photos from the phone, scans), once each, after they
 *                  stop changing (a photo still being copied is not read half-written)
 *
 * meta (kept per routine): { enabledAt, lastFireAt, fired: [keys], seen: [file signatures] }
 * Nothing that happened before the routine was switched on fires it.
 */

import { computeNextRun, toDateInput } from '../schedule/schedule.js';
import { SCHOOL_ACTIVITIES } from '../knowledge/depedActivities.js';
import { cardDef } from './catalog.js';

export const SETTLE_MS = 20_000; // a new file must be unchanged this long before it is used
export const MAX_SEEN = 3000;
export const MAX_FILES_PER_RUN = 40;
const SKIP = /(^|\/)(KaTuro Backups|KaTuro Outputs)(\/|$)/i;

/** The DepEd dates a When card can follow: event key → test on the calendar entry. */
const EVENTS = {
  termExam: (a) => /^Term \d Examination/.test(a.title),
  termEnd: (a) => /^End of Term \d$/.test(a.title),
  termStart: (a) => /^(Opening Block: )?Start of Term \d$/.test(a.title),
  bosyStart: (a) => /^Start of Testing Window for BOSY/.test(a.title),
  mosyStart: (a) => /^Start of Testing Window for MOSY/.test(a.title),
  eosyStart: (a) => /^Start of Testing Window for EOSY/.test(a.title),
};

const parseDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? { y: Number(m[1]), mo: Number(m[2]) - 1, d: Number(m[3]) } : null;
};

/**
 * The dates of one DepEd event kind, one per term/window (the first day when the calendar lists
 * the same event twice, e.g. two Term 1 Examination days). → [{ key, date: 'YYYY-MM-DD', title }]
 */
export function depedDates(event, activities = SCHOOL_ACTIVITIES) {
  const test = EVENTS[event];
  if (!test) return [];
  const byTitle = new Map();
  for (const a of activities) {
    if (!test(a)) continue;
    // "Term 3 Examination (Moving up…)" and "(Other Grade Levels)" are one exam period.
    const group = a.title.replace(/\s*\(.*\)\s*$/, '');
    const prev = byTitle.get(group);
    if (!prev || a.start < prev.start) byTitle.set(group, a);
  }
  return [...byTitle.entries()]
    .map(([group, a]) => ({ key: `${event}:${group}:${a.start}`, date: a.start, title: a.title }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** The moment a DepEd When card fires for one date (its offset and time applied), in ms. */
export function depedFireAt(date, settings) {
  const day = parseDay(date);
  const m = /^(\d{2}):(\d{2})$/.exec(String(settings?.time || ''));
  if (!day || !m) return null;
  return new Date(day.y, day.mo, day.d + (Number(settings.offsetDays) || 0), Number(m[1]), Number(m[2]), 0, 0).getTime();
}

const whenCard = (routine) => (routine?.cards || []).find((c) => cardDef(c.type)?.kind === 'when') || null;

/** The schedule.js form of a schedule When card. */
export function scheduleOf(settings, enabledAt) {
  return {
    repeat: settings?.repeat,
    date: toDateInput(new Date(enabledAt || Date.now())),
    time: settings?.time,
    weekdays: settings?.weekdays,
    dayOfMonth: settings?.dayOfMonth,
  };
}

/** When the routine fires next (ms), or null (manual, new files, or nothing left). For the list. */
export function nextFireAt(routine, meta = {}, now = Date.now()) {
  const card = whenCard(routine);
  if (!card || !routine.enabled) return null;
  if (card.type === 'when.schedule') return computeNextRun(scheduleOf(card.settings, meta.enabledAt), Math.max(now, meta.lastFireAt || 0));
  if (card.type === 'when.deped') {
    const fired = new Set(meta.fired || []);
    const next = depedDates(card.settings.event)
      .map((d) => ({ ...d, at: depedFireAt(d.date, card.settings) }))
      .find((d) => d.at && d.at > now && !fired.has(d.key));
    return next ? next.at : null;
  }
  return null;
}

/** Files of a folder (and its sub-folders) with their signature: [{ path, sig, lastModified }]. */
export function folderEntries(flatFiles, folder, match = /./) {
  const prefix = `${String(folder || '').replace(/\/+$/, '')}/`.toLowerCase();
  return (flatFiles || [])
    .filter((f) => f?.path && f.path.toLowerCase().startsWith(prefix) && !SKIP.test(f.path) && match.test(f.path))
    .map((f) => ({ path: f.path, lastModified: Number(f.lastModified) || 0, sig: `${f.path}|${f.size ?? ''}|${f.lastModified ?? ''}` }));
}

/** What a new-files When card starts from: the folder's files as they are now (none fire). */
export function initialSeen(routine, flatFiles) {
  const card = whenCard(routine);
  if (card?.type !== 'when.newFiles') return [];
  const def = cardDef(card.type);
  return folderEntries(flatFiles, card.settings.folder, def.match[card.settings.what] || /./).map((e) => e.sig).slice(-MAX_SEEN);
}

/**
 * Is the routine due now? → null, or { trigger, meta } where trigger = { kind, at, key?, files? }
 * and meta is the routine's updated meta (store it when the run starts).
 */
export function dueNow(routine, meta = {}, { now = Date.now(), flatFiles = [] } = {}) {
  const card = whenCard(routine);
  if (!card || !routine.enabled || !meta.enabledAt) return null;
  const s = card.settings || {};

  if (card.type === 'when.schedule') {
    const at = computeNextRun(scheduleOf(s, meta.enabledAt), Math.max(meta.lastFireAt || 0, meta.enabledAt));
    if (at === null || at > now) return null;
    return { trigger: { kind: 'schedule', at }, meta: { ...meta, lastFireAt: now } };
  }

  if (card.type === 'when.deped') {
    const fired = new Set(meta.fired || []);
    const due = depedDates(s.event)
      .map((d) => ({ ...d, at: depedFireAt(d.date, s) }))
      .filter((d) => d.at && d.at > meta.enabledAt && d.at <= now && !fired.has(d.key));
    if (!due.length) return null;
    // Several dates passed while KaTuroDesk was closed: run once, for the latest.
    const last = due[due.length - 1];
    return { trigger: { kind: 'deped', at: last.at, key: last.key, title: last.title }, meta: { ...meta, lastFireAt: now, fired: [...fired, ...due.map((d) => d.key)].slice(-200) } };
  }

  if (card.type === 'when.newFiles') {
    const def = cardDef(card.type);
    const seen = new Set(meta.seen || []);
    const entries = folderEntries(flatFiles, s.folder, def.match[s.what] || /./);
    const fresh = entries.filter((e) => !seen.has(e.sig) && now - e.lastModified >= SETTLE_MS);
    if (!fresh.length) return null;
    // At most 40 files per run; the rest stay new and start the next run.
    const batch = fresh.slice(0, MAX_FILES_PER_RUN);
    const nextSeen = [...seen, ...batch.map((e) => e.sig)].slice(-MAX_SEEN);
    return { trigger: { kind: 'newFiles', at: now, files: batch.map((e) => e.path) }, meta: { ...meta, lastFireAt: now, seen: nextSeen } };
  }
  return null;
}
