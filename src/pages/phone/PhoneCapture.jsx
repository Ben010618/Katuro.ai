import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, CheckCircle2, CloudOff, History, Loader2, RotateCcw, SkipForward } from 'lucide-react';
import { cropAround, readHandwrittenScore } from '../../services/link/scoreReading';
import { newId, queueRecording, classOrder } from '../../services/link/scoreEntry';
import { isoDay } from '../../utils/dates';

const Card = ({ children, className = '' }) => <div className={`rounded-xl bg-white p-4 shadow-sm ${className}`}>{children}</div>;
const when = (ms) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });


/**
 * Snap the checked papers: one photo per paper, in class-record order. The teacher taps the
 * score on the photo, sees the small square that would be read, and only then sends it
 * (scoreReading.js; the square must hold the number only, never the name). The teacher
 * confirms or corrects each reading. → onDone({ [lrn]: '18' })
 */
export function SnapScores({ cls, hps, existing = {}, onDone }) {
  const order = useMemo(() => classOrder(cls.learners), [cls]);
  const [i, setI] = useState(() => Math.max(0, order.findIndex((l) => existing[l.lrn] === undefined)));
  const [photo, setPhoto] = useState(null); // { file, url }
  const [crop, setCrop] = useState(null); // { url, bytes, reading?, error? }
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState({}); // lrn → text
  const urls = useRef([]);
  const token = useRef(0); // changes with every learner / photo: a late reading for an older one is ignored
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const learner = order[i];
  const done = i >= order.length;

  const keep = (blobPart) => {
    const url = URL.createObjectURL(new Blob([blobPart], { type: 'image/jpeg' }));
    urls.current.push(url);
    return url;
  };
  const reset = () => {
    token.current += 1;
    setPhoto(null);
    setCrop(null);
    setValue('');
    setBusy(false);
  };
  const take = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    reset();
    setPhoto({ file, url: keep(file) });
  };
  const tap = async (e) => {
    if (!photo || busy) return;
    const box = e.currentTarget.getBoundingClientRect();
    try {
      const mine = token.current;
      const bytes = await cropAround(photo.file, (e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
      if (mine !== token.current) return;
      setCrop({ url: keep(bytes), bytes });
    } catch (err) {
      setCrop({ error: err.message });
    }
  };
  const read = async () => {
    if (!crop?.bytes || busy) return;
    const mine = token.current;
    setBusy(true);
    try {
      const reading = await readHandwrittenScore(crop.bytes, hps);
      if (mine !== token.current) return;
      setCrop((c) => ({ ...c, reading }));
      setValue(reading.sure ? String(reading.score) : '');
    } catch (err) {
      if (mine === token.current) setCrop((c) => ({ ...c, error: err.message }));
    } finally {
      if (mine === token.current) setBusy(false);
    }
  };
  const goTo = (index, text) => {
    if (learner && text !== undefined) setGot((g) => ({ ...g, [learner.lrn]: text }));
    reset();
    setI(index);
  };

  if (done) {
    return (
      <div className="p-3 space-y-3">
        <Card className="text-center space-y-2">
          <CheckCircle2 size={36} className="mx-auto text-emerald-600" />
          <p className="font-bold">{Object.keys(got).length} score{Object.keys(got).length === 1 ? '' : 's'} read</p>
          <p className="text-sm text-gray-600">They go into the score list for the usual check before recording.</p>
        </Card>
        <button type="button" onClick={() => onDone(got)} className="w-full rounded-xl bg-emerald-700 py-3.5 font-bold text-white">Use these scores</button>
      </div>
    );
  }
  return (
    <div className="p-3 space-y-3 pb-24">
      <Card className="space-y-1">
        <p className="text-xs text-gray-500">Paper {i + 1} of {order.length} · out of {hps}</p>
        <p className="text-lg font-bold text-gray-900">{learner.name}</p>
        <select aria-label="A different learner" value={learner.lrn} disabled={busy} onChange={(e) => goTo(order.findIndex((l) => l.lrn === e.target.value))} className="w-full rounded-lg border border-gray-200 p-2 text-sm text-gray-700">
          {order.map((l) => <option key={l.lrn} value={l.lrn}>{got[l.lrn] !== undefined ? '✓ ' : ''}{l.name}</option>)}
        </select>
      </Card>
      {!photo ? (
        <label className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 py-4 font-bold text-white">
          <Camera size={20} /> Take a photo of the paper
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={take} />
        </label>
      ) : (
        <Card className="space-y-2">
          <p className="text-sm font-semibold text-gray-800">{crop ? 'Only this square is read' : 'Tap the score on the photo'}</p>
          {!crop && <img src={photo.url} alt={`Paper of ${learner.name}`} onClick={tap} className="w-full rounded-lg cursor-crosshair" />}
          {crop && (
            <div className="flex items-center gap-3">
              {crop.url && <img src={crop.url} alt="The score" className="h-28 w-28 rounded-lg border border-gray-200 object-cover" />}
              <div className="flex-1 space-y-1">
                {!crop.reading && !crop.error && <button type="button" disabled={busy} onClick={read} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? <span className="flex items-center gap-1"><Loader2 size={14} className="animate-spin" /> Reading…</span> : 'Read this score'}</button>}
                {!crop.reading && !crop.error && <p className="text-[11px] text-gray-500">Make sure the square shows the score only, not the name.</p>}
                {crop.reading && !crop.reading.sure && <p className="text-xs text-amber-800 flex items-center gap-1"><AlertTriangle size={13} /> Not clear{crop.reading.score !== null ? ` (maybe ${crop.reading.score})` : ''}. Type it.</p>}
                {crop.error && <p className="text-xs text-red-700">{crop.error} Type it instead.</p>}
                <input aria-label={`Score of ${learner.name}`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="w-24 rounded-lg border border-gray-300 px-2 py-2 text-right text-xl font-bold" />
              </div>
            </div>
          )}
          {crop && !busy && <button type="button" onClick={() => { token.current += 1; setCrop(null); setValue(''); }} className="text-xs font-semibold text-emerald-800 underline">Tap another spot</button>}
        </Card>
      )}
      <div className="kt-covers-nav fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 gap-2 border-t border-gray-200 bg-white p-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button type="button" disabled={busy} onClick={() => goTo(i + 1)} className="flex items-center justify-center gap-1 rounded-xl border border-gray-300 py-3 text-sm font-semibold disabled:opacity-40"><SkipForward size={16} /> No paper</button>
        <button type="button" disabled={busy} onClick={() => onDone(got)} className="rounded-xl border border-gray-300 py-3 text-sm font-semibold disabled:opacity-40">Finish</button>
        <button type="button" disabled={!value.trim() || busy} onClick={() => goTo(i + 1, value.trim())} className="flex items-center justify-center gap-1 rounded-xl bg-emerald-700 py-3 text-sm font-bold text-white disabled:opacity-40"><Check size={16} /> Next</button>
      </div>
    </div>
  );
}

const MARK_STYLE = { P: 'bg-emerald-600 text-white', L: 'bg-amber-500 text-white', A: 'bg-red-600 text-white', E: 'bg-sky-600 text-white' };
const MARK_LABEL = { P: 'Present', L: 'Late', A: 'Absent', E: 'Excused' };

/** Attendance by tap for one class and day, saved by KaTuroDesk in Records/Attendance. */
export function AttendanceScreen({ client, cls, onClose }) {
  const [date, setDate] = useState(() => isoDay());
  const [marks, setMarks] = useState({});
  const [state, setState] = useState({ loading: true });
  const [saved, setSaved] = useState(null);
  const order = useMemo(() => classOrder(cls.learners), [cls]);

  useEffect(() => {
    let alive = true;
    client.request('attendanceGet', { path: cls.path, date })
      .then((r) => { if (alive) { setMarks(r.marks || {}); setState({}); } })
      .catch((err) => alive && setState({ note: err.code === 'UNREACHABLE' ? 'KaTuroDesk is not reachable: marks will wait on this phone.' : err.message }));
    return () => { alive = false; };
  }, [client, cls.path, date]);

  const save = async () => {
    const all = Object.fromEntries(order.map((l) => [l.lrn, marks[l.lrn] || 'P']));
    const item = { id: newId(), op: 'attendance', args: { path: cls.path, date, marks: all }, className: cls.name, columnLabel: `Attendance ${date}` };
    setState({ busy: true });
    try {
      setSaved(await client.request('attendance', { ...item.args, id: item.id }));
      setState({});
    } catch (err) {
      if (err.code === 'UNREACHABLE' || err.code === 'DESK_STARTING') {
        queueRecording(item);
        setSaved({ queued: true });
        setState({});
      } else setState({ note: err.message });
    }
  };

  if (saved) {
    const c = saved.counts || {};
    return (
      <div className="p-3 space-y-3">
        <Card className="text-center space-y-2">
          {saved.queued ? <CloudOff size={36} className="mx-auto text-amber-600" /> : <CheckCircle2 size={36} className="mx-auto text-emerald-600" />}
          <p className="font-bold">{saved.queued ? 'Saved on this phone' : 'Attendance saved'}</p>
          <p className="text-sm text-gray-600">{saved.queued ? 'It will be sent when KaTuroDesk is reachable.' : `${c.P || 0} present · ${c.L || 0} late · ${c.A || 0} absent · ${c.E || 0} excused, in ${saved.file}.`}</p>
        </Card>
        {saved.absentStreaks?.length > 0 && (
          <Card className="border border-red-200 bg-red-50">
            <p className="text-sm font-semibold text-red-800 flex items-center gap-2"><AlertTriangle size={16} /> Absent 3 or more school days in a row</p>
            <ul className="mt-1 text-sm text-red-800">{saved.absentStreaks.map((s) => <li key={s.lrn}>{s.name}: {s.days} days</li>)}</ul>
            <p className="mt-1 text-xs text-red-700">On KaTuroDesk, ask &ldquo;check attendance&rdquo; for Home Visitation Notices.</p>
          </Card>
        )}
        <button type="button" onClick={onClose} className="w-full rounded-xl bg-emerald-700 py-3 font-bold text-white">Done</button>
      </div>
    );
  }
  return (
    <div className="p-3 space-y-3 pb-24">
      <Card className="flex items-center gap-2">
        <input aria-label="Date" type="date" value={date} onChange={(e) => { setState({ loading: true }); setDate(e.target.value); }} className="flex-1 rounded-lg border border-gray-300 px-3 py-2" />
        <button type="button" onClick={() => setMarks({})} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold">All present</button>
      </Card>
      {state.note && <p className="px-1 text-xs text-amber-800">{state.note}</p>}
      {state.loading && <p className="flex items-center gap-2 px-1 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> Loading…</p>}
      <ul className="rounded-xl bg-white shadow-sm divide-y divide-gray-100">
        {order.map((l) => {
          const m = marks[l.lrn] || 'P';
          return (
            <li key={l.lrn} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{l.name}</span>
              <span className="flex gap-1">
                {['P', 'L', 'A', 'E'].map((k) => (
                  <button key={k} type="button" aria-label={`${MARK_LABEL[k]}: ${l.name}`} aria-pressed={m === k} onClick={() => setMarks((x) => ({ ...x, [l.lrn]: k }))} className={`h-9 w-9 rounded-lg text-sm font-bold ${m === k ? MARK_STYLE[k] : 'bg-gray-100 text-gray-500'}`}>{k}</button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="kt-covers-nav fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white p-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={save} disabled={state.busy} className="w-full rounded-xl bg-emerald-700 py-3.5 font-bold text-white disabled:opacity-50">{state.busy ? 'Saving…' : `Save attendance for ${date}`}</button>
      </div>
    </div>
  );
}

/** Recordings made from the phone for this class, with Undo. */
export function RecentRecordings({ client, cls, onChanged }) {
  const [list, setList] = useState(null);
  const [note, setNote] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    client.request('history', { path: cls.path }).then((r) => alive && setList(r.history)).catch(() => alive && setList([]));
    return () => { alive = false; };
  }, [client, cls.path, tick]);
  if (!list?.length) return null;
  const undo = async (h) => {
    if (!window.confirm(`Undo ${h.columnLabel} (${h.count} score${h.count === 1 ? '' : 's'}) recorded ${when(h.at)}? The scores go back to what they were.`)) return;
    try {
      const r = await client.request('undo', { id: h.id });
      setNote(r.already ? 'That was already undone.' : `${h.columnLabel} is back to how it was.`);
      setTick((t) => t + 1);
      onChanged?.();
    } catch (err) {
      setNote(err.message);
    }
  };
  return (
    <section className="space-y-1">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1"><History size={13} /> Recorded from the phone</p>
      {note && <p className="px-1 text-xs text-emerald-800">{note}</p>}
      <ul className="rounded-xl bg-white shadow-sm divide-y divide-gray-100">
        {list.slice(0, 8).map((h) => (
          <li key={h.id} className={`flex items-center gap-2 px-3 py-2 ${h.undoneAt ? 'opacity-50' : ''}`}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-900">{h.columnLabel} · {h.count} score{h.count === 1 ? '' : 's'}{h.undoneAt ? ' (undone)' : ''}</span>
              <span className="block text-[11px] text-gray-500">{when(h.at)} · {h.device}</span>
            </span>
            {!h.undoneAt && <button type="button" onClick={() => undo(h)} className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold"><RotateCcw size={13} /> Undo</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
