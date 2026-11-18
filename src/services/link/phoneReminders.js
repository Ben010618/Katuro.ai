/**
 * phoneReminders.js — the KaTuro App rings the teacher's KaTuroDesk reminders as Android
 * notifications, even when the app is closed (Capacitor LocalNotifications, installed in
 * Katuro_App/, called through the native bridge so src/ needs no Capacitor package).
 *
 * The phone copies the reminders from KaTuroDesk whenever it can reach it (Today tab), and
 * schedules them on the phone; the notifications then ring with no Wi-Fi and no internet.
 * New Messages also show a notification while the app is open in the background.
 *
 * Exact timing: Android 12+ needs the "Alarms & reminders" permission for alarms on the
 * minute. Asking opens a Settings page, so it is NEVER asked by itself (the plugin would
 * open it on every schedule call): reminders ring within a few minutes (inexact) until the
 * teacher taps "Ring exactly on time" on the Today tab (allowExactReminders).
 */
import { clock } from '../../utils/dates.js';

const STORE = 'katuro-phone-reminders-v1';
const REMIND_PREFIX = 'r'; // notification id space for reminders (messages use others)

const bridge = () => {
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  return cap?.isNativePlatform?.() && typeof cap.nativePromise === 'function' && (cap.isPluginAvailable?.('LocalNotifications') ?? true) ? cap : null;
};
const call = (method, options = {}) => bridge().nativePromise('LocalNotifications', method, options);

/** A stable positive 31-bit number for a text (notification ids must be integers). */
export function idFor(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 1) || 1;
}

const before = (min) => (min === 0 ? 'now' : min === 1440 ? 'tomorrow' : min >= 60 && min % 60 === 0 ? `in ${min / 60} hour${min === 60 ? '' : 's'}` : `in ${min} minutes`);

/**
 * KaTuroDesk reminders → the notifications to schedule (future ones only, at most 60).
 *   reminders: [{ id, title, date, time, remindMinutes, note }]
 * → [{ id, title, body, at: Date }]
 */
export function reminderNotifications(reminders = [], now = Date.now()) {
  return reminders
    .map((r) => {
      const eventAt = new Date(`${r.date}T${r.time}:00`).getTime();
      const at = eventAt - Number(r.remindMinutes || 0) * 60000;
      return {
        id: idFor(`${REMIND_PREFIX}|${r.id}|${r.date}|${r.time}|${r.remindMinutes}`),
        title: r.title,
        body: `${r.remindMinutes ? `${before(r.remindMinutes)}, ` : ''}at ${clock(r.time)}${r.note ? ` · ${r.note}` : ''}`,
        at: new Date(at),
      };
    })
    .filter((n) => Number.isFinite(n.at.getTime()) && n.at.getTime() > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, 60);
}

// ── Class alerts: a notification before each class in My classes (KaTuroDesk) ──
const CLASS_PREFIX = 'c';
const CLASS_ALERT_KEY = 'katuro-class-alert-v1';
export const CLASS_ALERT_OPTIONS = [0, 5, 10, 15, 30, 60];
export const DEFAULT_CLASS_ALERT = 15;

/** Minutes before each class the phone rings (0 = off). Chosen on the phone (Today tab). */
export function classAlertMinutes() {
  try {
    const raw = localStorage.getItem(CLASS_ALERT_KEY);
    const v = Number(raw);
    return raw !== null && CLASS_ALERT_OPTIONS.includes(v) ? v : DEFAULT_CLASS_ALERT;
  } catch {
    return DEFAULT_CLASS_ALERT;
  }
}
export function setClassAlertMinutes(min) {
  try { localStorage.setItem(CLASS_ALERT_KEY, JSON.stringify(CLASS_ALERT_OPTIONS.includes(min) ? min : DEFAULT_CLASS_ALERT)); } catch { /* storage blocked */ }
}

/**
 * The classes in KaTuroDesk's schedule (days: [{ date, items: [{ kind: 'class', time, title, detail }] }])
 * → the notifications `minutes` before each one (future only).
 */
