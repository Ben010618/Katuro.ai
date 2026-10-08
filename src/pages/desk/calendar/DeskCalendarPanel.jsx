import { useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Plus, Bell, BellOff, Trash2, Pencil, CalendarDays } from 'lucide-react';
import { useDeskStore } from '../../../store/deskStore';
import { CALENDARS, calendarPosition, manilaDate } from '../../../services/desk/knowledge/schoolCalendar';
import { activitiesOn, monthObservances, holidayOn, upcomingActivities, isoOf, DO9_SOURCE } from '../../../services/desk/knowledge/depedActivities';
import { REMIND_OPTIONS, remindLabel, eventProblem, eventsOn, formatTime, alarmAtMs } from './reminders';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BLOCK_LABEL = { opening: 'Opening Block', instructional: 'Instructional Block', endOfTerm: 'End-of-Term Block', betweenTerms: 'Between terms', eosyBreak: 'End-of-school-year break' };
// Soft tints that read on both the light and the dark theme.
const BLOCK_TINT = { opening: 'rgba(234, 179, 8, 0.24)', instructional: 'rgba(34, 197, 94, 0.17)', endOfTerm: 'rgba(249, 115, 22, 0.24)' };
const KIND_LABEL = { term: 'Term', block: 'Block', assessment: 'Assessment', pta: 'PTA', inset: 'INSET / Training', break: 'Break', holiday: 'Holiday', activity: 'Activity' };
const KIND_COLOR = { term: '#2d6a4f', block: '#b45309', assessment: '#7c3aed', pta: '#0f766e', inset: '#1d4ed8', break: '#64748b', holiday: '#b91c1c', activity: '#475569' };

const pretty = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const short = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

/** Where a day falls: the block of its term (for the tint), or null. */
function blockOf(iso) {
  const pos = calendarPosition(iso);
  return pos && BLOCK_TINT[pos.block] ? pos.block : null;
}

function KindBadge({ kind }) {
  return (
    <span className="text-[9.5px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 flex-shrink-0" style={{ color: KIND_COLOR[kind] || '#475569', background: 'rgba(100, 116, 139, 0.12)' }}>
      {KIND_LABEL[kind] || kind}
    </span>
  );
}

function EventForm({ initial, onSave, onCancel }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setError(''); };
  const save = (e) => {
    e.preventDefault();
    const clean = { ...draft, title: String(draft.title || '').trim(), note: String(draft.note || '').trim() };
    const problem = eventProblem(clean);
    if (problem) { setError(problem); return; }
    onSave(clean);
  };
  return (
    <form onSubmit={save} className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
      <input value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} placeholder="What is it? e.g. Submit SF2 to the principal" aria-label="Title"
        className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-emerald-600" autoFocus />
      <div className="flex gap-2">
        <label className="flex-1 text-[10.5px] font-semibold text-gray-600">Date
          <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800" />
        </label>
        <label className="flex-1 text-[10.5px] font-semibold text-gray-600">Time (optional)
          <input type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800" />
        </label>
      </div>
      <label className="block text-[10.5px] font-semibold text-gray-600">Reminder
        <select value={draft.remindMinutes === null ? '' : String(draft.remindMinutes)} onChange={(e) => set({ remindMinutes: e.target.value === '' ? null : Number(e.target.value) })}
          className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800">
          {REMIND_OPTIONS.map((o) => <option key={String(o.value)} value={o.value === null ? '' : String(o.value)}>{o.label}</option>)}
        </select>
      </label>
      {draft.remindMinutes !== null && (
        <p className="text-[10.5px] text-gray-500">The alarm keeps ringing until you tap Dismiss or Snooze, even when KaTuroDesk is in the tray (up to 30 minutes).</p>
      )}
      <textarea value={draft.note} onChange={(e) => set({ note: e.target.value })} maxLength={1000} rows={2} placeholder="Notes (optional)" aria-label="Notes"
        className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-emerald-600" />
      {error && <p className="text-[11px] text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
        <button type="submit" className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold">Save</button>
      </div>
    </form>
  );
}

/**
 * The KaTuroDesk calendar (top bar → Calendar): the official SY 2026–2027 calendar
 * with every DepEd activity, where today falls, and the teacher's own schedules,
 * notes and alarms.
 */
