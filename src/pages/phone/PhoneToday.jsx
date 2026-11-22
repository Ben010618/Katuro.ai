import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Flag, Loader2, Plus, RefreshCw, Timer, Trash2, X } from 'lucide-react';
import { REMIND_OPTIONS, remindLabel } from '../desk/calendar/reminders';
import { syncReminders, canNotify, allowExactReminders, classAlertMinutes, setClassAlertMinutes, CLASS_ALERT_OPTIONS } from '../../services/link/phoneReminders';
import { monthGrid, monthRange, monthKey, monthOf, shiftMonth, dayKinds, mergeDays, loadMonths, saveMonth } from '../../services/link/phoneCalendar';
import { isoDay, addDays, clock } from '../../utils/dates';

const CACHE = 'katuro-phone-schedule-v1';
const ICON = { class: BookOpen, event: CalendarDays, task: Timer, school: Flag };
const DOT = { event: '#0284c7', class: '#187349', school: '#d97706' };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// The reminder choices as quick chips (KaTuroDesk's own list, "No reminder" last).
const REMIND_CHIPS = [...REMIND_OPTIONS.filter((o) => o.value !== null), REMIND_OPTIONS.find((o) => o.value === null)];
const loadCache = () => { try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { return null; } };
const saveCache = (v) => { try { localStorage.setItem(CACHE, JSON.stringify(v)); } catch { /* full */ } };
const dateLabel = (iso, opts) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, opts);
const shortRemind = (label) => label.replace(' before', '').replace('No reminder (note only)', 'No reminder');
// KaTuroDesk accepts any reminder up to a week; one not in the list still gets words.
const reminderText = (min) => remindLabel(min) || (min >= 60 && min % 60 === 0 ? `${min / 60} hours before` : `${min} minutes before`);

