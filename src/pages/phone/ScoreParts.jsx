/**
 * Pieces shared by the Scores tab (ScoresFlow, BubbleScan) and "Check test papers" (TestCheck,
 * TestRecord): the class list, the task (column) grid, checking and recording one task's scores
 * (with keeping them on the phone and Undo), the bubble-sheet review rows and the typed answer key.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, CloudOff, Loader2, RefreshCw, RotateCcw, Send, Trash2 } from 'lucide-react';
import { CHOICE_SETS } from '../../services/desk/bubble/layout';
import { readKey } from '../../services/desk/bubble/quiz';
import { cacheClassList, cachedClasses, checkEntries, newId, queueRecording } from '../../services/link/scoreEntry';

const COMPONENT_TITLE = { ww: 'Written Work', pt: 'Performance Tasks', qa: 'Quarterly Assessment' };

export const Card = ({ children, className = '' }) => <div className={`rounded-xl bg-white p-4 shadow-sm ${className}`}>{children}</div>;

/** The class records in Records (kept on the phone for when KaTuroDesk can't be reached). */
export function ClassList({ client, online, onPick }) {
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
    <div className="space-y-4 px-5 py-3">
      <div className="flex items-center justify-between">
        <p className="nm-muted text-sm font-medium">Classes</p>
        <button type="button" onClick={() => { setState((s) => ({ ...s, loading: true })); setTick((t) => t + 1); }} className="nm-sm nm-press nm-muted grid h-10 w-10 place-items-center rounded-full" aria-label="Refresh"><RefreshCw size={16} className={state.loading ? 'animate-spin' : ''} /></button>
      </div>
      {state.fromPhone && !state.loading && <p className="text-xs text-amber-800">Saved on this phone · scores send when KaTuroDesk is back</p>}
      {state.error && <Card><p className="text-sm text-red-700">{state.error}</p></Card>}
      {!state.loading && !state.list.length && (
        <div className="py-10 text-center">
          <p className="text-sm font-medium">No class records yet</p>
          <p className="nm-muted mt-1 text-xs">Set one up on KaTuroDesk</p>
        </div>
      )}
      <ul className="space-y-4">
        {state.list.map((c) => (
          <li key={c.path}>
            <button type="button" disabled={!c.ready} onClick={() => onPick(c)} className="nm nm-press flex w-full items-center gap-4 rounded-3xl px-5 py-4 text-left disabled:opacity-90">
              <ClipboardList size={24} className={c.ready ? 'nm-green' : 'nm-muted'} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                {c.ready
                  ? <span className="nm-muted block text-xs">{c.learnerCount} learners</span>
                  : <span className="block text-xs text-amber-800">Not ready: {c.problems?.[0]}</span>}
              </span>
              {c.ready && <ChevronRight size={18} className="text-gray-400" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The tasks of a class record (WW 1…, PT 1…, QA), by component. */
export function ColumnGrid({ cls, onPick }) {
  const total = cls.learners.length;
  return ['ww', 'pt', 'qa'].map((k) => {
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
  });
}

/**
 * Check, then send one task's scores (or keep them on the phone while KaTuroDesk can't be reached).
 *   entry: { hps, values: { [lrn]: typed } }
 *   testPath: the scores of a Test: KaTuroDesk notes it as recorded once they are written
 *   blocked: a reason not to record yet (shown above; the Record button is off)
 *   label: the Record button's text   children: notes shown above the checks
 */
export function RecordReview({ cls, column, entry, client, onBack, onDone, testPath = '', blocked = '', label = 'Record in KaTuroDesk', backLabel = 'Edit', children }) {
  const check = checkEntries(cls, column.key, entry.hps, entry.values);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const needsYes = check.changes.length > 0;

  const send = async () => {
    setBusy(true);
    setError('');
    const item = { id: newId(), path: cls.path, className: cls.name, column: column.key, columnLabel: column.label, hps: Number(entry.hps), scores: check.scores, overwrite: replace, ...(testPath ? { testPath } : {}) };
    try {
      const result = await client.request('record', item);
      if (testPath) client.request('testRecorded', { path: testPath }, { timeoutMs: 8000 }).catch(() => {}); // not waited for; an older KaTuroDesk does not know this: fine
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
    <div className="space-y-3">
      <Card>
        <p className="text-sm text-gray-600">{cls.name}</p>
        <p className="text-lg font-bold text-gray-900">{column.label} · out of {entry.hps || '?'}</p>
        <p className="text-sm text-gray-700 mt-1">{check.scores.length} score{check.scores.length === 1 ? '' : 's'} to record{check.absent.length ? ` · ${check.absent.length} absent` : ''}</p>
      </Card>
      {children}
      {blocked && <Card className="border border-amber-200 bg-amber-50"><p className="text-sm text-amber-900">{blocked}</p></Card>}
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
      {error && <Card className="border border-red-200 bg-red-50"><p role="alert" className="text-sm text-red-800">{error}</p></Card>}
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="flex-1 rounded-xl border border-gray-300 bg-white py-3 font-semibold text-gray-800">{backLabel}</button>
        <button type="button" onClick={send} disabled={busy || Boolean(blocked) || !check.ready || (needsYes && !replace)} className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 font-bold text-white disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} {label}
        </button>
      </div>
      <p className="text-[11px] text-gray-500">KaTuroDesk saves a backup of {cls.name} in KaTuro Backups first, then writes the scores into it.</p>
    </div>
  );
}

/** After recording: what was written, the missing papers, Undo. children: the next actions. */
export function RecordDone({ outcome, column, client, onUndone, children }) {
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
    <div className="space-y-3">
      <Card className="text-center space-y-2">
        {outcome.queued ? <CloudOff size={40} className="mx-auto text-amber-600" /> : <CheckCircle2 size={40} className="mx-auto text-emerald-600" />}
        <p role="status" className="text-lg font-bold text-gray-900">{outcome.queued ? 'Saved on this phone' : 'Recorded'}</p>
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
      {children}
    </div>
  );
}

/** Bubble sheets read on the phone (quiz.js reviewSheets): each sheet, and what must be settled. */
export function BubbleRows({ quiz, review, onDecide }) {
  const learnerName = (n) => quiz.learners.find((l) => l.n === n)?.name || '';
  return review.rows.map((r) => (
    <Card key={r.photo} className={r.issues.length ? 'border border-amber-200' : ''}>
      <div className="flex items-center gap-2">
        {r.skipped ? <span className="text-sm text-gray-400 flex-1">{r.photo}: left out</span> : (
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-gray-900 truncate">{r.learner ? learnerName(r.learner) : r.photo}</span>
            {Number.isFinite(r.score) && <span className="block text-xs text-emerald-800">{r.score} / {quiz.items}</span>}
          </span>
        )}
        {!r.skipped && <button type="button" onClick={() => onDecide(r.photo, { skip: true })} aria-label={`Leave out ${r.photo}`} className="p-2 text-gray-400"><Trash2 size={18} /></button>}
      </div>
      {r.issues.map((iss) => (
        <div key={`${iss.kind}-${iss.item || ''}`} className="mt-2 text-sm text-amber-900">
          {iss.kind === 'item' ? (
            <div>
              <p>Item {iss.item}: {iss.note}. Choose the answer:</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {[...CHOICE_SETS[quiz.choices], ''].map((letter) => (
                  <button key={letter || 'blank'} type="button" onClick={() => onDecide(r.photo, { answers: { [iss.item]: letter } })} className="min-w-[44px] rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold">{letter || 'No answer'}</button>
                ))}
              </div>
            </div>
          ) : iss.kind === 'learner' || iss.kind === 'duplicate' ? (
            <div>
              <p>{iss.note}</p>
              <select aria-label={`Learner for ${r.photo}`} defaultValue="" onChange={(e) => onDecide(r.photo, { learner: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-amber-300 bg-white p-2">
                <option value="" disabled>Choose the learner</option>
                {quiz.learners.map((l) => <option key={l.n} value={l.n}>{l.name}</option>)}
              </select>
            </div>
          ) : <p>{iss.note}</p>}
        </div>
      ))}
    </Card>
  ));
}

/** The answer key typed in order (e.g. ABCDA…), checked against the quiz ({ items, choices }). */
export function KeyTyping({ quiz, value, onChange, onKey, busy = false, id = 'kt-key-text' }) {
  const [error, setError] = useState('');
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-xs text-gray-600">Type the {quiz.items} correct answers in order ({(CHOICE_SETS[quiz.choices] || CHOICE_SETS[4]).join(', ')}), e.g. ABCDA… Spaces and numbers are fine.</label>
      <textarea id={id} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} rows={3} className="w-full rounded-lg border border-gray-300 p-2 font-mono text-base" />
      <button
        type="button"
        disabled={busy || !value.trim()}
        onClick={() => {
          const r = readKey(value, quiz);
          if (r.error) setError(r.error);
          else { setError(''); onKey(r.key); }
        }}
        className="w-full rounded-xl bg-emerald-700 py-3 font-bold text-white disabled:opacity-50"
      >{busy ? 'Saving…' : 'Use this key'}</button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