export default function DeskCalendarPanel({ onClose }) {
  const { calendarEvents, addCalendarEvent, updateCalendarEvent, removeCalendarEvent } = useDeskStore();
  const today = manilaDate();
  const [view, setView] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState(null); // null | 'new' | event id
  const [showMonthLong, setShowMonthLong] = useState(false);

  const pos = calendarPosition(today);
  const cal = pos ? CALENDARS[pos.schoolYear] : null;
  const term = cal && pos.term ? cal.terms.find((t) => t.term === pos.term) : null;

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m - 1, 1).getDay();
    const count = new Date(view.y, view.m, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => isoOf(view.y, view.m, i + 1))];
  }, [view]);

  const day = activitiesOn(selected, { includeMonthLong: showMonthLong });
  const mine = eventsOn(calendarEvents, selected);
  const monthWide = monthObservances(view.y, view.m);
  const upcoming = upcomingActivities(today, 14).filter((u) => u.activity.kind !== 'block').slice(0, 8);

  const shiftMonth = (delta) => setView(({ y, m }) => {
    const d = new Date(y, m - 1 + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });
  const goToday = () => { setView({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }); setSelected(today); };

  const saveEvent = (ev) => {
    if (editing === 'new') addCalendarEvent(ev);
    else updateCalendarEvent(editing, { ...ev, doneAt: null, snoozeUntil: null });
    setSelected(ev.date);
    setEditing(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-label="School calendar" className="fixed z-50 top-12 right-3 w-[min(780px,calc(100vw-24px))] max-h-[calc(100vh-64px)] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* Where we are */}
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-200">
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><CalendarDays size={15} className="text-emerald-700" /> School Calendar {pos ? `SY ${pos.schoolYear}` : ''}</p>
            <p className="text-[11.5px] text-gray-600 mt-0.5">
              {pos
                ? <>Today, {pretty(today)}: <strong className="text-emerald-800">{pos.term ? `Term ${pos.term} · ` : ''}{BLOCK_LABEL[pos.block]}</strong>{term ? ` · Term ${term.term} ends ${short(term.end)} (${pos.daysToTermEnd} day${pos.daysToTermEnd === 1 ? '' : 's'})` : ''}</>
                : <>Today, {pretty(today)}, is outside the school years KaTuroDesk has the official calendar for.</>}
            </p>
          </div>
          <button type="button" onClick={onClose} title="Close calendar" aria-label="Close calendar" className="p-1 rounded hover:bg-gray-100 text-gray-500"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px]">
          {/* Month */}
          <div className="p-4 md:border-r border-gray-200 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="p-1 rounded hover:bg-gray-100 text-gray-600"><ChevronLeft size={16} /></button>
              <span className="text-sm font-bold text-gray-800">{MONTHS[view.m - 1]} {view.y}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={goToday} className="px-2 py-0.5 rounded-md border border-gray-300 text-[11px] font-semibold text-gray-700 hover:bg-gray-50">Today</button>
                <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="p-1 rounded hover:bg-gray-100 text-gray-600"><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((w) => <span key={w} className="text-[10px] font-bold uppercase text-gray-500 py-1">{w}</span>)}
              {cells.map((iso, i) => {
                if (!iso) return <span key={`e${i}`} />;
                const block = blockOf(iso);
                const holiday = holidayOn(iso);
                const has = activitiesOn(iso).school.some((a) => a.kind !== 'block' && a.kind !== 'holiday');
                const myCount = eventsOn(calendarEvents, iso).length;
                const isToday = iso === today;
                const isSel = iso === selected;
                return (
                  <button key={iso} type="button" onClick={() => { setSelected(iso); setEditing(null); }}
                    title={holiday ? `${holiday.title} (${holiday.holiday})` : undefined}
                    aria-label={`${pretty(iso)}${holiday ? `, ${holiday.title}` : ''}${myCount ? `, ${myCount} of your schedules` : ''}`}
                    aria-pressed={isSel}
                    className={`relative h-11 rounded-lg text-xs font-semibold transition ${isSel ? 'border-emerald-600 border-2' : 'border border-transparent'} ${holiday ? 'text-red-700' : 'text-gray-800'} hover:bg-gray-100`}
                    style={{ background: block ? BLOCK_TINT[block] : undefined, boxShadow: isToday ? 'inset 0 0 0 2px #2d6a4f' : undefined }}>
                    {Number(iso.slice(8))}
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {holiday && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#dc2626' }} />}
                      {has && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#7c3aed' }} />}
                      {myCount > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#0284c7' }} />}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Legend */}
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-gray-600">
              {['opening', 'instructional', 'endOfTerm'].map((b) => (
                <span key={b} className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: BLOCK_TINT[b] }} />{BLOCK_LABEL[b]}</span>
              ))}
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#dc2626' }} />Holiday</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#7c3aed' }} />DepEd activity</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#0284c7' }} />My schedule</span>
            </div>

            {/* This month's observances (month-long, or dated only by week) */}
            {monthWide.length > 0 && (
              <div className="mt-4">
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500 mb-1">Observed this month</p>
                <ul className="space-y-0.5">
                  {monthWide.map((o) => (
                    <li key={o.title} className="text-[11px] text-gray-700">
                      <span className="font-semibold">{o.title}</span>
                      <span className="text-gray-500"> · {o.when.label || 'Whole month'} · {o.basis}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Coming up */}
            {upcoming.length > 0 && (
              <div className="mt-4">
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500 mb-1">Coming up (next 14 days)</p>
                <ul className="space-y-1">
                  {upcoming.map(({ iso, activity }) => (
                    <li key={`${iso}-${activity.title}`}>
                      <button type="button" onClick={() => { setSelected(iso); setView({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) }); }} className="w-full flex items-center gap-2 text-left rounded px-1 py-0.5 hover:bg-gray-50">
                        <span className="text-[11px] font-semibold text-gray-600 w-14 flex-shrink-0">{activity.start && activity.start < iso ? 'Ongoing' : short(iso)}</span>
                        <span className="text-[11px] text-gray-800 flex-1 min-w-0 truncate">{activity.title}</span>
                        <KindBadge kind={activity.kind} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Selected day */}
          <div className="p-4 min-w-0 space-y-3">
            <p className="text-xs font-bold text-gray-900">{pretty(selected)}</p>

            <section>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500 mb-1">DepEd school calendar</p>
              {day.school.length ? (
                <ul className="space-y-1.5">
                  {day.school.map((a) => (
                    <li key={a.title} className="flex items-start gap-2">
                      <KindBadge kind={a.kind} />
                      <span className="text-[11.5px] text-gray-800 leading-snug">{a.title}{a.holiday ? <span className="text-red-700"> ({a.holiday})</span> : null}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[11px] text-gray-500">No school calendar activity on this day.</p>}
            </section>

            <section>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">Observances</p>
                <label className="flex items-center gap-1 text-[10.5px] text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={showMonthLong} onChange={(e) => setShowMonthLong(e.target.checked)} className="w-3 h-3 accent-emerald-600" /> month-long too
                </label>
              </div>
              {day.observances.length ? (
                <ul className="space-y-1">
                  {day.observances.map((o) => (
                    <li key={o.title} className="text-[11.5px] text-gray-800 leading-snug">{o.title}<span className="block text-[10px] text-gray-500">{o.basis}</span></li>
                  ))}
                </ul>
              ) : <p className="text-[11px] text-gray-500">None dated on this day.</p>}
            </section>

            <section>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">My schedule and notes</p>
                {editing === null && (
                  <button type="button" onClick={() => setEditing('new')} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold"><Plus size={12} /> Add</button>
                )}
              </div>
              {editing === 'new' && (
                <EventForm initial={{ title: '', date: selected, time: '', note: '', remindMinutes: null }} onSave={saveEvent} onCancel={() => setEditing(null)} />
              )}
              {mine.length === 0 && editing === null && <p className="text-[11px] text-gray-500">Nothing yet. Add a schedule, a note or an alarm.</p>}
              <ul className="space-y-1.5">
                {mine.map((ev) => (editing === ev.id ? (
                  <li key={ev.id}><EventForm initial={ev} onSave={saveEvent} onCancel={() => setEditing(null)} /></li>
                ) : (
                  <li key={ev.id} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11.5px] font-semibold text-gray-900 leading-snug">{ev.time ? <span className="text-emerald-800">{formatTime(ev.time)} · </span> : null}{ev.title}</p>
                        {ev.note && <p className="text-[11px] text-gray-600 whitespace-pre-wrap">{ev.note}</p>}
                        {ev.remindMinutes !== null && (
                          <p className="text-[10.5px] text-gray-500 flex items-center gap-1 mt-0.5">
                            {ev.doneAt ? <BellOff size={11} /> : <Bell size={11} />}
                            {ev.doneAt ? 'Alarm done' : `${remindLabel(ev.remindMinutes)}${ev.snoozeUntil ? ` · snoozed until ${new Date(alarmAtMs(ev)).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` : ''}`}
                          </p>
                        )}
                      </div>
                      <button type="button" onClick={() => setEditing(ev.id)} title="Edit" aria-label={`Edit ${ev.title}`} className="p-1 rounded hover:bg-gray-100 text-gray-500"><Pencil size={12} /></button>
                      <button type="button" onClick={() => removeCalendarEvent(ev.id)} title="Delete" aria-label={`Delete ${ev.title}`} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-red-600"><Trash2 size={12} /></button>
                    </div>
                  </li>
                )))}
              </ul>
            </section>

            <p className="text-[10px] text-gray-500 pt-1 border-t border-gray-200">Official dates: {DO9_SOURCE}, Annex B (school calendar) and Annex D (legislated activities and celebrations).</p>
          </div>
        </div>
      </div>
    </>
  );
}
