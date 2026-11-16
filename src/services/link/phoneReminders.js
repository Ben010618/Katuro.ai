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
 * Replaces the reminders scheduled on the phone with these (from KaTuroDesk).
 * → { scheduled: number, exact: boolean } (0 off the phone app, or when notifications are not allowed)
 */
export async function syncReminders(reminders, now = Date.now()) {
  if (!bridge()) return { scheduled: 0, exact: false };
  const wanted = reminderNotifications(reminders, now);
  const old = loadIds();
  try {
    if (old.length) await call('cancel', { notifications: old.map((id) => ({ id })) });
    saveIds([]);
    if (!wanted.length || !(await allowNotifications())) return { scheduled: 0, exact: false };
    const exact = await exactReminders();
    await call('schedule', {
      notifications: wanted.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: n.at.toISOString(), allowWhileIdle: true },
        extra: { kind: 'reminder' },
        // false = no Settings page pops up; Android may ring a few minutes late while asleep.
        isExactNotification: exact,
      })),
    });
    saveIds(wanted.map((n) => n.id));
    return { scheduled: wanted.length, exact };
  } catch {
    return { scheduled: 0, exact: false };
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
