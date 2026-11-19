import { useEffect, useMemo, useState } from 'react';
import { X, FolderOpen, Printer, ScanLine, Plus, RefreshCw, FileText, KeyRound } from 'lucide-react';
import { useDeskStore } from '../../../store/deskStore';
import { useAuth } from '../../../hooks/useAuth';
import { flattenFileTree, readFileBytes, openInDefaultApp, revealInFolder } from '../../../services/localFileSystem';
import { listTests, keyOf, STATUS_LABEL } from '../../../services/desk/bubble/tests';
import { bubbleQuizArtifact } from '../../../services/desk/bubble/quiz';
import { isClassRecordPath, classNameOfRecord } from '../../../services/desk/records/classRecords';
import { runChatTurn } from '../runChatTurn';

const btn = 'inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-300 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50';
const primary = 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-50';
const input = 'w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800';
const label = 'block text-[11px] font-semibold text-gray-700 mb-0.5';
const CHIP = {
  new: 'border-gray-200 bg-gray-50 text-gray-600',
  photos: 'border-amber-200 bg-amber-50 text-amber-800',
  checked: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  recorded: 'border-emerald-600 bg-emerald-700 text-white',
};
const COLUMN_HINTS = ['Written Work 1', 'Written Work 2', 'Written Work 3', 'Written Work 4', 'Written Work 5', 'Performance Task 1', 'Performance Task 2', 'Performance Task 3', 'Quarterly Assessment'];

/** "New test": the few details make_test needs; KaTuro writes the test in the chat. */
function NewTest({ records, onStart, busy }) {
  const [f, setF] = useState({ recordPath: records[0] || '', topic: '', items: 20, choices: 4, column: '' });
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const ready = f.recordPath && f.topic.trim() && Number(f.items) >= 1 && Number(f.items) <= 100 && f.column.trim();
  if (!records.length) {
    return <p className="text-[11px] text-gray-600">Set up a class record first (Records/Grade 7 - Rizal - Science.xlsx): ask KaTuro to set up your class with your class list.</p>;
  }
  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={label}>Class</span>
          <select value={f.recordPath} onChange={(e) => set({ recordPath: e.target.value })} className={input}>
            {records.map((p) => <option key={p} value={p}>{classNameOfRecord(p)}</option>)}
          </select>
        </label>
        <label className="sm:col-span-2"><span className={label}>Topic or lesson</span>
          <input value={f.topic} onChange={(e) => set({ topic: e.target.value })} placeholder="e.g. Mixtures and their components" className={input} />
        </label>
        <label><span className={label}>Number of items</span>
          <input type="number" min="1" max="100" value={f.items} onChange={(e) => set({ items: e.target.value })} className={input} />
        </label>
        <label><span className={label}>Choices</span>
          <select value={f.choices} onChange={(e) => set({ choices: Number(e.target.value) })} className={input}>
            <option value={4}>A to D</option>
            <option value={5}>A to E</option>
          </select>
        </label>
        <label className="sm:col-span-2"><span className={label}>Counts as (class record column)</span>
          <input list="kt-test-columns" value={f.column} onChange={(e) => set({ column: e.target.value })} placeholder="e.g. Written Work 3" className={input} />
          <datalist id="kt-test-columns">{COLUMN_HINTS.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
      </div>
      <div className="flex items-center justify-end">
        <button type="button" disabled={!ready || busy} onClick={() => onStart({ ...f, items: Number(f.items) })} className={primary}>Make the test</button>
      </div>
      <p className="text-[10.5px] text-gray-500">KaTuro writes the questions, the answer key and the bubble sheets for every learner of the class in the chat. Check the questions before printing.</p>
    </div>
  );
}

/** The Bubble quiz panel for a test: the check step when there are a key and photos. */
function checkArtifact({ test, quiz, check }) {
  const at = Date.now();
  return { id: `test-${at}`, createdAt: at, ...bubbleQuizArtifact(quiz, test.folder, keyOf(quiz, check) && test.photos ? 'check' : 'photos') };
}

