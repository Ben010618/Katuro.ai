import { useEffect, useMemo, useRef, useState } from 'react';
import { AlarmClock, BellOff } from 'lucide-react';
import { useDeskStore } from '../../../store/deskStore';
import { ringingAlarms, missedAlarms, formatTime } from './reminders';
import { startAlarmSound, stopAlarmSound } from '../messageTone';

const TICK_MS = 10000;
const when = (ev) => `${new Date(`${ev.date}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}${ev.time ? `, ${formatTime(ev.time)}` : ''}`;

/**
 * Rings the teacher's calendar alarms: a repeating tone, a Windows notification that
 * stays on screen and a flashing taskbar button, until Dismiss or Snooze. Works while
 * KaTuroDesk is in the tray (the page keeps running there).
 */
export default function CalendarAlarms() {
  const { calendarEvents, updateCalendarEvent } = useDeskStore();
  const [now, setNow] = useState(() => Date.now());
  const [missedShown, setMissedShown] = useState(false);
  const notified = useRef(new Set());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    const wake = () => setNow(Date.now());
    document.addEventListener('visibilitychange', wake);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', wake); };
  }, []);

  const ringing = useMemo(() => ringingAlarms(calendarEvents, now), [calendarEvents, now]);
  const missed = useMemo(() => missedAlarms(calendarEvents, now), [calendarEvents, now]);
  const active = ringing[0] || null;
  const activeKey = active ? `${active.id}:${active.snoozeUntil || 0}` : '';

  // Sound and notification follow the ringing alarm.
  useEffect(() => {
    if (!active) { stopAlarmSound(); return undefined; }
    startAlarmSound();
    if (!notified.current.has(activeKey)) {
      notified.current.add(activeKey);
      const body = `${when(active)}${active.note ? ` · ${active.note}` : ''}`;
      window.katuroDeskApi?.alarm?.(active.title, body.slice(0, 240), active.id)?.catch?.(() => {});
    }
    return undefined;
  }, [active, activeKey]);

  useEffect(() => () => stopAlarmSound(), []);

  const dismiss = (ev) => updateCalendarEvent(ev.id, { doneAt: Date.now(), snoozeUntil: null });
  const snooze = (ev, minutes) => updateCalendarEvent(ev.id, { snoozeUntil: Date.now() + minutes * 60000 });

  if (active) {
    return (
      <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
        <div role="alertdialog" aria-modal="true" aria-label="Reminder" className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl p-5 text-center">
          <AlarmClock size={30} className="mx-auto text-emerald-700" />
          <p className="mt-2 text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Reminder</p>
          <p className="mt-1 text-base font-bold text-gray-900 break-words">{active.title}</p>
          <p className="mt-0.5 text-xs text-gray-600">{when(active)}</p>
          {active.note && <p className="mt-2 text-xs text-gray-700 whitespace-pre-wrap break-words">{active.note}</p>}
          {ringing.length > 1 && <p className="mt-2 text-[11px] text-gray-500">{ringing.length - 1} more reminder{ringing.length > 2 ? 's' : ''} after this one.</p>}
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" onClick={() => dismiss(active)} className="w-full py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold" autoFocus>Dismiss</button>
            <div className="flex gap-2">
              <button type="button" onClick={() => snooze(active, 5)} className="flex-1 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50">Snooze 5 min</button>
              <button type="button" onClick={() => snooze(active, 10)} className="flex-1 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50">Snooze 10 min</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Reminders that rang out, or were due while the computer was off.
  if (missed.length && !missedShown) {
    return (
      <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
        <div role="alertdialog" aria-modal="true" aria-label="Missed reminders" className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl p-5">
          <p className="text-sm font-bold text-gray-900 flex items-center gap-2"><BellOff size={16} className="text-amber-700" /> Missed reminder{missed.length > 1 ? 's' : ''}</p>
          <ul className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
            {missed.map((ev) => (
              <li key={ev.id} className="text-xs text-gray-800"><strong>{ev.title}</strong><span className="block text-[11px] text-gray-500">{when(ev)}</span></li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setMissedShown(true)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50">Later</button>
            <button type="button" onClick={() => { missed.forEach(dismiss); setMissedShown(true); }} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold">OK, mark as done</button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
