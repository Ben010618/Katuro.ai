import { useState } from 'react';
import { Check, X, Loader2, AlertTriangle, ShieldCheck, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';

const MAX_ROWS = 600;

function Section({ title, count, tone = 'gray', children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!count) return null;
  const tones = { gray: 'text-gray-700', amber: 'text-amber-800', red: 'text-red-700', emerald: 'text-emerald-800' };
  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <button onClick={() => setOpen((v) => !v)} className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold ${tones[tone]}`}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {title} ({count})
      </button>
      {open && <div className="px-2.5 pb-2 text-[11px] text-gray-700">{children}</div>}
    </div>
  );
}

/** Review screen for a pending "changes" artifact: tick what to apply, then save a working copy. */
export default function DeskChangesView({ art }) {
  const { applyPendingChanges, discardPendingChanges } = useDeskStore();
  const d = art.data || {};
  const [selected, setSelected] = useState(() => new Set((d.changes || []).map((_, i) => i)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pending = d.status === 'pending';
  const changes = d.changes || [];
  const allOn = selected.size === changes.length;

  const toggle = (i) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  });

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      await applyPendingChanges(art.id, [...selected]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const hasLearner = changes.some((c) => c.learner);

  return (
    <div className="w-full space-y-2.5">
      {/* Status */}
      {d.status === 'applied' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-[11px] text-emerald-900 space-y-0.5">
          <p className="font-bold flex items-center gap-1"><Check size={13} /> {d.appliedCount} change(s) saved to {d.savedPath?.split('/').pop()}</p>
          <p className="flex items-center gap-1"><ShieldCheck size={12} /> Your original {d.targetPath?.split('/').pop()} was not changed. Backup: {d.backups?.[0] || 'KaTuro Backups'}</p>
          {d.skipped?.length > 0 && <p className="text-amber-800">{d.skipped.length} skipped (e.g. {d.skipped.slice(0, 3).map((s) => `${s.cell || s.id}: ${s.reason}`).join(', ')}).</p>}
        </div>
      )}
      {d.status === 'discarded' && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-[11px] text-gray-700">Discarded. Nothing was changed.</div>
      )}

      {/* Summary chips */}
      <div className="flex flex-wrap gap-1.5 text-[10.5px]">
        {d.stats?.sourceLearners !== undefined && <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200">{d.stats.matched}/{d.stats.sourceLearners} learners matched</span>}
        <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900">{changes.length} cell(s) to change</span>
        {d.conflicts?.length > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900">{d.conflicts.length} already filled (kept)</span>}
        {d.unmatched?.length > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-800">{d.unmatched.length} not found</span>}
      </div>

      {d.columns?.length > 0 && (
        <Section title="How columns were matched" count={d.columns.length}>
          <ul className="space-y-0.5">
            {d.columns.map((c, i) => (
              <li key={i} className="flex items-center gap-1">
                <span className="truncate">{c.from}</span> <ArrowRight size={10} className="flex-shrink-0 text-gray-400" /> <span className="truncate font-medium">{c.to}</span>
                <span className="ml-auto text-[9.5px] text-gray-400">{c.by}</span>
              </li>
            ))}
          </ul>
          {d.unmappedSource?.length > 0 && <p className="mt-1 text-amber-800">Not copied (no matching column): {d.unmappedSource.join(', ')}</p>}
        </Section>
      )}

      {/* Change list */}
      {changes.length > 0 ? (
        <div className="border border-gray-300 rounded-lg bg-white overflow-hidden">
          <div className="max-h-[52vh] overflow-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="text-left text-gray-600">
                  <th className="p-1.5 w-6">
                    {pending && <input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(changes.map((_, i) => i)))} className="accent-emerald-600" />}
                  </th>
                  {hasLearner && <th className="p-1.5">Learner</th>}
                  {hasLearner && <th className="p-1.5">What</th>}
                  <th className="p-1.5">Where</th>
                  <th className="p-1.5">Before → After</th>
                </tr>
              </thead>
              <tbody>
                {changes.slice(0, MAX_ROWS).map((c, i) => (
                  <tr key={i} className={`border-t border-gray-100 ${selected.has(i) || !pending ? '' : 'opacity-40'}`}>
                    <td className="p-1.5 align-top">
                      {pending && <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="accent-emerald-600" />}
                    </td>
                    {hasLearner && (
                      <td className="p-1.5 align-top">
                        <span className="block">{c.targetName || c.learner}</span>
                        {c.targetName && c.targetName !== c.learner && <span className="block text-[9.5px] text-gray-400">from “{c.learner}”</span>}
                      </td>
                    )}
                    {hasLearner && <td className="p-1.5 align-top text-gray-600">{c.column}</td>}
                    <td className="p-1.5 align-top text-gray-500 whitespace-nowrap">{c.location}</td>
                    <td className="p-1.5 align-top">
                      <span className="text-gray-400 line-through mr-1">{String(c.before ?? '') || '∅'}</span>
                      <span className="font-semibold text-emerald-800">{String(c.after ?? '') || '(blank)'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {changes.length > MAX_ROWS && <p className="p-1.5 text-[10px] text-gray-500 border-t">Showing {MAX_ROWS} of {changes.length}; all selected changes will be applied.</p>}
        </div>
      ) : (
        <p className="text-[11px] text-gray-600">No cells need changing — the target already has these values.</p>
      )}

      <Section title="Already filled in the target (kept as is)" count={d.conflicts?.length} tone="amber">
        <ul className="space-y-0.5">
          {(d.conflicts || []).slice(0, 200).map((c, i) => (
            <li key={i}>{c.targetName || c.learner} · {c.column} ({c.location}): keeps “{String(c.before)}”, source has “{String(c.after)}”</li>
          ))}
        </ul>
        <p className="mt-1 text-gray-500">Ask me to “overwrite” if you want the source values instead.</p>
      </Section>
      <Section title="Learners not found in the target" count={d.unmatched?.length} tone="red" defaultOpen>
        <ul className="space-y-0.5">
          {(d.unmatched || []).map((u, i) => (
            <li key={i}>{u.name}{u.closest ? <span className="text-gray-500"> — closest: {u.closest.name} ({Math.round(u.closest.score * 100)}%)</span> : null}</li>
          ))}
        </ul>
      </Section>
      <Section title="Name spelling differences (matched anyway)" count={d.nameFixes?.length} tone="emerald">
        <ul className="space-y-0.5">
          {(d.nameFixes || []).map((n, i) => <li key={i}>“{n.source}” → “{n.target}” ({Math.round(n.score * 100)}%)</li>)}
        </ul>
      </Section>
      <Section title="In the target but not in the source" count={d.unmatchedTarget?.length}>
        <p>{(d.unmatchedTarget || []).join(', ')}</p>
      </Section>

      {error && <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2 flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>}

      {pending && (
        <div className="sticky bottom-0 bg-[#e8ecea] pt-1.5 pb-0.5 flex items-center gap-2">
          <button
            onClick={apply}
            disabled={busy || !selected.size}
            className="flex-1 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Apply {selected.size} change(s)
          </button>
          <button onClick={() => discardPendingChanges(art.id)} disabled={busy} className="px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 text-xs font-semibold flex items-center gap-1 hover:bg-gray-50">
            <X size={13} /> Discard
          </button>
        </div>
      )}
      {pending && (
        <p className="text-[10px] text-gray-500 flex items-center gap-1">
          <ShieldCheck size={11} className="text-emerald-700" /> Your original file stays untouched: it is backed up, and the changes go into “{d.targetPath?.split('/').pop().replace(/(\.[^.]+)$/, ' (KaTuro edit)$1')}”.
        </p>
      )}
    </div>
  );
}
