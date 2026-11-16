import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, ChevronRight, ClipboardList, CloudOff, Loader2, RefreshCw, RotateCcw, ScanLine, Send, UserCheck } from 'lucide-react';
import { checkEntries, classGroups, newId, queueRecording, queuedRecordings, sendQueued, cacheClassList, cacheClass, cachedClasses } from '../../services/link/scoreEntry';
import BubbleScan from './BubbleScan';
import { SnapScores, AttendanceScreen, RecentRecordings } from './PhoneCapture';

const COMPONENT_TITLE = { ww: 'Written Work', pt: 'Performance Tasks', qa: 'Quarterly Assessment' };

function Bar({ title, onBack, right }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-[#eef2ef] px-3 py-2 border-b border-gray-200">
      {onBack && <button type="button" onClick={onBack} aria-label="Back" className="p-2 -ml-2"><ArrowLeft size={20} /></button>}
      <p className="text-sm font-bold text-gray-900 truncate flex-1">{title}</p>
      {right}
    </div>
  );
}

const Card = ({ children, className = '' }) => <div className={`rounded-xl bg-white p-4 shadow-sm ${className}`}>{children}</div>;

/** Waiting recordings banner + "Send now". */
function QueueBanner({ client, onChange }) {
  const [items, setItems] = useState(() => queuedRecordings());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const after = useCallback((r) => {
    setItems(queuedRecordings());
    setNote(r.unreachable ? 'KaTuroDesk is still not reachable.' : r.sent.length ? `${r.sent.length} waiting recording${r.sent.length > 1 ? 's' : ''} sent to KaTuroDesk.` : '');
    if (r.sent.length) onChange?.();
  }, [onChange]);
  const send = async () => {
    setBusy(true);
    after(await sendQueued(client));
    setBusy(false);
  };
  // Whenever the Scores tab opens with recordings waiting, try to send them.
  useEffect(() => {
    if (!client || !queuedRecordings().length) return undefined;
    let alive = true;
    sendQueued(client).then((r) => alive && after(r));
    return () => { alive = false; };
  }, [client, after]);
  if (!items.length) return note ? <p className="mx-3 mt-3 text-xs text-emerald-800">{note}</p> : null;
  return (
    <Card className="mx-3 mt-3 border border-amber-200 bg-amber-50">
      <p className="text-sm font-semibold text-amber-900 flex items-center gap-2"><CloudOff size={16} /> {items.length} recording{items.length > 1 ? 's' : ''} waiting on this phone</p>
      <ul className="mt-1 text-xs text-amber-900 space-y-0.5">
        {items.map((i) => <li key={i.id}>{i.className} · {i.columnLabel}{i.error ? <span className="block text-red-700">{i.error}</span> : null}</li>)}
      </ul>
      <button type="button" onClick={send} disabled={busy} className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send now'}</button>
      {note && <p className="mt-1 text-xs text-amber-900">{note}</p>}
    </Card>
  );
}

