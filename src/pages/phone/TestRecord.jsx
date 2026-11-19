import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { loadClass } from '../../services/link/scoreEntry';
import { recordTarget, splitByLrn } from '../../services/link/phoneTests';
import { Card, ClassList, ColumnGrid, RecordDone, RecordReview } from './ScoreParts';

/**
 * The last step of checking a test: the scores go into the E-Class Record (by LRN, `record`),
 * then KaTuroDesk notes the test as recorded (`testRecorded`; also when the recording waited on
 * the phone and is sent later).
 *   scored: [{ name, lrn, score }]   items: the test's number of items (the highest possible score)
 *   onBack: back to the review   onRecorded: the scores were recorded (or wait on the phone)
 *   backRef: set to this step's own Back (→ true when it went back inside)
 * The test's own record and column are used when it has them; otherwise the teacher picks.
 */
export default function TestRecord({ client, test, items, scored, onBack, onRecorded, onFinish, backRef }) {
  const preset = recordTarget(test);
  const [target, setTarget] = useState(null); // { cls, column, fromPhone }
  const [picking, setPicking] = useState(preset ? null : 'class'); // null | 'class' | 'column'
  const [pickedCls, setPickedCls] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0); // Retry
  const [opening, setOpening] = useState('');
  const [outcome, setOutcome] = useState(null);

  // The test knows its record and column: open them straight away (the copy on the phone when
  // KaTuroDesk can't be reached; the scores then wait on the phone).
  useEffect(() => {
    if (!preset) return undefined;
    let alive = true;
    loadClass(client, preset.path).then(({ cls, fromPhone }) => {
      if (!alive) return;
      const column = cls.columns.find((c) => c.key === preset.column);
      if (column) { setTarget({ cls, column, fromPhone }); setLoadError(''); }
      else { setLoadError(`${preset.label} is not in ${cls.name} any more. Choose where the scores go.`); setPicking('class'); }
    }).catch((err) => alive && setLoadError(err.message));
    return () => { alive = false; };
  }, [client, preset?.path, preset?.column, preset?.label, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Android back / the arrow: column → class list → the test's own record (when there is one).
  useEffect(() => {
    if (!backRef) return undefined;
    backRef.current = () => {
      if (outcome) return false;
      if (picking === 'column') { setPicking('class'); return true; }
      if (picking === 'class' && target) { setPicking(null); return true; }
      return false;
    };
    return () => { backRef.current = null; };
  });

  const { scores, noLrn } = useMemo(() => splitByLrn(scored), [scored]);
  const shaped = useMemo(() => {
    if (!target) return null;
    const inClass = new Set(target.cls.learners.map((l) => l.lrn));
    return {
      values: Object.fromEntries(scores.filter((s) => inClass.has(s.lrn)).map((s) => [s.lrn, String(s.score)])),
      notInClass: scored.filter((s) => s.lrn && !inClass.has(s.lrn) && Number.isFinite(s.score)).map((s) => s.name),
    };
  }, [target, scores, scored]);

  const pickClass = async (summary) => {
    setOpening(summary.name);
    setLoadError('');
    try {
      const { cls } = await loadClass(client, summary.path);
      setPickedCls(cls);
      setPicking('column');
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setOpening('');
    }
  };

  const noLrnNote = noLrn.length > 0 && (
    <Card className="border border-amber-200 bg-amber-50">
      <p className="text-sm text-amber-900">{noLrn.length} learner{noLrn.length > 1 ? 's have' : ' has'} no LRN in the test’s list, so KaTuroDesk can’t put {noLrn.length > 1 ? 'their scores' : 'the score'} in the record: {noLrn.join('; ')}. Type {noLrn.length > 1 ? 'them' : 'it'} on KaTuroDesk.</p>
    </Card>
  );

  if (outcome) {
    return (
      <RecordDone outcome={outcome} column={target.column} client={client}>
        {noLrnNote}
        <button type="button" onClick={onFinish} className="nm-accent nm-press w-full rounded-2xl py-4 font-semibold">Done</button>
      </RecordDone>
    );
  }

  if (picking === 'column' && pickedCls) {
    return (
      <div className="space-y-4">
        <p className="text-base font-semibold">Which task in {pickedCls.name}?</p>
        <ColumnGrid cls={pickedCls} onPick={(column) => { setTarget({ cls: pickedCls, column, fromPhone: false }); setPicking(null); }} />
      </div>
    );
  }
  if (picking === 'class') {
    return (
      <div className="-mx-5 space-y-2">
        <p className="px-5 text-base font-semibold">Which class record?</p>
        {loadError && <p role="alert" className="px-5 text-sm text-amber-900">{loadError}</p>}
        {opening && <p className="flex items-center gap-2 px-5 text-sm"><Loader2 size={16} className="animate-spin" /> Opening {opening}…</p>}
        <ClassList client={client} onPick={pickClass} />
      </div>
    );
  }
  if (!target) {
    if (!loadError) return <p className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" /> Opening {preset.name}…</p>;
    return (
      <div className="space-y-3">
        <p role="alert" className="nm-in rounded-2xl p-4 text-sm text-amber-900">{loadError}</p>
        <button type="button" onClick={() => { setLoadError(''); setTick((t) => t + 1); }} className="nm-accent nm-press flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-semibold"><RefreshCw size={18} /> Try again</button>
        <button type="button" onClick={() => setPicking('class')} className="nm-sm nm-press w-full rounded-2xl py-3 text-sm font-medium">Choose another record</button>
        <button type="button" onClick={onBack} className="nm-sm nm-press w-full rounded-2xl py-3 text-sm font-medium">Back to the results</button>
      </div>
    );
  }

  const { cls, column } = target;
  const hpsDiffers = column.hps !== null && column.hps !== undefined && Number(column.hps) !== Number(items);
  return (
    <RecordReview
      cls={cls}
      column={column}
      entry={{ hps: items, values: shaped.values }}
      client={client}
      testPath={test.path}
      label={`Record into ${cls.name} · ${column.label}`}
      backLabel="Back"
      blocked={hpsDiffers ? `${column.label} is out of ${column.hps} in the record, but the test has ${items} items. Choose another task, or fix it on KaTuroDesk.` : ''}
      onBack={onBack}
      onDone={(o) => { setOutcome(o); onRecorded?.(); }}
    >
      <button type="button" onClick={() => setPicking('class')} className="nm-green px-1 text-xs font-semibold underline">Record somewhere else</button>
      {target.fromPhone && <p className="px-1 text-xs text-amber-800">KaTuroDesk can’t be reached: the scores wait on this phone and are sent when it is back.</p>}
      {noLrnNote}
      {shaped.notInClass.length > 0 && <Card className="border border-amber-200 bg-amber-50"><p className="text-sm text-amber-900">Not in {cls.name}, left out: {shaped.notInClass.join('; ')}.</p></Card>}
    </RecordReview>
  );
}