/** A new entry in the teacher's KaTuroDesk calendar, on the day chosen in the calendar. */
function AddEntry({ client, date, onClose, onAdded }) {
  const [form, setForm] = useState({ title: '', date, time: '', remindMinutes: 15, note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef(null);
  useEffect(() => { titleRef.current?.focus(); }, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      // A reminder needs a time; an entry with no time is a note for the day.
      await client.request('addEvent', { ...form, title: form.title.trim(), remindMinutes: form.time ? form.remindMinutes : null });
      onAdded();
      onClose();
    } catch (err) {
      setError(err.code === 'UNREACHABLE' ? "KaTuroDesk can't be reached. Your calendar lives on KaTuroDesk; add it when the phone is on the same Wi-Fi." : err.message);
    }
    setBusy(false);
  };
  const input = 'w-full min-w-0 rounded-2xl border border-gray-300 px-4 py-3 text-base';
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={busy ? undefined : onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Add to my calendar" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onClose(); }} className="nm w-full space-y-4 rounded-t-3xl p-5" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold">{dateLabel(form.date, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1"><X size={22} /></button>
        </div>
        <input ref={titleRef} aria-label="What" placeholder="What? (e.g. Parent meeting)" value={form.title} onChange={set('title')} className={input} />
        <div className="flex flex-wrap gap-3">
          <label className="block min-w-[9.5rem] flex-1 space-y-1"><span className="nm-muted px-1 text-xs">Date</span><input type="date" value={form.date} onChange={set('date')} className={input} /></label>
          <label className="block min-w-[8rem] flex-1 space-y-1"><span className="nm-muted px-1 text-xs">Time</span><input type="time" value={form.time} onChange={set('time')} className={input} /></label>
        </div>
        <div className="space-y-2">
          <p className="nm-muted flex items-center gap-1.5 px-1 text-xs"><BellRing size={13} /> {form.time ? 'Remind me' : 'Choose a time to be reminded'}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Remind me">
            {REMIND_CHIPS.map((o) => {
              const on = form.time ? form.remindMinutes === o.value : o.value === null;
              return (
                <button key={String(o.value)} type="button" role="radio" aria-checked={on} disabled={!form.time} onClick={() => setForm((f) => ({ ...f, remindMinutes: o.value }))} className={`rounded-full px-3.5 py-2 text-xs font-medium disabled:opacity-40 ${on ? 'nm-accent' : 'nm-sm nm-press'}`}>
                  {shortRemind(o.label)}
                </button>
              );
            })}
          </div>
        </div>
        <input aria-label="Note" placeholder="Note (optional): room, what to bring…" value={form.note} onChange={set('note')} className={input} />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="button" onClick={save} disabled={busy || !form.title.trim() || !form.date} className="nm-accent nm-press w-full rounded-2xl py-4 text-base font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

/** Today: a month calendar of the teacher's KaTuroDesk schedule; reminders and class alerts ring on the phone. */
export default function PhoneToday({ client, online }) {
  const today = isoDay();
  const [data, setData] = useState(() => loadCache()); // the next 14 days: what the alerts are made from
  const [months, setMonths] = useState(() => loadMonths()); // months seen, kept for no Wi-Fi
  const [view, setView] = useState(() => monthOf(today));
  const [selected, setSelected] = useState(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [rang, setRang] = useState(null); // { scheduled, exact } reminders on the phone
  const [tick, setTick] = useState(0);
  const [alertMin, setAlertMin] = useState(() => classAlertMinutes());
  const touch = useRef(null);
  const fabRef = useRef(null);
  const [monthState, setMonthState] = useState({}); // { [month key]: 'loading' | 'failed' }
  const key = monthKey(view.year, view.month);

  // Refresh tries failed months again (they show Loading, not "not saved", while asked again).
  const refresh = useCallback(() => { setLoading(true); setMonthState({}); setTick((t) => t + 1); }, []);

  // Reminders and class alerts: the next 14 days from KaTuroDesk, scheduled on the phone.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await client.request('schedule', { from: isoDay(), to: addDays(isoDay(), 13) });
        if (!alive || client.closed) return;
        const { reminders } = await client.request('reminders');
        if (!alive || client.closed) return;
        // Kept with the reminders, so class alerts can be set again with no Wi-Fi.
        const v = { ...r, reminders, at: new Date().toISOString() };
        saveCache(v);
        setData(v);
        setError('');
        const res = await syncReminders(reminders, { days: r.days });
        if (alive) setRang(res);
      } catch (err) {
        if (alive) setError(err.code === 'UNREACHABLE' ? '' : err.message);
        // KaTuroDesk out of reach: the alerts come from the saved copy of the schedule.
        // A copy saved by an older KaTuro App has no reminders: then nothing is changed.
        const saved = loadCache();
        if (alive && saved?.days && Array.isArray(saved.reminders)) {
          const res = await syncReminders(saved.reminders, { days: saved.days });
          if (alive) setRang(res);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [client, tick, online]);

  // The month on screen (one request: at most 31 days).
  useEffect(() => {
    let alive = true;
    const { from, to } = monthRange(monthOf(`${key}-01`));
    // A month not saved yet and not failed is loading (no state to set here).
    client.request('schedule', { from, to })
      .then((r) => {
        if (!alive || client.closed) return;
        setMonths((m) => saveMonth(key, { from: r.from, to: r.to, days: r.days }, m));
        setMonthState((s) => ({ ...s, [key]: null }));
      })
      .catch((err) => {
        if (!alive) return;
        setMonthState((s) => ({ ...s, [key]: 'failed' }));
        if (!['UNREACHABLE', 'DESK_STARTING', 'CLOSED'].includes(err.code)) setError(err.message);
      });
    return () => { alive = false; };
  }, [client, key, tick, online]);

  // The newer copy wins for the days both the month and the 14-day schedule cover.
  const byDay = useMemo(() => mergeDays(months[key], data), [data, months, key]);
  const monthMissing = !months[key];
  const grid = useMemo(() => monthGrid(view), [view]);
  const dayItems = byDay[selected] || [];

  const go = (by) => {
    const next = shiftMonth(view, by);
    setView(next);
    setSelected(next.year === monthOf(today).year && next.month === monthOf(today).month ? today : monthRange(next).from);
  };
  const goToday = () => { setView(monthOf(today)); setSelected(today); };
  const pick = (iso) => {
    setSelected(iso);
    const m = monthOf(iso);
    if (m.month !== view.month || m.year !== view.year) setView(m);
  };

  const changeAlert = async (min) => {
    setClassAlertMinutes(min);
    setAlertMin(min);
    const saved = data || loadCache();
    if (saved?.days && Array.isArray(saved.reminders)) setRang(await syncReminders(saved.reminders, { days: saved.days }));
  };

  const act = async (op, id) => {
    try {
      await client.request(op, { id });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const monthTitle = new Date(view.year, view.month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return (
    <div className="space-y-5 px-4 py-3 min-[400px]:px-5">
      {/* The month */}
      <section className="nm rounded-3xl p-4" aria-label={`Calendar, ${monthTitle}`}>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => go(-1)} aria-label="Previous month" className="nm-sm nm-press grid h-10 w-10 place-items-center rounded-full"><ChevronLeft size={20} /></button>
          <div className="min-w-0 flex-1 px-2 text-center">
            <p className="text-base font-semibold leading-snug min-[400px]:text-lg" aria-live="polite">{monthTitle}</p>
            {selected !== today && <button type="button" onClick={goToday} className="nm-green text-xs font-semibold">Today</button>}
          </div>
          <button type="button" onClick={() => go(1)} aria-label="Next month" className="nm-sm nm-press grid h-10 w-10 place-items-center rounded-full"><ChevronRight size={20} /></button>
        </div>
        <div className="nm-muted mb-1 grid grid-cols-7 text-center text-[11px] font-medium" aria-hidden="true">
          {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
        </div>
        <div
          className="grid grid-cols-7 gap-1"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
          onTouchEnd={(e) => {
            const start = touch.current;
            touch.current = null;
            if (!start) return;
            const dx = e.changedTouches[0].clientX - start.x;
            const dy = e.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
          }}
        >
          {grid.map((c) => {
            const kinds = dayKinds(byDay[c.iso]);
            const isSel = c.iso === selected;
            const isToday = c.iso === today;
            const count = (byDay[c.iso] || []).length;
            return (
              <button
                key={c.iso}
                type="button"
                onClick={() => pick(c.iso)}
                aria-pressed={isSel}
                aria-label={`${dateLabel(c.iso, { weekday: 'long', month: 'long', day: 'numeric' })}${isToday ? ', today' : ''}${count ? `, ${count} item${count > 1 ? 's' : ''}` : ''}`}
                className={`flex h-12 flex-col items-center justify-center rounded-2xl text-sm transition ${isSel ? 'nm-accent font-semibold' : isToday ? 'nm-in nm-green font-bold' : 'nm-press'} ${c.inMonth ? '' : 'opacity-35'}`}
              >
                <span>{c.day}</span>
                <span className="mt-0.5 flex h-1.5 gap-0.5" aria-hidden="true">
                  {kinds.map((k) => <span key={k} className="h-1.5 w-1.5 rounded-full" style={{ background: isSel ? '#fff' : DOT[k] }} />)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="nm-muted mt-3 flex justify-center gap-4 text-[11px]" aria-hidden="true">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT.event }} /> My events</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT.class }} /> Classes</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT.school }} /> School</span>
        </div>
      </section>

      {/* The chosen day */}
      <section aria-label="The chosen day">
        <div className="mb-3 flex items-center gap-2 px-1">
          <p className={`min-w-0 flex-1 text-sm font-semibold ${selected === today ? 'nm-green' : ''}`}>{selected === today ? 'Today · ' : ''}{dateLabel(selected, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <button ref={fabRef} type="button" onClick={() => setAdding(true)} aria-label={`Add an event on ${dateLabel(selected, { month: 'long', day: 'numeric' })}`} className="nm-accent nm-press flex h-9 flex-shrink-0 items-center gap-1 rounded-full pl-2.5 pr-3.5 text-sm font-semibold"><Plus size={17} /> Add</button>
          <button type="button" onClick={refresh} aria-label="Refresh" className="nm-sm nm-press nm-muted grid h-9 w-9 flex-shrink-0 place-items-center rounded-full"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        {online === false && !monthMissing && <p className="px-1 pb-2 text-xs text-amber-800">Saved copy: changes need KaTuroDesk on the same Wi-Fi.</p>}
        {error && <p role="alert" className="px-1 pb-2 text-sm text-red-700">{error}</p>}
        {!dayItems.length && monthMissing && monthState[key] !== 'failed' && online !== false ? (
          <p className="nm-in nm-muted flex w-full items-center justify-center gap-2 rounded-3xl py-6 text-sm"><Loader2 size={16} className="animate-spin" /> Loading…</p>
        ) : !dayItems.length && monthMissing ? (
          <p className="nm-in rounded-3xl px-5 py-6 text-center text-sm text-amber-800">This month is not saved on the phone yet. Open it once on the same Wi-Fi as KaTuroDesk to see it here.</p>
        ) : !dayItems.length ? (
          <button type="button" onClick={() => setAdding(true)} className="nm-in nm-muted flex w-full items-center justify-center gap-2 rounded-3xl py-6 text-sm"><Plus size={16} /> Nothing yet. Add an event</button>
        ) : (
          <ul className="nm divide-y divide-gray-100 rounded-3xl px-1">
            {dayItems.map((it, i) => {
              const Icon = ICON[it.kind] || CalendarDays;
              return (
                <li key={`${it.kind}-${it.id || i}`} className={`flex items-start gap-3 px-4 py-3.5 ${it.done ? 'opacity-50' : ''}`}>
                  <span className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl" style={{ background: `${DOT[it.kind] || DOT.event}1a`, color: DOT[it.kind] || DOT.event }}><Icon size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${it.done ? 'line-through' : ''}`}>{it.title}</span>
                    <span className="nm-muted block text-xs">{it.time ? clock(it.time) : 'All day'}{it.detail ? ` · ${it.detail}` : ''}</span>
                    {it.kind === 'event' && it.remindMinutes !== null && it.remindMinutes !== undefined && !it.done && <span className="nm-green mt-0.5 flex items-center gap-1 text-[11px]"><BellRing size={11} /> {reminderText(it.remindMinutes)}</span>}
                  </span>
                  {it.kind === 'event' && online !== false && (
                    <span className="flex gap-1">
                      {!it.done && <button type="button" onClick={() => act('doneEvent', it.id)} aria-label={`Mark ${it.title} done`} className="p-1.5 text-emerald-700"><Check size={18} /></button>}
                      <button type="button" onClick={() => { if (window.confirm(`Remove "${it.title}"?`)) act('removeEvent', it.id); }} aria-label={`Remove ${it.title}`} className="p-1.5 text-gray-400"><Trash2 size={17} /></button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Alerts on this phone */}
      {canNotify() && (
        <section className="nm space-y-2 rounded-3xl px-4 py-3" aria-label="Alerts on this phone">
          <label className="flex items-center gap-3">
            <BellRing size={18} className="flex-shrink-0 text-emerald-700" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Class alerts</span>
              <span className="nm-muted block text-xs">{alertMin ? `Rings ${alertMin} minutes before each class` : 'Off'}{rang?.classes ? ` · ${rang.classes} set` : ''}</span>
            </span>
            <select aria-label="Class alerts" value={alertMin} onChange={(e) => changeAlert(Number(e.target.value))} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm">
              {CLASS_ALERT_OPTIONS.map((m) => <option key={m} value={m}>{m ? `${m} min before` : 'Off'}</option>)}
            </select>
          </label>
          {rang?.scheduled > 0 && (
            <p className="nm-muted text-xs">
              {rang.scheduled} reminder{rang.scheduled > 1 ? 's' : ''} and alert{rang.scheduled > 1 ? 's' : ''} set on this phone.
              {!rang.exact && <> <button type="button" onClick={async () => { await allowExactReminders(); refresh(); }} className="nm-green font-semibold underline">Ring exactly on time</button></>}
            </p>
          )}
        </section>
      )}

      {adding && <AddEntry client={client} date={selected} onClose={() => { setAdding(false); requestAnimationFrame(() => fabRef.current?.focus()); }} onAdded={refresh} />}
    </div>
  );
}