/** Step 1: the class records in Records. */
function ClassList({ client, online, onPick }) {
  const [state, setState] = useState(() => {
    const c = cachedClasses();
    return { loading: true, list: c.list || [], fromPhone: Boolean(c.list) };
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    client.request('classes').then((r) => {
      if (!alive) return;
      cacheClassList(r.classes);
      setState({ loading: false, list: r.classes, fromPhone: false });
    }).catch((err) => alive && setState((s) => ({ ...s, loading: false, error: err.code === 'UNREACHABLE' ? '' : err.message })));
    return () => { alive = false; };
  }, [client, tick, online]);

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Record scores · choose a class</p>
        <button type="button" onClick={() => { setState((s) => ({ ...s, loading: true })); setTick((t) => t + 1); }} className="p-2 text-gray-500" aria-label="Refresh"><RefreshCw size={16} className={state.loading ? 'animate-spin' : ''} /></button>
      </div>
      {state.fromPhone && !state.loading && <p className="px-1 text-xs text-amber-800">Showing the classes saved on this phone. Scores you record now are sent when KaTuroDesk is reachable.</p>}
      {state.error && <Card><p className="text-sm text-red-700">{state.error}</p></Card>}
      {!state.loading && !state.list.length && (
        <Card>
          <p className="text-sm font-semibold text-gray-900">No class records yet</p>
          <p className="text-sm text-gray-600 mt-1">On KaTuroDesk, ask: &ldquo;Set up my Grade 7 Rizal Science class record&rdquo; and attach your class list. It appears here once it is in your Records folder.</p>
        </Card>
      )}
      <ul className="space-y-2">
        {state.list.map((c) => (
          <li key={c.path}>
            <button type="button" disabled={!c.ready} onClick={() => onPick(c)} className="w-full flex items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-left shadow-sm active:bg-gray-50 disabled:opacity-90">
              <ClipboardList size={24} className={c.ready ? 'text-emerald-700' : 'text-gray-400'} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-gray-900 truncate">{c.name}</span>
                {c.ready
                  ? <span className="block text-xs text-gray-500">{c.learnerCount} learners</span>
                  : <span className="block text-xs text-amber-800">Set up this class on KaTuroDesk first: {c.problems?.[0]}</span>}
              </span>
              {c.ready && <ChevronRight size={18} className="text-gray-400" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Step 2: which task (WW 1…, PT 1…, QA). */
function ColumnList({ cls, client, onPick, onAttendance, onChanged }) {
  const total = cls.learners.length;
  return (
    <div className="p-3 space-y-4">
      <button type="button" onClick={onAttendance} className="flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-left shadow-sm">
        <UserCheck size={22} className="text-emerald-700" />
        <span className="flex-1"><span className="block text-sm font-bold text-gray-900">Take attendance</span><span className="block text-xs text-gray-500">Tap P, L, A or E for each learner</span></span>
        <ChevronRight size={18} className="text-gray-400" />
      </button>
      {['ww', 'pt', 'qa'].map((k) => {
        const cols = cls.columns.filter((c) => c.component === k);
        if (!cols.length) return null;
        return (
          <section key={k}>
            <p className="px-1 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">{COMPONENT_TITLE[k]}</p>
            <div className="grid grid-cols-2 gap-2">
              {cols.map((c) => {
                const done = c.filled >= total && total > 0;
                return (
                  <button key={c.key} type="button" onClick={() => onPick(c)} className={`rounded-xl px-3 py-3 text-left shadow-sm ${done ? 'bg-emerald-50 border border-emerald-200' : 'bg-white'}`}>
                    <span className="block text-sm font-bold text-gray-900">{c.label}</span>
                    <span className="block text-[11px] text-gray-500">{c.hps ? `out of ${c.hps}` : 'not used yet'}{c.filled ? ` · ${c.filled}/${total}` : ''}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <RecentRecordings client={client} cls={cls} onChanged={onChanged} />
    </div>
  );
}

/** Step 3: type the scores (or fill them from bubble sheets), then review. */
function Entry({ cls, column, initial, onReview, onBubble, onSnap }) {
  const existing = cls.scores?.[column.key] || {};
  const [hps, setHps] = useState(initial?.hps ?? (column.hps ?? ''));
  const [values, setValues] = useState(() => initial?.values || {});
  const refs = useRef({});
  const groups = useMemo(() => classGroups(cls.learners), [cls]);
  const order = groups.flatMap(([, list]) => list.map((l) => l.lrn));
  const next = (lrn) => {
    const i = order.indexOf(lrn);
    refs.current[order[i + 1]]?.focus();
  };
  const typed = Object.values(values).filter((v) => String(v ?? '').trim()).length;

  return (
    <div className="p-3 space-y-3 pb-28">
      <Card className="space-y-2">
        <label className="block text-xs font-semibold text-gray-600" htmlFor="kt-hps">Highest possible score (number of items)</label>
        <input id="kt-hps" type="number" inputMode="decimal" value={hps} disabled={column.hps !== null && column.hps !== undefined} onChange={(e) => setHps(e.target.value)} className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-lg font-bold disabled:bg-gray-100" />
        <button type="button" onClick={() => onBubble({ hps, values })} className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-800">
          <ScanLine size={18} /> Fill from bubble sheets
        </button>
        <button type="button" disabled={!(Number(hps) > 0)} onClick={() => onSnap({ hps, values })} className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-800 disabled:opacity-50">
          <Camera size={18} /> Snap the checked papers{Number(hps) > 0 ? '' : ' (type the highest score first)'}
        </button>
        <p className="text-[11px] text-gray-500">Type a number for each learner. Leave it blank if there is no paper yet; type <b>a</b> for absent.</p>
      </Card>
      {groups.map(([label, list]) => (
        <section key={label}>
          <p className="px-1 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
          <ul className="rounded-xl bg-white shadow-sm divide-y divide-gray-100">
            {list.map((l) => (
              <li key={l.lrn} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-900 truncate">{l.name}</span>
                  {existing[l.lrn] !== undefined && <span className="block text-[11px] text-gray-500">in the record: {existing[l.lrn]}</span>}
                </span>
                <input
                  ref={(el) => { refs.current[l.lrn] = el; }}
                  aria-label={`Score of ${l.name}`}
                  inputMode="decimal"
                  enterKeyHint="next"
                  value={values[l.lrn] ?? ''}
                  placeholder={existing[l.lrn] !== undefined ? String(existing[l.lrn]) : ''}
                  onChange={(e) => setValues((v) => ({ ...v, [l.lrn]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); next(l.lrn); } }}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-2 text-right text-base font-semibold"
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="fixed inset-x-0 bottom-0 bg-white border-t border-gray-200 p-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={() => onReview({ hps, values })} disabled={!typed} className="w-full rounded-xl bg-emerald-700 py-3.5 text-white font-bold disabled:opacity-50">Review {typed} score{typed === 1 ? '' : 's'}</button>
      </div>
    </div>
  );
}

/** Step 4: check, then send (or keep on the phone). */
function Review({ cls, column, entry, client, onBack, onDone }) {
  const check = checkEntries(cls, column.key, entry.hps, entry.values);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const needsYes = check.changes.length > 0;

  const send = async () => {
    setBusy(true);
    setError('');
    const item = { id: newId(), path: cls.path, className: cls.name, column: column.key, columnLabel: column.label, hps: Number(entry.hps), scores: check.scores, overwrite: replace };
    try {
      const result = await client.request('record', item);
      onDone({ result, id: item.id });
    } catch (err) {
      if (err.code === 'UNREACHABLE' || err.code === 'DESK_STARTING') {
        queueRecording(item);
        onDone({ queued: true });
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 space-y-3">
      <Card>
        <p className="text-sm text-gray-600">{cls.name}</p>
        <p className="text-lg font-bold text-gray-900">{column.label} · out of {entry.hps || '?'}</p>
        <p className="text-sm text-gray-700 mt-1">{check.scores.length} score{check.scores.length === 1 ? '' : 's'} to record{check.absent.length ? ` · ${check.absent.length} absent` : ''}</p>
      </Card>
      {check.invalid.length > 0 && (
        <Card className="border border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-800 flex items-center gap-2"><AlertTriangle size={16} /> Fix these first</p>
          <ul className="mt-1 text-sm text-red-800">{check.invalid.map((x) => <li key={x.lrn || 'hps'}>{x.name ? `${x.name}: "${x.text}" ${x.why}` : x.why}</li>)}</ul>
        </Card>
      )}
      {needsYes && (
        <Card className="border border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">These learners already have a score in {column.label}</p>
          <ul className="mt-1 text-sm text-amber-900">{check.changes.map((c) => <li key={c.lrn}>{c.name}: {c.before} → {c.after}</li>)}</ul>
          <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-5 w-5" /> Replace these scores
          </label>
        </Card>
      )}
      {check.missing.length > 0 && (
        <Card>
          <p className="text-sm font-semibold text-gray-900">No score yet ({check.missing.length})</p>
          <p className="text-sm text-gray-600">{check.missing.map((l) => l.name).join('; ')}</p>
        </Card>
      )}
      {error && <Card className="border border-red-200 bg-red-50"><p className="text-sm text-red-800">{error}</p></Card>}
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="flex-1 rounded-xl border border-gray-300 bg-white py-3 font-semibold text-gray-800">Edit</button>
        <button type="button" onClick={send} disabled={busy || !check.ready || (needsYes && !replace)} className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 font-bold text-white disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} Record in KaTuroDesk
        </button>
      </div>
      <p className="text-[11px] text-gray-500">KaTuroDesk saves a backup of {cls.name} in KaTuro Backups first, then writes the scores into it.</p>
    </div>
  );
}

function Done({ outcome, column, client, onAnother, onClasses, onUndone }) {
  const r = outcome.result;
  const [undo, setUndo] = useState('');
  const undoIt = async () => {
    try {
      await client.request('undo', { id: outcome.id });
      setUndo('Undone: the scores are back to how they were.');
      onUndone?.();
    } catch (err) {
      setUndo(err.message);
    }
  };
  return (
    <div className="p-3 space-y-3">
      <Card className="text-center space-y-2">
        {outcome.queued ? <CloudOff size={40} className="mx-auto text-amber-600" /> : <CheckCircle2 size={40} className="mx-auto text-emerald-600" />}
        <p className="text-lg font-bold text-gray-900">{outcome.queued ? 'Saved on this phone' : 'Recorded'}</p>
        <p className="text-sm text-gray-600">
          {outcome.queued
            ? "KaTuroDesk can't be reached right now. The scores are kept on this phone and sent when it is reachable (open the Scores tab, or tap Send now)."
            : `${r.written} score${r.written === 1 ? '' : 's'} recorded in ${r.class}, ${r.column}${r.unchanged ? ` (${r.unchanged} already there)` : ''}.`}
        </p>
        {r?.skipped?.length > 0 && <p className="text-sm text-amber-800">{r.skipped.length} cell(s) hold formulas and were left as they are: {r.skipped.join(', ')}.</p>}
      </Card>
      {r?.missing?.length > 0 && (
        <Card>
          <p className="text-sm font-semibold text-gray-900">Missing papers for {column.label} ({r.missing.length})</p>
          <ul className="mt-1 text-sm text-gray-700 list-disc pl-5">{r.missing.map((m) => <li key={m.lrn}>{m.name}</li>)}</ul>
        </Card>
      )}
      {r?.written > 0 && outcome.id && !undo && <button type="button" onClick={undoIt} className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-800"><RotateCcw size={16} /> Undo this recording</button>}
      {undo && <p className="text-center text-sm text-gray-700">{undo}</p>}
      <button type="button" onClick={onAnother} className="w-full rounded-xl bg-emerald-700 py-3 font-bold text-white">Record another task</button>
      <button type="button" onClick={onClasses} className="w-full rounded-xl border border-gray-300 bg-white py-3 font-semibold text-gray-800">Choose another class</button>
    </div>
  );
}

/** Phase 2: record one task's scores into a class record on KaTuroDesk. */
export default function ScoresFlow({ client, online }) {
  const [cls, setCls] = useState(null);
  const [column, setColumn] = useState(null);
  const [entry, setEntry] = useState(null); // { hps, values }
  const [step, setStep] = useState('classes'); // classes | columns | entry | bubble | review | done
  const [outcome, setOutcome] = useState(null);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const openClass = async (summary) => {
    setError('');
    setLoading(summary.name);
    try {
      const full = await client.request('class', { path: summary.path });
      cacheClass(summary.path, full);
      setCls(full);
      setStep('columns');
    } catch (err) {
      const kept = cachedClasses().classes[summary.path];
      if (err.code === 'UNREACHABLE' && kept) {
        setCls(kept);
        setStep('columns');
      } else {
        setError(err.code === 'UNREACHABLE' ? "KaTuroDesk can't be reached, and this class is not saved on the phone yet. Open it once while connected." : err.message);
      }
    } finally {
      setLoading('');
    }
  };

  const refreshClass = async () => {
    try {
      const full = await client.request('class', { path: cls.path });
      cacheClass(cls.path, full);
      setCls(full);
    } catch { /* keep what we have */ }
  };

  if (step === 'columns' && cls) {
    return (
      <div>
        <Bar title={cls.name} onBack={() => setStep('classes')} />
        <ColumnList cls={cls} client={client} onPick={(c) => { setColumn(c); setEntry(null); setStep('entry'); }} onAttendance={() => setStep('attendance')} onChanged={refreshClass} />
      </div>
    );
  }
  if (step === 'entry' && cls && column) {
    return (
      <div>
        <Bar title={`${column.label} · ${cls.name}`} onBack={() => setStep('columns')} />
        <Entry
          key={`${column.key}-${entry ? 'filled' : 'new'}`}
          cls={cls}
          column={column}
          initial={entry}
          onBubble={(e) => { setEntry(e); setStep('bubble'); }}
          onSnap={(e) => { setEntry(e); setStep('snap'); }}
          onReview={(e) => { setEntry(e); setStep('review'); }}
        />
      </div>
    );
  }
  if (step === 'snap' && cls && column && entry) {
    return (
      <div>
        <Bar title={`Snap papers · ${column.label}`} onBack={() => setStep('entry')} />
        <SnapScores
          cls={cls}
          hps={Number(entry.hps)}
          existing={{ ...(cls.scores?.[column.key] || {}), ...entry.values }}
          onDone={(read) => { setEntry({ hps: entry.hps, values: { ...entry.values, ...read } }); setStep('entry'); }}
        />
      </div>
    );
  }
  if (step === 'attendance' && cls) {
    return (
      <div>
        <Bar title={`Attendance · ${cls.name}`} onBack={() => setStep('columns')} />
        <AttendanceScreen client={client} cls={cls} onClose={() => setStep('columns')} />
      </div>
    );
  }
  if (step === 'bubble' && cls && column) {
    return (
      <div>
        <Bar title="Bubble sheets" onBack={() => setStep('entry')} />
        <BubbleScan
          client={client}
          cls={cls}
          onScores={({ items, scores }) => {
            const values = { ...(entry?.values || {}) };
            for (const s of scores) if (s.score !== null) values[s.lrn] = String(s.score);
            setEntry({ hps: column.hps ?? items, values });
            setStep('entry');
          }}
        />
      </div>
    );
  }
  if (step === 'review' && cls && column && entry) {
    return (
      <div>
        <Bar title="Check before recording" onBack={() => setStep('entry')} />
        <Review cls={cls} column={column} entry={entry} client={client} onBack={() => setStep('entry')} onDone={(o) => { setOutcome(o); setStep('done'); if (o.result) refreshClass(); }} />
      </div>
    );
  }
  if (step === 'done' && outcome && column) {
    return <Done outcome={outcome} column={column} client={client} onUndone={refreshClass} onAnother={() => { setColumn(null); setEntry(null); setStep('columns'); }} onClasses={() => { setCls(null); setStep('classes'); }} />;
  }
  return (
    <div>
      <QueueBanner client={client} />
      {loading && <p className="mx-4 mt-3 flex items-center gap-2 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> Opening {loading}…</p>}
      {error && <p className="mx-4 mt-3 text-sm text-red-700">{error}</p>}
      <ClassList client={client} online={online} onPick={openClass} />
    </div>
  );
}
