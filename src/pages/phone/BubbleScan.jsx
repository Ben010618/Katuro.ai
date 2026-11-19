import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Images, Loader2, ScanLine } from 'lucide-react';
import BubbleLiveScan from './BubbleLiveScan';
import { BubbleRows, Card, KeyTyping } from './ScoreParts';
import { layoutOf, sheetFromRead, reviewSheets, finalScores } from '../../services/desk/bubble/quiz';

/**
 * Bubble sheets on the phone: choose a bubble quiz KaTuroDesk made, scan the answered sheets
 * with the live camera (or take photos), and the phone checks them (same reader as KaTuroDesk, no internet).
 * Unclear marks, unknown sheets and repeated photos are settled here. The scores then fill
 * the score list (matched by LRN) for the usual review before recording.
 */
export default function BubbleScan({ client, cls, onScores }) {
  const [quizzes, setQuizzes] = useState(null);
  const [error, setError] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [key, setKey] = useState(null);
  const [keyText, setKeyText] = useState('');
  const [sheets, setSheets] = useState({});
  const [decisions, setDecisions] = useState({});
  const [reading, setReading] = useState('');
  const count = useRef(0); // photos read so far: every photo gets its own number, batch after batch
  const [live, setLive] = useState(null); // null | 'sheets' | 'key': the live camera scanner

  useEffect(() => {
    let alive = true;
    client.request('quizzes').then((r) => alive && setQuizzes(r.quizzes)).catch((err) => alive && setError(err.message));
    return () => { alive = false; };
  }, [client]);

  const pick = async (q) => {
    setError('');
    try {
      const r = await client.request('quiz', { path: q.path });
      setQuiz(r.quiz);
      setKey(r.answerKey);
      setSheets({});
      setDecisions({});
    } catch (err) {
      setError(err.message);
    }
  };

  const addPhotos = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length || !quiz) return;
    const [{ readSheet }, { photoToGray }, { parseSheetCode }] = await Promise.all([
      import('../../services/desk/bubble/reader'),
      import('../../services/desk/bubble/photoDecode'),
      import('../../services/desk/bubble/layout'),
    ]);
    const layout = layoutOf(quiz);
    const accept = (code) => parseSheetCode(code)?.setId === quiz.setId;
    if (reading) return;
    for (let i = 0; i < files.length; i++) {
      setReading(`Reading photo ${i + 1} of ${files.length}…`);
      await new Promise((r) => setTimeout(r, 0));
      count.current += 1;
      const id = `Photo ${String(count.current).padStart(3, '0')}`;
      let found;
      try {
        const image = await photoToGray(new Uint8Array(await files[i].arrayBuffer()), files[i].name);
        found = sheetFromRead(quiz, readSheet(image, layout, { accept }));
      } catch {
        found = { ok: false, error: 'unreadable' };
      }
      setSheets((s) => ({ ...s, [id]: found }));
    }
    setReading('');
  };

  const review = useMemo(() => (quiz ? reviewSheets(quiz, key, sheets, decisions) : null), [quiz, key, sheets, decisions]);
  const decide = (photo, change) => setDecisions((d) => ({ ...d, [photo]: { ...(d[photo] || {}), ...change, answers: { ...(d[photo]?.answers || {}), ...(change.answers || {}) } } }));

  if (error && !quiz) return <div className="p-3"><Card><p className="text-sm text-red-700">{error}</p></Card></div>;
  if (!quiz) {
    return (
      <div className="p-3 space-y-2">
        <p className="px-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Choose the bubble quiz</p>
        {!quizzes && <p className="flex items-center gap-2 px-1 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> Looking for bubble quizzes…</p>}
        {quizzes && !quizzes.length && <Card><p className="text-sm text-gray-700">No bubble quiz yet. On KaTuroDesk, ask: &ldquo;Make bubble sheets for Grade 7 Rizal&rdquo; and print them first.</p></Card>}
        {quizzes?.map((q) => (
          <button key={q.path} type="button" onClick={() => pick(q)} className="w-full rounded-xl bg-white px-4 py-3 text-left shadow-sm">
            <span className="block text-sm font-bold text-gray-900">{q.title}{q.section ? ` · ${q.section}` : ''}</span>
            <span className="block text-xs text-gray-500">{q.items} items · {q.learners} learners{q.hasKey ? ' · answer key saved' : ''}</span>
          </button>
        ))}
      </div>
    );
  }

  if (!key) {
    return (
      <div className="p-3 space-y-3">
        <Card className="space-y-2">
          <p className="text-sm font-bold text-gray-900">{quiz.title}: answer key</p>
          <button type="button" onClick={() => setLive('key')} className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 py-3 text-sm font-semibold text-emerald-800">
            <ScanLine size={18} /> Scan a sheet shaded as the key
          </button>
          <p className="text-xs text-gray-500">Or type it:</p>
          <KeyTyping quiz={quiz} value={keyText} onChange={setKeyText} onKey={(k) => { setError(''); setKey(k); }} />
        </Card>
        {live === 'key' && (
          <BubbleLiveScan
            quiz={quiz}
            mode="key"
            onKey={(k) => { setKeyText(k.join('')); setError(''); setLive(null); }}
            onClose={() => setLive(null)}
          />
        )}
      </div>
    );
  }

  const inClass = new Set(cls.learners.map((l) => l.lrn));
  const ready = review && review.rows.length > 0 && review.open === 0;
  const scored = ready ? finalScores(quiz, review).filter((s) => s.score !== null) : [];
  const notInClass = scored.filter((s) => !inClass.has(s.lrn));

  return (
    <div className="p-3 space-y-3 pb-28">
      <Card className="space-y-2">
        <p className="text-sm font-bold text-gray-900">{quiz.title} · {quiz.items} items</p>
        <button type="button" onClick={() => setLive('sheets')} disabled={Boolean(reading)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3.5 text-base font-bold text-white disabled:opacity-50">
          <ScanLine size={20} /> Scan sheets
        </button>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 py-3 text-sm font-semibold text-emerald-800">
            <Camera size={18} /> Take a photo
            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={Boolean(reading)} onChange={addPhotos} />
          </label>
          <label className="flex items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 py-3 text-sm font-semibold text-emerald-800">
            <Images size={18} /> From gallery
            <input type="file" accept="image/*" multiple className="hidden" disabled={Boolean(reading)} onChange={addPhotos} />
          </label>
        </div>
        <p className="text-[11px] text-gray-500">Scan sheets reads one sheet after another by itself: hold the phone over each sheet, all four black corner squares in view, on a plain light surface. It beeps when a sheet is read.</p>
        {reading && <p className="flex items-center gap-2 text-sm text-gray-700"><Loader2 size={16} className="animate-spin" /> {reading}</p>}
      </Card>

      {review && <BubbleRows quiz={quiz} review={review} onDecide={decide} />}

      {review && review.rows.length > 0 && (
        <div className="kt-covers-nav fixed inset-x-0 bottom-0 z-30 bg-white border-t border-gray-200 p-3 space-y-1" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          {review.open > 0 && <p className="text-xs text-amber-800">{review.open} thing{review.open > 1 ? 's' : ''} to settle above.</p>}
          {ready && notInClass.length > 0 && <p className="text-xs text-amber-800">{notInClass.length} sheet(s) are for learners not in {cls.name}; they are left out.</p>}
          <button
            type="button"
            disabled={!ready}
            onClick={() => onScores({ items: quiz.items, scores: scored.filter((s) => inClass.has(s.lrn)).map((s) => ({ lrn: s.lrn, score: s.score })) })}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3.5 font-bold text-white disabled:opacity-50"
          >
            <CheckCircle2 size={18} /> Use {scored.length - notInClass.length} score{scored.length - notInClass.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
      {live === 'sheets' && (
        <BubbleLiveScan
          quiz={quiz}
          answerKey={key}
          taken={Object.entries(sheets).filter(([photo, x]) => x.ok && x.number && !decisions[photo]?.skip).map(([, x]) => x.number)}
          onSheet={(sheet) => {
            count.current += 1;
            const id = `Scan ${String(count.current).padStart(3, '0')}`;
            setSheets((all) => ({ ...all, [id]: sheet }));
          }}
          onClose={() => setLive(null)}
        />
      )}
    </div>
  );
}
