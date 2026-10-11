import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useDeskStore } from '../../../store/deskStore';
import { writeFileToDirectory, fileExists } from '../../../services/localFileSystem';
import { BUBBLE_PAPERS, PER_PAGE, capacities, paperCount } from '../../../services/desk/bubble/layout';
import { newQuiz, quizFolder, QUIZ_FILE, PHOTOS_DIR } from '../../../services/desk/bubble/quiz';

const label = 'text-[10.5px] font-semibold uppercase tracking-wide text-gray-500';
const box = { padding: '4px 6px', fontSize: 12, borderRadius: 6 };
const seg = (on) => `rounded-md border px-2.5 py-1 text-[11px] font-medium ${on ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'} disabled:cursor-not-allowed disabled:opacity-40`;

/** Folder for a new quiz; a second quiz with the same title and section gets "(2)", "(3)"… */
async function freeFolder(handle, base) {
  for (let i = 1; i < 100; i += 1) {
    const folder = i === 1 ? base : `${base} (${i})`;
    if (!(await fileExists(handle, `${folder}/${QUIZ_FILE}`))) return folder;
  }
  return `${base} (${Date.now()})`;
}

/** Step 1: check the learners, choose the settings, make the sheets (PDF + quiz file). */
export default function BubbleSetup({ art, save }) {
  const { workspace, refreshFiles } = useDeskStore();
  const d = art.data || {};
  const s = d.setup || {};
  const learners = useMemo(() => d.learners || [], [d.learners]);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState([]);
  const caps = capacities(s.paper, Number(s.choices));
  const chosen = learners.filter((l) => l.include !== false).length;
  const sheets = chosen + (Number(s.blanks) || 0);
  const set = (patch) => save((data) => ({ setup: { ...(data.setup || {}), ...patch } }));
  const setLearner = (i, patch) => save((data) => ({ learners: (data.learners || []).map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const make = async () => {
    setProblems([]);
    if (!workspace?.handle) {
      setProblems(['Open your classroom folder first.']);
      return;
    }
    const res = newQuiz({ ...s, learners, listPath: d.listPath });
    if (!res.ok) {
      setProblems(res.problems);
      return;
    }
    setBusy(true);
    try {
      const { buildBubbleSheetsPdf } = await import('../../../services/desk/bubble/sheetPdf');
      const quiz = res.quiz;
      const folder = await freeFolder(workspace.handle, quizFolder(quiz));
      const pdfPath = `${folder}/${quiz.title.replace(/[\\/:*?"<>|]+/g, '-')} - Bubble Sheets.pdf`;
      const pdf = await buildBubbleSheetsPdf(quiz);
      await writeFileToDirectory(workspace.handle, pdfPath, pdf, 'application/pdf');
      const saved = { ...quiz, pdfPath };
      await writeFileToDirectory(workspace.handle, `${folder}/${QUIZ_FILE}`, JSON.stringify(saved, null, 2), 'application/json');
      await writeFileToDirectory(workspace.handle, `${folder}/${PHOTOS_DIR}/About this folder.txt`, 'Photos of the answered bubble sheets go here (from the phone, or copied in). KaTuroDesk checks them from this folder.\r\n', 'text/plain');
      await refreshFiles();
      save(() => ({ stage: 'print', quiz: saved, folder }));
    } catch (err) {
      setProblems([err?.message || 'The sheets could not be made.']);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className={label}>Quiz title</span>
          <input value={s.title || ''} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Science Quiz 3" className="w-full border border-gray-300" style={box} />
        </label>
        <label className="space-y-1">
          <span className={label}>Section (optional)</span>
          <input value={s.section || ''} onChange={(e) => set({ section: e.target.value })} placeholder="e.g. Grade 7 - Rizal" className="w-full border border-gray-300" style={box} />
        </label>
        <label className="space-y-1">
          <span className={label}>Number of items</span>
          <input type="number" min="1" max="100" value={s.items ?? ''} onChange={(e) => set({ items: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="1 to 100" className="w-full border border-gray-300" style={box} />
        </label>
        <div className="space-y-1">
          <span className={label}>Choices</span>
          <div className="flex gap-1.5">
            {[[4, 'A to D'], [5, 'A to E']].map(([k, t]) => <button key={k} type="button" onClick={() => set({ choices: k })} className={seg(Number(s.choices) === k)}>{t}</button>)}
          </div>
        </div>
        <label className="space-y-1">
          <span className={label}>Paper</span>
          <select value={s.paper || 'a4'} onChange={(e) => set({ paper: e.target.value })} className="w-full border border-gray-300 bg-white" style={box}>
            {Object.entries(BUBBLE_PAPERS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className={label}>Extra blank sheets</span>
          <input type="number" min="0" max="200" value={s.blanks ?? 0} onChange={(e) => set({ blanks: Math.max(0, Number(e.target.value) || 0) })} className="w-full border border-gray-300" style={box} />
        </label>
        <div className="space-y-1 sm:col-span-2">
          <span className={label}>Sheets on one page</span>
          <div className="flex flex-wrap gap-1.5">
            {PER_PAGE.map((k) => (
              <button key={k} type="button" onClick={() => set({ perPage: k })} disabled={Number(s.items) > caps[k]} title={Number(s.items) > caps[k] ? `Holds up to ${caps[k]} items` : undefined} className={seg(Number(s.perPage) === k)}>
                {k} per page <span className="font-normal text-gray-500">(up to {caps[k]} items)</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-600">
            {sheets} sheet{sheets === 1 ? '' : 's'} on <span className="font-semibold">{paperCount(sheets, Number(s.perPage) || 1)}</span> sheet{paperCount(sheets, Number(s.perPage) || 1) === 1 ? '' : 's'} of {BUBBLE_PAPERS[s.paper]?.label || 'paper'}.
            {Number(s.perPage) > 1 && ' Printed in cut-and-stack order: cut the whole stack at once, put the piles together, and the sheets follow your class list.'}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-2 py-1.5 text-[11px]">
          <span className="flex-1 font-semibold text-gray-700">{chosen} of {learners.length} learners get a named sheet</span>
          <button type="button" onClick={() => save((data) => ({ learners: (data.learners || []).map((l) => ({ ...l, include: true })) }))} className="rounded px-1.5 py-0.5 text-gray-600 hover:bg-gray-100">All</button>
          <button type="button" onClick={() => save((data) => ({ learners: (data.learners || []).map((l) => ({ ...l, include: false })) }))} className="rounded px-1.5 py-0.5 text-gray-600 hover:bg-gray-100">None</button>
        </div>
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="w-8 px-2 py-1.5" />
              <th className="px-2 py-1.5 font-semibold">Learner (as printed)</th>
              <th className="w-36 px-2 py-1.5 font-semibold">LRN</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {learners.map((l, i) => {
              const badLrn = l.lrn && !/^\d{12}$/.test(String(l.lrn).replace(/\s/g, ''));
              return (
                <tr key={i} className={l.include === false ? 'opacity-50' : ''}>
                  <td className="px-2 py-1"><input type="checkbox" checked={l.include !== false} onChange={(e) => setLearner(i, { include: e.target.checked })} aria-label={`Include ${l.name}`} /></td>
                  <td className="px-2 py-1"><input value={l.name} onChange={(e) => setLearner(i, { name: e.target.value })} className="w-full border border-gray-200" style={{ ...box, padding: '2px 6px' }} /></td>
                  <td className="px-2 py-1">
                    <input value={l.lrn || ''} onChange={(e) => setLearner(i, { lrn: e.target.value })} className={`w-full border tabular-nums ${badLrn ? 'border-red-500 bg-red-50' : 'border-gray-200'}`} style={{ ...box, padding: '2px 6px' }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 space-y-1.5 rounded-lg border border-gray-200 bg-white/95 p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11px] text-gray-600">Names and LRNs are printed exactly as shown. Fix any spelling first.</span>
          <button type="button" onClick={make} disabled={busy} className="rounded-lg bg-[#2d6a4f] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#235841] disabled:opacity-40">
            {busy ? 'Making the sheets…' : 'Make bubble sheets'}
          </button>
        </div>
        {problems.length > 0 && <p className="text-[11px] text-red-700" role="alert">{problems.join(' ')}</p>}
        <p className="flex items-center gap-1 text-[10.5px] text-gray-500"><ShieldCheck size={11} /> Saved in a new folder under Bubble Quizzes. Your class list is not changed.</p>
      </div>
    </div>
  );
}
