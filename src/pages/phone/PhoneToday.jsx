import { useCallback, useEffect, useState } from 'react';
import { BellRing, BookOpen, CalendarDays, Check, Flag, Loader2, Plus, RefreshCw, Timer, Trash2, X } from 'lucide-react';
import { REMIND_OPTIONS } from '../desk/calendar/reminders';
import { syncReminders, canNotify, allowExactReminders } from '../../services/link/phoneReminders';
import { isoDay, addDays, clock } from '../../utils/dates';

const CACHE = 'katuro-phone-schedule-v1';
const Card = ({ children, className = '' }) => <div className={`rounded-xl bg-white p-4 shadow-sm ${className}`}>{children}</div>;
const ICON = { class: BookOpen, event: CalendarDays, task: Timer, school: Flag };
const loadCache = () => { try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { return null; } };
const saveCache = (v) => { try { localStorage.setItem(CACHE, JSON.stringify(v)); } catch { /* full */ } };

function AddEntry({ client, onClose, onAdded }) {
  const [form, setForm] = useState({ title: '', date: isoDay(), time: '', remindMinutes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await client.request('addEvent', { ...form, remindMinutes: form.remindMinutes === '' ? null : Number(form.remindMinutes) });
      onAdded();
      onClose();
    } catch (err) {
      setError(err.code === 'UNREACHABLE' ? "KaTuroDesk can't be reached. Your calendar lives on KaTuroDesk; add it when the phone is on the same Wi-Fi." : err.message);
    }
    setBusy(false);
  };
  const input = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base';
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl bg-white p-4 space-y-3" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between">
          <p className="text-base font-bold">Add to my calendar</p>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1"><X size={20} /></button>
        </div>
        <input aria-label="What" placeholder="What (e.g. Parent meeting)" value={form.title} onChange={set('title')} className={input} />
        <div className="grid grid-cols-2 gap-2">
          <input aria-label="Date" type="date" value={form.date} onChange={set('date')} className={input} />
          <input aria-label="Time" type="time" value={form.time} onChange={set('time')} className={input} />
        </div>
        <select aria-label="Reminder" value={form.remindMinutes} onChange={set('remindMinutes')} disabled={!form.time} className={`${input} disabled:bg-gray-100`}>
          {REMIND_OPTIONS.map((o) => <option key={String(o.value)} value={o.value === null ? '' : o.value}>{o.label}</option>)}
        </select>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="button" onClick={save} disabled={busy || !form.title.trim()} className="w-full rounded-xl bg-emerald-700 py-3.5 font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save in KaTuroDesk'}</button>
      </div>
    </div>
  );
}

/** Today: the teacher's next 14 days from KaTuroDesk (kept on the phone), reminders ring on the phone. */
export default function PhoneToday({ client, online }) {
  const [data, setData] = useState(() => loadCache());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [rang, setRang] = useState(null); // { scheduled, exact } reminders on the phone
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => { setLoading(true); setTick((t) => t + 1); }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const from = isoDay();
        const r = await client.request('schedule', { from, to: addDays(isoDay(), 13) });
        if (!alive) return;
        const v = { ...r, at: new Date().toISOString() };
        saveCache(v);
        setData(v);
        setError('');
        const { reminders } = await client.request('reminders');
        const res = await syncReminders(reminders);
        if (alive) setRang(res);
      } catch (err) {
        if (alive) setError(err.code === 'UNREACHABLE' ? '' : err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [client, tick, online]);

  const act = async (op, id) => {
    try {
      await client.request(op, { id });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  // Week-long observances are shown on their first day only, not repeated every day.
  const seenSchool = new Set();
  const days = (data?.days || [])
    .map((d) => ({ ...d, items: d.items.filter((it) => it.kind !== 'school' || (!seenSchool.has(it.title) && seenSchool.add(it.title))) }))
    .filter((d) => d.items.length);
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">My schedule · next 2 weeks</p>
        <button type="button" onClick={refresh} aria-label="Refresh" className="p-2 text-gray-500"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {data && online === false && <p className="px-1 text-xs text-amber-800">From the phone&apos;s copy ({new Date(data.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}). Changes need KaTuroDesk.</p>}
      {error && <Card><p className="text-sm text-red-700">{error}</p></Card>}
      {canNotify() && rang?.scheduled > 0 && (
        <div className="px-1 text-xs text-emerald-800">
          <p className="flex items-center gap-1"><BellRing size={13} /> {rang.scheduled} reminder{rang.scheduled > 1 ? 's' : ''} will ring on this phone{rang.exact ? '' : ' (within a few minutes of the time)'}.</p>
          {!rang.exact && <button type="button" onClick={async () => { await allowExactReminders(); refresh(); }} className="mt-1 font-semibold underline">Ring exactly on time</button>}
        </div>
      )}
      {!data && loading && <p className="flex items-center gap-2 px-1 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> Getting your schedule from KaTuroDesk…</p>}
      {data && !days.length && <Card><p className="text-sm text-gray-700">Nothing scheduled in the next two weeks. Add your classes in KaTuroDesk (My classes), or add an entry with +.</p></Card>}
      {days.map((d) => (
        <section key={d.date}>
          <p className={`px-1 pb-1 text-xs font-semibold uppercase tracking-wide ${d.date === data.today ? 'text-emerald-800' : 'text-gray-500'}`}>{d.label}</p>
          <ul className="rounded-xl bg-white shadow-sm divide-y divide-gray-100">
            {d.items.map((it, i) => {
              const Icon = ICON[it.kind] || CalendarDays;
              return (
                <li key={`${it.kind}-${it.id || i}`} className={`flex items-start gap-3 px-3 py-2.5 ${it.done ? 'opacity-50' : ''}`}>
                  <Icon size={18} className={`mt-0.5 flex-shrink-0 ${it.kind === 'class' ? 'text-emerald-700' : it.kind === 'school' ? 'text-amber-600' : 'text-sky-700'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold text-gray-900 ${it.done ? 'line-through' : ''}`}>{it.time ? `${clock(it.time)} · ` : ''}{it.title}</span>
                    {it.detail && <span className="block text-xs text-gray-500">{it.detail}</span>}
                    {it.kind === 'event' && it.remindMinutes !== null && !it.done && <span className="block text-[11px] text-gray-400">{REMIND_OPTIONS.find((o) => o.value === it.remindMinutes)?.label}</span>}
                  </span>
                  {it.kind === 'event' && online !== false && (
                    <span className="flex gap-1">
                      {!it.done && <button type="button" onClick={() => act('doneEvent', it.id)} aria-label={`Mark ${it.title} done`} className="p-1.5 text-emerald-700"><Check size={16} /></button>}
                      <button type="button" onClick={() => { if (window.confirm(`Remove "${it.title}"?`)) act('removeEvent', it.id); }} aria-label={`Remove ${it.title}`} className="p-1.5 text-gray-400"><Trash2 size={16} /></button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <button type="button" onClick={() => setAdding(true)} aria-label="Add to my calendar" className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <Plus size={28} />
      </button>
      {adding && <AddEntry client={client} onClose={() => setAdding(false)} onAdded={refresh} />}
    </div>
  );
}
