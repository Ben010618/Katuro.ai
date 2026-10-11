import { useCallback, useState } from 'react';
import { useDeskStore } from '../../../store/deskStore';
import { openInDefaultApp, revealInFolder } from '../../../services/localFileSystem';
import { BUBBLE_PAPERS, paperCount } from '../../../services/desk/bubble/layout';
import BubbleSetup from './BubbleSetup';
import BubblePhotos from './BubblePhotos';
import BubbleCheck from './BubbleCheck';

const STEPS = [
  ['sheets', '1 Sheets'],
  ['photos', '2 Photos'],
  ['check', '3 Check and record'],
];

/** Sheets are made: open the PDF to print it. */
function PrintStep({ quiz, folder, onNext }) {
  const workspace = useDeskStore((s) => s.workspace);
  const [error, setError] = useState('');
  const sheets = quiz.learners.length + (quiz.blanks || 0);
  const pages = paperCount(sheets, quiz.perPage);
  const run = (fn) => fn().catch((err) => setError(err?.message || 'That did not work.'));
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 text-[12px]">
      <p className="font-semibold text-gray-900">The bubble sheets are ready.</p>
      <p className="text-gray-700">
        {sheets} sheet{sheets === 1 ? '' : 's'} ({quiz.learners.length} named{quiz.blanks ? `, ${quiz.blanks} blank` : ''}), {quiz.items} items, {quiz.perPage} per page: print <span className="font-semibold">{pages}</span> page{pages === 1 ? '' : 's'} on {BUBBLE_PAPERS[quiz.paper].label} paper.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-[11px] text-gray-600">
        <li>Print at actual size (100%, not "fit to page"), on {BUBBLE_PAPERS[quiz.paper].label} paper.</li>
        {quiz.perPage > 1 && <li>Cut the whole stack along the dashed lines, then put the piles together starting from the top-left one. The sheets come out in class-list order.</li>}
        <li>Learners shade one circle fully per item with a pencil or a black pen, and keep the black corner squares clean.</li>
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => run(() => openInDefaultApp(workspace?.handle, quiz.pdfPath))} className="rounded-lg bg-[#2d6a4f] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#235841]">Open the PDF to print</button>
        <button type="button" onClick={() => run(() => revealInFolder(workspace?.handle, quiz.pdfPath))} className="rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] font-medium text-gray-700 hover:bg-gray-50">Show in folder</button>
        <button type="button" onClick={onNext} className="rounded-lg border border-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50">Next: photos of the answered sheets</button>
      </div>
      <p className="text-[10.5px] text-gray-500">Saved in {folder}. Do not change the PDF or reprint it at another size: the checker reads the sheets exactly as they were made.</p>
      {error && <p className="text-[11px] text-red-700" role="alert">{error}</p>}
    </div>
  );
}

/** Canvas panel for a "bubble_quiz" artifact: make sheets, collect photos, check and record. */
export default function BubbleQuizView({ art }) {
  const updateArtifact = useDeskStore((s) => s.updateArtifact);
  const d = art.data || {};

  // Always build on the latest stored state.
  const save = useCallback((fn) => {
    const s = useDeskStore.getState();
    const cur = s.artifacts.find((a) => a.id === art.id) || (s.activeArtifact?.id === art.id ? s.activeArtifact : art);
    const data = cur.data || {};
    updateArtifact(art.id, { data: { ...data, ...fn(data) } });
  }, [art, updateArtifact]);

  const quiz = d.quiz || null;
  const step = !quiz ? 'sheets' : d.stage === 'print' ? 'sheets' : d.stage === 'check' ? 'check' : d.stage === 'photos' ? 'photos' : 'sheets';
  const go = (stage) => save(() => ({ stage }));

  return (
    <div className="w-full space-y-3 text-xs text-gray-800">
      <div className="flex gap-1.5">
        {STEPS.map(([key, text]) => (
          <button
            key={key}
            type="button"
            disabled={!quiz && key !== 'sheets'}
            onClick={() => go(key === 'sheets' ? (quiz ? 'print' : 'setup') : key)}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${step === key ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {text}
          </button>
        ))}
      </div>
      {!quiz && <BubbleSetup art={art} save={save} />}
      {quiz && step === 'sheets' && <PrintStep quiz={quiz} folder={d.folder} onNext={() => go('photos')} />}
      {quiz && step === 'photos' && <BubblePhotos art={art} quiz={quiz} folder={d.folder} onNext={() => go('check')} />}
      {quiz && step === 'check' && <BubbleCheck art={art} quiz={quiz} folder={d.folder} save={save} />}
    </div>
  );
}
