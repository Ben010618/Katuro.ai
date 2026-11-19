import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, ChevronRight, CloudOff, Loader2, ScanLine, UserCheck } from 'lucide-react';
import { classGroups, queuedRecordings, sendQueued, loadClass } from '../../services/link/scoreEntry';
import BubbleScan from './BubbleScan';
import { SnapScores, AttendanceScreen, RecentRecordings } from './PhoneCapture';
import { Card, ClassList, ColumnGrid, RecordDone, RecordReview } from './ScoreParts';


function Bar({ title, onBack, right }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-[#eef2ef] px-3 py-2 border-b border-gray-200">
      {onBack && <button type="button" onClick={onBack} aria-label="Back" className="p-2 -ml-2"><ArrowLeft size={20} /></button>}
      <p className="text-sm font-bold text-gray-900 truncate flex-1">{title}</p>
      {right}
    </div>
  );
}


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

/** Step 2: which task (WW 1…, PT 1…, QA). */
function ColumnList({ cls, client, onPick, onAttendance, onChanged }) {
  return (
    <div className="p-3 space-y-4">
      <button type="button" onClick={onAttendance} className="flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3.5 text-left shadow-sm">
        <UserCheck size={22} className="text-emerald-700" />
        <span className="flex-1"><span className="block text-sm font-bold text-gray-900">Take attendance</span><span className="block text-xs text-gray-500">Tap P, L, A or E for each learner</span></span>
        <ChevronRight size={18} className="text-gray-400" />
      </button>
      <ColumnGrid cls={cls} onPick={onPick} />
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
      <div className="kt-covers-nav fixed inset-x-0 bottom-0 z-30 bg-white border-t border-gray-200 p-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={() => onReview({ hps, values })} disabled={!typed} className="w-full rounded-xl bg-emerald-700 py-3.5 text-white font-bold disabled:opacity-50">Review {typed} score{typed === 1 ? '' : 's'}</button>
      </div>
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
      const { cls: full } = await loadClass(client, summary.path);
      if (client.closed) return;
      setCls(full);
      setStep('columns');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading('');
    }
  };

  const refreshClass = async () => {
    try {
      const { cls: full, fromPhone } = await loadClass(client, cls.path);
      if (client.closed || fromPhone) return;
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
        <div className="p-3"><RecordReview cls={cls} column={column} entry={entry} client={client} onBack={() => setStep('entry')} onDone={(o) => { setOutcome(o); setStep('done'); if (o.result) refreshClass(); }} /></div>
      </div>
    );
  }
  if (step === 'done' && outcome && column) {
    return (
      <div className="p-3">
        <RecordDone outcome={outcome} column={column} client={client} onUndone={refreshClass}>
          <button type="button" onClick={() => { setColumn(null); setEntry(null); setStep('columns'); }} className="w-full rounded-xl bg-emerald-700 py-3 font-bold text-white">Record another task</button>
          <button type="button" onClick={() => { setCls(null); setStep('classes'); }} className="w-full rounded-xl border border-gray-300 bg-white py-3 font-semibold text-gray-800">Choose another class</button>
        </RecordDone>
      </div>
    );
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
