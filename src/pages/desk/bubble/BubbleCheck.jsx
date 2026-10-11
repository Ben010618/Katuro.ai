import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { useDeskStore } from '../../../store/deskStore';
import { useAuth } from '../../../hooks/useAuth';
import { flattenFileTree, readFileBytes, writeFileToDirectory, openInDefaultApp, fileExists, BACKUPS_ROOT } from '../../../services/localFileSystem';
import { CHOICE_SETS } from '../../../services/desk/bubble/layout';
import { CHECK_FILE, QUIZ_FILE, PHOTOS_DIR, PHOTO_FILE, QUIZ_ROOT, layoutOf, readKey, sheetFromRead, reviewSheets, finalScores, resultsSpec } from '../../../services/desk/bubble/quiz';
import { runChatTurn } from '../runChatTurn';

const label = 'text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
const btn = 'rounded-lg px-3 py-1.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-40';
const small = 'rounded border px-1.5 py-0.5 text-[11px]';
const RECORD_FILE = /\.(xlsx|xlsm|docx)$/i;
const emptyCheck = () => ({ answerKey: null, keyText: '', sheets: {}, decisions: {} });

/** Step 3: read the photos (no AI, no internet), settle what is unclear, save and record. */
export default function BubbleCheck({ quiz, folder }) {
  const { workspace, refreshFiles } = useDeskStore();
  const { user, profile } = useAuth();
  const [check, setCheck] = useState(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyError, setKeyError] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [target, setTarget] = useState('');
  const [recording, setRecording] = useState(false);
  const stopRef = useRef(false);
  const checkRef = useRef(null); // the latest check, so saves never undo a newer decision
  const checkPath = `${folder}/${CHECK_FILE}`;
  const photosDir = `${folder}/${PHOTOS_DIR}/`;
  const layout = useMemo(() => layoutOf(quiz), [quiz]);
  const letters = CHOICE_SETS[quiz.choices];

  const tree = workspace?.files;
  const files = useMemo(() => flattenFileTree(tree || []), [tree]);
  const photos = useMemo(() => files.filter((f) => f.path.startsWith(photosDir) && PHOTO_FILE.test(f.name)), [files, photosDir]);
  const recordTargets = useMemo(
    () => files.filter((f) => RECORD_FILE.test(f.name) && !f.name.startsWith('~$') && !f.path.startsWith(`${QUIZ_ROOT}/`) && !f.path.startsWith(`${BACKUPS_ROOT}/`)).map((f) => f.path),
    [files],
  );

  // The saved check (what was read, the teacher's decisions) is the record of truth.
  useEffect(() => {
    let alive = true;
    (async () => {
      let saved = emptyCheck();
      try {
        if (await fileExists(workspace?.handle, checkPath)) {
          const parsed = JSON.parse(new TextDecoder().decode(await readFileBytes(workspace.handle, checkPath)));
          if (parsed && typeof parsed === 'object') saved = { ...emptyCheck(), ...parsed };
        }
      } catch {
        saved = emptyCheck();
      }
      if (alive) {
        checkRef.current = saved;
        setCheck(saved);
        setKeyDraft(saved.keyText || '');
      }
    })();
    return () => { alive = false; };
  }, [workspace?.handle, checkPath]);

  const persist = async (fn) => {
    const next = fn(checkRef.current || emptyCheck());
    checkRef.current = next;
    setCheck(next);
    await writeFileToDirectory(workspace.handle, checkPath, JSON.stringify(next, null, 2), 'application/json');
  };

  const present = useMemo(() => new Set(photos.map((p) => p.path)), [photos]);
  const sheets = useMemo(() => Object.fromEntries(Object.entries(check?.sheets || {}).filter(([p]) => present.has(p))), [check, present]);
  const unread = photos.filter((p) => !check?.sheets?.[p.path]);
  const review = useMemo(() => reviewSheets(quiz, check?.answerKey || null, sheets, check?.decisions || {}), [quiz, check, sheets]);
  const scores = check?.answerKey ? finalScores(quiz, review) : null;

  const useKey = async () => {
    const res = readKey(keyDraft, quiz);
    if (res.error) {
      setKeyError(res.error);
      return;
    }
    setKeyError('');
    await persist((c) => ({ ...c, answerKey: res.key, keyText: keyDraft })).catch((err) => setKeyError(err?.message || 'The key could not be saved.'));
  };

  const readPhotos = () => readAll().catch((err) => {
    setProgress('');
    setError(err?.message || 'The photos could not be checked.');
  });
  const readAll = async () => {
    setError('');
    stopRef.current = false;
    const { readSheet } = await import('../../../services/desk/bubble/reader');
    const { photoToGray } = await import('../../../services/desk/bubble/photoDecode');
    const { parseSheetCode } = await import('../../../services/desk/bubble/layout');
    const accept = (code) => parseSheetCode(code)?.setId === quiz.setId;
    let found = {};
    const todo = unread;
    const flush = async () => {
      const add = found;
      found = {};
      await persist((c) => ({ ...c, sheets: { ...c.sheets, ...add } }));
    };
    for (let i = 0; i < todo.length; i += 1) {
      if (stopRef.current) break;
      setProgress(`Reading photo ${i + 1} of ${todo.length}…`);
      await new Promise((r) => setTimeout(r, 0)); // let the screen update between photos
      try {
        const image = await photoToGray(await readFileBytes(workspace.handle, todo[i]), todo[i].name);
        found[todo[i].path] = sheetFromRead(quiz, readSheet(image, layout, { accept }));
      } catch {
        found[todo[i].path] = { ok: false, error: 'unreadable' };
      }
      if ((i + 1) % 5 === 0) await flush();
    }
    await flush();
    setProgress('');
  };

  const decide = (photo, patch) => persist((c) => ({
    ...c,
    decisions: { ...c.decisions, [photo]: { ...(c.decisions[photo] || {}), ...patch, ...(patch.answers ? { answers: { ...(c.decisions[photo]?.answers || {}), ...patch.answers } } : {}) } },
  })).catch((err) => setError(err?.message || 'Your choice could not be saved.'));
  const undoSkip = (photo) => persist((c) => {
    const d = { ...(c.decisions[photo] || {}) };
    delete d.skip;
    return { ...c, decisions: { ...c.decisions, [photo]: d } };
  }).catch((err) => setError(err?.message || 'That could not be saved.'));

  const saveResults = async () => {
    setError('');
    try {
      const { buildSheetWorkbook } = await import('../../../services/desk/generators/xlsxWriters');
      const bytes = await buildSheetWorkbook(resultsSpec(quiz, check.answerKey, review));
      const res = await writeFileToDirectory(workspace.handle, `${folder}/${quiz.title.replace(/[\\/:*?"<>|]+/g, '-')} - Results.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { overwrite: false });
      await refreshFiles();
      setNote(`Saved ${res.path.split('/').pop()} in the quiz folder.`);
    } catch (err) {
      setError(err?.message || 'The results could not be saved.');
    }
  };

  const record = async () => {
    if (!target) return;
    setRecording(true);
    setError('');
    try {
      await runChatTurn({
        text: `Record the ${quiz.title} scores into ${target.split('/').pop()}`,
        attachments: [],
        user,
        profile,
        confirmedPlan: { reply: '', tasks: [{ id: 't1', tool: 'record_quiz_scores', label: `Record ${quiz.title}`, args: { quizPath: `${folder}/${QUIZ_FILE}`, targetPath: target } }] },
      });
    } catch (err) {
      setError(err?.message || 'The scores could not be prepared for recording.');
    } finally {
      setRecording(false);
    }
  };

  if (!check) return <p className="text-[11px] text-gray-500">Loading…</p>;
  const issueRows = review.rows.filter((r) => r.issues.length);
  const skipped = review.rows.filter((r) => r.skipped);
  const learnerName = (n) => quiz.learners.find((l) => l.n === n)?.name || '';

  return (
    <div className="space-y-3">
      {/* Answer key */}
      <div className="space-y-1.5 rounded-lg border border-gray-200 bg-white p-3">
        <span className={label}>Answer key ({quiz.items} items, {letters[0]} to {letters[letters.length - 1]})</span>
        <textarea value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} rows={2} placeholder={'e.g. 1. A 2. C 3. B …   or   ACBDA…'} className="w-full border border-gray-300 font-mono" style={{ padding: '4px 6px', fontSize: 12, borderRadius: 6 }} />
        <div className="flex items-center gap-2">
          <button type="button" onClick={useKey} disabled={!keyDraft.trim() || keyDraft === check.keyText} className={`${btn} bg-[#2d6a4f] text-white hover:bg-[#235841]`}>Use this key</button>
          {check.answerKey && <span className="text-[11px] text-emerald-800">Key set: {check.answerKey.join('')}</span>}
        </div>
        {keyError && <p className="text-[11px] text-red-700" role="alert">{keyError}</p>}
      </div>

      {/* Photos */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
        <p className="flex-1 text-[12px] text-gray-800">
          {photos.length} photo{photos.length === 1 ? '' : 's'}: {photos.length - unread.length} read{unread.length ? `, ${unread.length} new` : ''}.
          {review.missing.length > 0 && Object.keys(sheets).length > 0 && <span className="text-gray-500"> No sheet yet for {review.missing.length} learner{review.missing.length === 1 ? '' : 's'}.</span>}
        </p>
        {progress ? (
          <>
            <span className="text-[11px] text-gray-600">{progress}</span>
            <button type="button" onClick={() => { stopRef.current = true; }} className={`${small} border-gray-300 text-gray-700`}>Stop</button>
          </>
        ) : (
          <button type="button" onClick={readPhotos} disabled={!unread.length || !workspace?.handle} className={`${btn} border border-emerald-600 text-emerald-800 hover:bg-emerald-50`}>Check {unread.length || ''} new photo{unread.length === 1 ? '' : 's'}</button>
        )}
      </div>

      {/* Needs the teacher */}
      {issueRows.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-900"><AlertTriangle size={12} /> {review.open} thing{review.open === 1 ? '' : 's'} to check. Nothing is guessed.</p>
          {issueRows.map((r) => (
            <div key={r.photo} className="space-y-1 rounded-md border border-amber-200 bg-white px-2 py-1.5 text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-gray-900">{r.photo.split('/').pop()}</span>
                {r.learner && <span className="text-gray-600">{learnerName(r.learner)}</span>}
                <span className="flex-1" />
                <button type="button" onClick={() => openInDefaultApp(workspace?.handle, r.photo).catch(() => {})} className={`${small} border-gray-300 text-gray-700 hover:bg-gray-50`}>Open photo</button>
                <button type="button" onClick={() => decide(r.photo, { skip: true })} className={`${small} border-gray-300 text-gray-700 hover:bg-gray-50`}>Skip this photo</button>
              </div>
              {r.issues.map((issue) => (
                <div key={`${issue.kind}-${issue.item || ''}`} className="flex flex-wrap items-center gap-1.5 text-amber-950">
                  {issue.kind === 'item' ? (
                    <>
                      <span>Item {issue.item} ({issue.note}): which answer counts?</span>
                      {letters.map((L) => <button key={L} type="button" onClick={() => decide(r.photo, { answers: { [issue.item]: L } })} className={`${small} border-gray-300 bg-white font-semibold hover:bg-emerald-50`}>{L}</button>)}
                      <button type="button" onClick={() => decide(r.photo, { answers: { [issue.item]: '' } })} className={`${small} border-gray-300 bg-white hover:bg-gray-50`}>No answer</button>
                    </>
                  ) : issue.kind === 'learner' || issue.kind === 'duplicate' ? (
                    <>
                      <span>{issue.note}</span>
                      <select defaultValue="" onChange={(e) => e.target.value && decide(r.photo, { learner: Number(e.target.value) })} className="border border-gray-300 bg-white" style={{ padding: '2px 24px 2px 6px', fontSize: 11, borderRadius: 4, maxWidth: 220 }}>
                        <option value="">Choose learner…</option>
                        {quiz.learners.map((l) => <option key={l.n} value={l.n}>{l.n}. {l.name}</option>)}
                      </select>
                    </>
                  ) : (
                    <span>{issue.note}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Scores */}
      {review.rows.some((r) => !r.skipped) && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="w-8 px-2 py-1.5 font-semibold">No.</th>
                <th className="px-2 py-1.5 font-semibold">Learner</th>
                <th className="w-20 px-2 py-1.5 font-semibold">Score</th>
                <th className="px-2 py-1.5 font-semibold">Photo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quiz.learners.map((l) => {
                const r = review.byLearner.get(l.n);
                return (
                  <tr key={l.n}>
                    <td className="px-2 py-1 tabular-nums text-gray-400">{l.n}</td>
                    <td className="px-2 py-1 text-gray-900">{l.name}</td>
                    <td className="px-2 py-1 tabular-nums">{r ? (Number.isFinite(r.score) ? `${r.score} / ${quiz.items}` : <span className="text-amber-700">to check</span>) : <span className="text-gray-400">no sheet</span>}</td>
                    <td className="px-2 py-1 text-gray-500">{r ? r.photo.split('/').pop() : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {skipped.length > 0 && (
        <p className="text-[11px] text-gray-500">
          Skipped: {skipped.map((r) => (
            <button key={r.photo} type="button" onClick={() => undoSkip(r.photo)} className="mr-1 underline hover:text-gray-800" title="Use this photo again">{r.photo.split('/').pop()}</button>
          ))}
        </p>
      )}

      {/* Save and record */}
      <div className="sticky bottom-0 space-y-2 rounded-lg border border-gray-200 bg-white/95 p-3 shadow-sm">
        {!check.answerKey ? (
          <p className="text-[11px] text-gray-600">Enter the answer key to see the scores.</p>
        ) : !scores ? (
          <p className="text-[11px] text-gray-600">Settle the {review.open} thing{review.open === 1 ? '' : 's'} above to finish the scores.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 text-[11px] text-gray-700">{scores.filter((s) => s.score !== null).length} of {quiz.learners.length} learners scored.</span>
              <button type="button" onClick={saveResults} className={`${btn} border border-emerald-600 text-emerald-800 hover:bg-emerald-50`}>Save results (Excel)</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="min-w-0 flex-1 border border-gray-300 bg-white" style={{ padding: '4px 6px', fontSize: 12, borderRadius: 6 }}>
                <option value="">Record into which class record?</option>
                {recordTargets.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button type="button" onClick={record} disabled={!target || recording} className={`${btn} bg-[#2d6a4f] text-white hover:bg-[#235841]`}>{recording ? 'Preparing…' : 'Record scores'}</button>
            </div>
            <p className="text-[10.5px] text-gray-500">Learners are matched by LRN, then by name. You choose the column and review every change before anything is written.</p>
          </>
        )}
        {note && <p className="text-[11px] text-emerald-800">{note}</p>}
        {error && <p className="text-[11px] text-red-700" role="alert">{error}</p>}
        <p className="flex items-center gap-1 text-[10.5px] text-gray-500"><ShieldCheck size={11} /> Checked on this computer by code. No AI and no internet.</p>
      </div>
    </div>
  );
}