export function classNotifications(days = [], minutes = DEFAULT_CLASS_ALERT, now = Date.now()) {
  if (!minutes) return [];
  const out = [];
  for (const d of days || []) {
    for (const it of d.items || []) {
      if (it.kind !== 'class' || !/^\d{2}:\d{2}$/.test(it.time || '')) continue;
      const at = new Date(`${d.date}T${it.time}:00`).getTime() - minutes * 60000;
      if (!Number.isFinite(at) || at <= now) continue;
      out.push({
        id: idFor(`${CLASS_PREFIX}|${d.date}|${it.time}|${it.title}|${minutes}`),
        title: `${it.title} ${before(minutes)}`,
        body: `Class at ${clock(it.time)}${it.detail ? ` · ${it.detail}` : ''}`,
        at: new Date(at),
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

const loadIds = () => { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { return []; } };
const saveIds = (ids) => { try { localStorage.setItem(STORE, JSON.stringify(ids)); } catch { /* full */ } };

export const canNotify = () => Boolean(bridge());

/** True when Android lets KaTuro ring reminders on the minute ("Alarms & reminders"). */
async function exactReminders() {
  if (!bridge()) return false;
  try {
    return (await call('checkExactNotificationSetting'))?.exact_alarm === 'granted';
  } catch {
    return false;
  }
}

/** Opens Android's "Alarms & reminders" page for KaTuro (only when the teacher taps the button). */
export async function allowExactReminders() {
  if (!bridge()) return false;
  try {
    return (await call('changeExactNotificationSetting'))?.exact_alarm === 'granted';
  } catch {
    return false;
  }
}

/** Asks Android once for permission to show notifications. → true when allowed. */
async function allowNotifications() {
  if (!bridge()) return false;
  try {
    const st = await call('checkPermissions');
    if (st?.display === 'granted') return true;
    return (await call('requestPermissions'))?.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Replaces the reminders and class alerts scheduled on the phone with these (from KaTuroDesk).
 *   classes: the schedule's days (classNotifications), alerted classAlertMinutes() before
 * → { scheduled: number, classes: number, exact: boolean } (0 off the phone app, or when notifications are not allowed)
 */
// One change at a time: two overlapping changes could leave alerts no one can cancel.
let syncing = Promise.resolve();
export function syncReminders(reminders, options) {
  const run = () => syncNow(reminders, options);
  syncing = syncing.then(run, run);
  return syncing;
}

async function syncNow(reminders, { days = [], now = Date.now() } = {}) {
  if (!bridge()) return { scheduled: 0, classes: 0, exact: false };
  const classAlerts = classNotifications(days, classAlertMinutes(), now);
  // Android keeps up to 500 alarms per app; the soonest 120 are plenty for two weeks.
  const wanted = [...reminderNotifications(reminders, now), ...classAlerts].sort((a, b) => a.at - b.at).slice(0, 120);
  const old = loadIds();
  try {
    if (old.length) await call('cancel', { notifications: old.map((id) => ({ id })) });
    saveIds([]);
    if (!wanted.length || !(await allowNotifications())) return { scheduled: 0, classes: 0, exact: false };
    const exact = await exactReminders();
    await call('schedule', {
      notifications: wanted.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: n.at.toISOString(), allowWhileIdle: true },
        extra: { kind: classAlerts.includes(n) ? 'class' : 'reminder' },
        // false = no Settings page pops up; Android may ring a few minutes late while asleep.
        isExactNotification: exact,
      })),
    });
    saveIds(wanted.map((n) => n.id));
    return { scheduled: wanted.length, classes: wanted.filter((n) => classAlerts.includes(n)).length, exact };
  } catch {
    return { scheduled: 0, classes: 0, exact: false };
  }
}

/** A notification right now (e.g. a new message while the app is in the background). */
export async function notifyNow(title, body, key = `${Date.now()}`) {
  if (!bridge()) return false;
  try {
    if (!(await allowNotifications())) return false;
    await call('schedule', { notifications: [{ id: idFor(`m|${key}`), title: String(title).slice(0, 80), body: String(body || '').slice(0, 200), extra: { kind: 'message' }, isExactNotification: false }] });
    return true;
  } catch {
    return false;
  }
}
