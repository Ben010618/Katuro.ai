import { useCallback, useMemo } from 'react';
import { AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import { transcribeAudio } from '../../services/desk/voice/voiceInput';
import {
  NAMED_SCORES_PROMPT, LIST_SCORES_PROMPT, checkVoiceReply, parseNamedScores, parseListScores,
  emptySession, addNamedEntries, addListValues, resolveIssue, setScore, setCursor, scoreProblem,
  buildScorePlan, scoreChangesArtifact,
} from '../../services/desk/voice/voiceScores';
import { useVoiceInput } from './useVoiceInput';
import { VoiceButton, VoiceStatus } from './VoiceControls';

const ISSUE_TEXT = {
  ambiguous: 'matches more than one learner. Who was it?',
  unknown: 'is not in this list. Who was it?',
  'no-score': 'was said without a score.',
  unclear: 'could not be heard clearly.',
  extra: 'was heard after the end of the list.',
};

const fmt = (v) => (v === 'absent' ? 'Absent' : v === null || v === undefined ? '' : String(v));

function IssueRow({ issue, learners, onResolve }) {
  const choices = issue.candidates.length ? issue.candidates : learners.map((_, i) => i);
  const needsScore = issue.value === null || issue.value === undefined;
  const pick = (form) => {
    const fd = new FormData(form);
    const index = fd.get('learner') === '' ? null : Number(fd.get('learner'));
    const raw = String(fd.get('score') ?? '').trim();
    const value = needsScore ? (raw.toLowerCase() === 'absent' ? 'absent' : raw === '' ? null : Number(raw)) : undefined;
    onResolve(issue.id, index, value);
  };
  return (
    <form
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-amber-200 bg-white px-2 py-1.5"
      onSubmit={(e) => { e.preventDefault(); pick(e.currentTarget); }}
    >
      <span className="min-w-0 flex-1 text-[11px] text-amber-950">
        <span className="font-semibold">"{issue.heard}"</span>{issue.value !== null && issue.value !== undefined && issue.kind !== 'unclear' ? ` (${fmt(issue.value)})` : ''} {ISSUE_TEXT[issue.kind]}
      </span>
      <select name="learner" defaultValue={choices.length === 1 ? String(choices[0]) : ''} className="border border-gray-300 bg-white" style={{ padding: '2px 4px', fontSize: 11, borderRadius: 4, width: 'auto', maxWidth: 190 }}>
        <option value="">Choose learner…</option>
        {choices.map((i) => <option key={i} value={i}>{learners[i].name}</option>)}
      </select>
      {needsScore && <input name="score" placeholder="Score" aria-label="Score" className="border border-gray-300" style={{ padding: '2px 4px', fontSize: 11, width: 64, borderRadius: 4 }} />}
      <button type="submit" className="rounded bg-emerald-700 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-800">Use</button>
      <button type="button" onClick={() => onResolve(issue.id, null)} className="rounded px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100">Dismiss</button>
    </form>
  );
}

/** Canvas panel for a "voice_scores" artifact: speak scores, check them, then review the cell changes. */
export default function DeskVoiceScoresView({ art }) {
  const { updateArtifact, addArtifacts, setActiveArtifact } = useDeskStore();
  const d = art.data || {};
  const learners = d.learners || [];
  const session = d.session || emptySession();
  const mode = d.mode || 'named';
  const column = (d.columns || []).find((c) => c.key === d.columnKey) || null;
  const maxScore = Number(d.maxScore);

  // Always build on the latest stored state (several clips can land quickly).
  const save = useCallback((fn) => {
    const s = useDeskStore.getState();
    const cur = s.artifacts.find((a) => a.id === art.id) || (s.activeArtifact?.id === art.id ? s.activeArtifact : art);
    const data = cur.data || {};
    updateArtifact(art.id, { data: { ...data, ...fn(data) } });
  }, [art, updateArtifact]);

  const transcribe = useCallback(
    (wav) => transcribeAudio(wav, { prompt: mode === 'list' ? LIST_SCORES_PROMPT : NAMED_SCORES_PROMPT, clean: checkVoiceReply }),
    [mode],
  );
  const voice = useVoiceInput({
    transcribe,
    onText: (text) => save((data) => {
      const cur = data.session || emptySession();
      return {
        session: (data.mode || 'named') === 'list'
          ? addListValues(cur, parseListScores(text), data.learners || [])
          : addNamedEntries(cur, parseNamedScores(text), data.learners || []),
      };
    }),
  });

  const chooseColumn = (key) => save((data) => {
    const col = (data.columns || []).find((c) => c.key === key);
    // The file's own highest possible score fills the box when it is still empty.
    const fromFile = col?.max && !data.maxScore ? { maxScore: String(col.max), maxFromFile: true } : {};
    return { columnKey: key, ...fromFile };
  });

  const result = useMemo(
    () => buildScorePlan({ learners, column, kind: d.kind, session, maxScore, absentAs: d.absentAs, overwrite: d.overwrite === true }),
    [learners, column, d.kind, session, maxScore, d.absentAs, d.overwrite],
  );
  const hasAbsent = Object.values(session.assignments).some((a) => a.value === 'absent');
  const hasFilled = column && Object.keys(session.assignments).some((i) => {
    const v = learners[i]?.values?.[column.key];
    return v !== null && v !== undefined && String(v).trim() !== '';
  });
  const scoredCount = Object.keys(session.assignments).length;

  const review = () => {
    if (!result.ok) return;
    const changes = scoreChangesArtifact(result.plan, { targetPath: d.targetPath, kind: d.kind, columnLabel: column.header || column.key });
    addArtifacts([changes]);
    setActiveArtifact(changes);
  };

  const label = 'text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
  const box = { padding: '4px 6px', fontSize: 12, borderRadius: 6 };

  return (
    <div className="w-full space-y-3 text-xs text-gray-800">
      {/* Setup */}
      <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={label}>Score column</span>
          <select value={d.columnKey || ''} onChange={(e) => chooseColumn(e.target.value)} className="w-full border border-gray-300 bg-white" style={box}>
            <option value="">Choose…</option>
            {(d.columns || []).map((c) => (
              <option key={c.key} value={c.key}>{c.header || c.key}{c.column ? ` (column ${c.column})` : ''}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={label}>Highest possible score{d.maxFromFile && String(column?.max) === String(d.maxScore) ? ' (from your file)' : ''}</span>
          <input type="number" min="1" value={d.maxScore || ''} onChange={(e) => save(() => ({ maxScore: e.target.value, maxFromFile: false }))} placeholder="e.g. 20" className="w-full border border-gray-300" style={box} />
        </label>
        <div className="space-y-1 sm:col-span-2">
          <span className={label}>How you will read</span>
          <div className="flex gap-1.5">
            {[['named', 'Name and score'], ['list', 'Scores in list order']].map(([key, text]) => (
              <button
                key={key}
                type="button"
                onClick={() => save(() => ({ mode: key }))}
                disabled={voice.status !== 'idle'}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${mode === key ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Microphone */}
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <VoiceStatus voice={voice} />
        <div className="flex items-center gap-2">
          <VoiceButton voice={voice} disabled={!column} />
          <p className="text-[11px] text-gray-600">
            {!column
              ? 'Choose the score column first.'
              : mode === 'list'
                ? <>Read only the scores, in list order, in English: <span className="italic">"18, 15, absent, skip, 20"</span>. Next: <span className="font-semibold">{learners[session.cursor]?.name || 'end of list'}</span></>
                : <>Read names and scores in English: <span className="italic">"Alvarez 18, Bautista 15, Cruz absent"</span>. Add the first name when two learners share a surname.</>}
          </p>
        </div>
      </div>

      {/* Questions */}
      {session.issues.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-900"><AlertTriangle size={12} /> Please check {session.issues.length} item(s). Nothing is guessed.</p>
          {session.issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} learners={learners} onResolve={(id, index, value) => save((data) => ({ session: resolveIssue(data.session || emptySession(), id, index, value) }))} />
          ))}
        </div>
      )}

      {/* Learners */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="w-8 px-2 py-1.5 font-semibold">#</th>
              <th className="px-2 py-1.5 font-semibold">Learner</th>
              <th className="w-16 px-2 py-1.5 font-semibold">In file</th>
              <th className="w-24 px-2 py-1.5 font-semibold">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {learners.map((l, i) => {
              const a = session.assignments[i];
              const problem = a ? scoreProblem(a.value, maxScore) : '';
              const isNext = mode === 'list' && session.cursor === i;
              return (
                <tr key={i} className={isNext ? 'bg-emerald-50' : a ? 'bg-white' : ''}>
                  <td className="px-2 py-1 text-gray-400 tabular-nums">
                    {mode === 'list' ? (
                      <button type="button" title="Start reading from this learner" onClick={() => save((data) => ({ session: setCursor(data.session || emptySession(), i) }))} className={`rounded px-1 ${isNext ? 'bg-emerald-600 text-white' : 'hover:bg-gray-100'}`}>{i + 1}</button>
                    ) : i + 1}
                  </td>
                  <td className="px-2 py-1">
                    <span className="text-gray-900">{l.name}</span>
                    {a && a.heard !== 'typed' && !String(a.heard).startsWith('#') && <span className="ml-1 text-[10px] text-gray-400">heard "{a.heard}"</span>}
                    {a?.replaced !== undefined && <span className="ml-1 text-[10px] text-amber-700">was {fmt(a.replaced)}</span>}
                  </td>
                  <td className="px-2 py-1 text-gray-500 tabular-nums">{column ? fmt(l.values?.[column.key]) : ''}</td>
                  <td className="px-2 py-1">
                    <input
                      value={a ? fmt(a.value) : ''}
                      onChange={(e) => save((data) => ({ session: setScore(data.session || emptySession(), i, e.target.value) }))}
                      aria-label={`Score for ${l.name}`}
                      title={problem || undefined}
                      className={`w-full border tabular-nums ${problem ? 'border-red-500 bg-red-50 text-red-800' : 'border-gray-200'}`}
                      style={{ padding: '2px 6px', fontSize: 12, borderRadius: 4 }}
                    />
                    {problem && <span className="block text-[10px] text-red-700">{problem}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Options */}
      {(hasAbsent || hasFilled) && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3 text-[11px]">
          {hasAbsent && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-gray-700">Absent learners:</span>
              {[['blank', 'Leave the cell blank'], ['zero', 'Enter 0']].map(([key, text]) => (
                <label key={key} className="flex items-center gap-1">
                  <input type="radio" name={`absent-${art.id}`} checked={d.absentAs === key} onChange={() => save(() => ({ absentAs: key }))} /> {text}
                </label>
              ))}
            </div>
          )}
          {hasFilled && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={d.overwrite === true} onChange={(e) => save(() => ({ overwrite: e.target.checked }))} />
              Replace scores that are already in the file (otherwise they are kept)
            </label>
          )}
        </div>
      )}

      {/* Review */}
      <div className="sticky bottom-0 space-y-1.5 rounded-lg border border-gray-200 bg-white/95 p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11px] text-gray-600">{scoredCount} of {learners.length} learners have a score.</span>
          <button type="button" onClick={review} disabled={!result.ok || voice.status !== 'idle'} className="flex items-center gap-1 rounded-lg bg-[#2d6a4f] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#235841] disabled:cursor-not-allowed disabled:opacity-40">
            Review changes <ArrowRight size={12} />
          </button>
        </div>
        {!result.ok && scoredCount > 0 && <p className="text-[11px] text-red-700">{result.problems.join(' ')}</p>}
        <p className="flex items-center gap-1 text-[10.5px] text-gray-500"><ShieldCheck size={11} /> Nothing is written until you Apply. Your original file is backed up and a working copy is edited.</p>
      </div>
    </div>
  );
}