/** Tests: every test (Lessons/Tests and the older Bubble Quizzes) with what is done so far. */
export default function TestsModal({ open, onClose, onOpenCanvas }) {
  const { workspace, isGenerating, refreshFiles } = useDeskStore();
  const { user, profile } = useAuth();
  const [list, setList] = useState(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const files = useMemo(() => flattenFileTree(workspace?.files || []).filter((f) => f.kind !== 'directory' && !f.path.startsWith('KaTuro Backups/')), [workspace?.files]);
  const records = useMemo(() => files.map((f) => f.path).filter(isClassRecordPath), [files]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const handle = workspace?.handle;
    const readText = async (p) => new TextDecoder().decode(await readFileBytes(handle, p));
    listTests({ paths: files.map((f) => f.path), readText })
      .then((x) => { if (alive) setList(x); })
      .catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [open, files, workspace?.handle]);

  if (!open) return null;
  const run = (fn) => {
    setNotice('');
    return fn().catch((err) => setNotice(err?.message || 'That did not work.'));
  };
  const openFile = (path) => run(() => openInDefaultApp(workspace.handle, path));

  const check = (x) => {
    setNotice('');
    const art = checkArtifact(x);
    const s = useDeskStore.getState();
    s.addArtifacts([art]);
    s.setActiveArtifact(art);
    onOpenCanvas?.();
    onClose();
  };

  const start = async (f) => {
    const name = classNameOfRecord(f.recordPath);
    onClose();
    setAdding(false);
    await runChatTurn({
      text: `Make a ${f.items}-item test for ${name} on ${f.topic.trim()}, ${f.choices} choices, counts as ${f.column.trim()}.`,
      attachments: [],
      user,
      profile,
      onOpenCanvas,
      confirmedPlan: { reply: '', tasks: [{ id: 't1', tool: 'make_test', label: `Test – ${name}`, args: { recordPath: f.recordPath, topic: f.topic.trim(), items: f.items, choices: f.choices, column: f.column.trim() } }] },
    });
  };

  return (
    <div className="fixed inset-0 z-[55] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Tests">
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-gray-200">
          <h2 className="flex-1 text-sm font-bold text-gray-900">Tests</h2>
          <button type="button" onClick={() => run(refreshFiles)} title="Refresh" aria-label="Refresh" className="p-1 rounded hover:bg-gray-200 text-gray-500"><RefreshCw size={14} /></button>
          <button type="button" onClick={() => { setNotice(''); setAdding((v) => !v); }} disabled={!workspace?.handle || isGenerating} className={primary}><Plus size={13} /> New test</button>
          <button type="button" onClick={onClose} title="Close" aria-label="Close" className="p-1 rounded hover:bg-gray-200 text-gray-500"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          {notice && <p className="text-[11px] text-red-700" role="alert">{notice}</p>}
          {adding && <NewTest records={records} busy={isGenerating} onStart={(f) => run(() => start(f))} />}
          {!workspace?.handle && <p className="text-[11px] text-gray-600">Open your KaTuro folder first.</p>}
          {workspace?.handle && list === null && <p className="text-[11px] text-gray-500">Loading…</p>}
          {list?.length === 0 && !adding && (
            <p className="text-[11px] text-gray-600">No tests yet. Click New test: KaTuro writes the questions, the answer key and bubble sheets with your learners&apos; names. Then scan the answered sheets with the KaTuro App.</p>
          )}
          {list?.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {list.map((x) => {
                const { test, quiz } = x;
                return (
                  <li key={test.path} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-900" title={test.folder}>{test.title}</p>
                      <p className="truncate text-[11px] text-gray-600">
                        {[test.className || 'No class', `${test.items} items`, test.columnLabel, test.hasKey ? 'key ✓' : 'no key yet', `${test.photos} photo${test.photos === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${CHIP[test.status]}`}>{STATUS_LABEL[test.status]}</span>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" onClick={() => run(() => revealInFolder(workspace.handle, test.path))} title="Show the test's folder" className={btn}><FolderOpen size={12} /> Folder</button>
                      {quiz.testPaper && <button type="button" onClick={() => openFile(quiz.testPaper)} title="Open the test paper" className={btn}><FileText size={12} /> Test</button>}
                      {quiz.answerKeyDoc && <button type="button" onClick={() => openFile(quiz.answerKeyDoc)} title="Open the answer key" className={btn}><KeyRound size={12} /> Key</button>}
                      <button type="button" disabled={!quiz.pdfPath} onClick={() => openFile(quiz.pdfPath)} title="Open the bubble sheets PDF to print" className={btn}><Printer size={12} /> Print</button>
                      <button type="button" onClick={() => check(x)} title="Check the photos and record the scores in the Bubble quiz panel" className={btn}><ScanLine size={12} /> Check</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
