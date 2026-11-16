import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, Images, Loader2, Trash2 } from 'lucide-react';
import { CHOICE_SETS } from '../../services/desk/bubble/layout';
import { layoutOf, readKey, sheetFromRead, reviewSheets, finalScores } from '../../services/desk/bubble/quiz';

const Card = ({ children, className = '' }) => <div className={`rounded-xl bg-white p-4 shadow-sm ${className}`}>{children}</div>;

/**
 * Bubble sheets on the phone: choose a bubble quiz KaTuroDesk made, take photos of the
 * answered sheets, and the phone checks them (same reader as KaTuroDesk, no internet).
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
  const [count, setCount] = useState(0);

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
    let n = count;
    for (let i = 0; i < files.length; i++) {
      setReading(`Reading photo ${i + 1} of ${files.length}…`);
      await new Promise((r) => setTimeout(r, 0));
      n += 1;
      const id = `Photo ${String(n).padStart(3, '0')}`;
      let found;
      try {
        const image = await photoToGray(new Uint8Array(await files[i].arrayBuffer()), files[i].name);
        found = sheetFromRead(quiz, readSheet(image, layout, { accept }));
      } catch {
        found = { ok: false, error: 'unreadable' };
      }
      setSheets((s) => ({ ...s, [id]: found }));
    }
    setCount(n);
    setReading('');
  };

  const review = useMemo(() => (quiz ? reviewSheets(quiz, key, sheets, decisions) : null), [quiz, key, sheets, decisions]);
  const decide = (photo, change) => setDecisions((d) => ({ ...d, [photo]: { ...(d[photo] || {}), ...change, answers: { ...(d[photo]?.answers || {}), ...(change.answers || {}) } } }));
  const learnerName = (n) => quiz?.learners.find((l) => l.n === n)?.name || '';

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
          <p className="text-xs text-gray-600">Type the {quiz.items} correct answers in order ({CHOICE_SETS[quiz.choices].join(', ')}), e.g. ABCDA… Spaces and numbers are fine.</p>
          <textarea value={keyText} onChange={(e) => setKeyText(e.target.value.toUpperCase())} rows={3} className="w-full rounded-lg border border-gray-300 p-2 font-mono text-base" />
          <button
            type="button"
            onClick={() => {
              const r = readKey(keyText, quiz);
              if (r.error) setError(r.error);
              else { setError(''); setKey(r.key); }
            }}
            className="w-full rounded-xl bg-emerald-700 py-3 font-bold text-white"
          >Use this key</button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </Card>
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
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center justify-center gap-2 rounded-lg bg-emerald-700 py-3 text-sm font-semibold text-white">
            <Camera size={18} /> Take a photo
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={addPhotos} />
          </label>
          <label className="flex items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 py-3 text-sm font-semibold text-emerald-800">
            <Images size={18} /> From gallery
            <input type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} />
          </label>
        </div>
        <p className="text-[11px] text-gray-500">One sheet per photo, the whole sheet with its four black corner squares in view, on a plain light surface.</p>
        {reading && <p className="flex items-center gap-2 text-sm text-gray-700"><Loader2 size={16} className="animate-spin" /> {reading}</p>}
      </Card>

      {review?.rows.map((r) => (
        <Card key={r.photo} className={r.issues.length ? 'border border-amber-200' : ''}>
          <div className="flex items-center gap-2">
            {r.skipped ? <span className="text-sm text-gray-400 flex-1">{r.photo}: left out</span> : (
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-gray-900 truncate">{r.learner ? learnerName(r.learner) : r.photo}</span>
                {Number.isFinite(r.score) && <span className="block text-xs text-emerald-800">{r.score} / {quiz.items}</span>}
              </span>
            )}
            {!r.skipped && <button type="button" onClick={() => decide(r.photo, { skip: true })} aria-label={`Leave out ${r.photo}`} className="p-1.5 text-gray-400"><Trash2 size={16} /></button>}
          </div>
          {r.issues.map((iss) => (
            <div key={`${iss.kind}-${iss.item || ''}`} className="mt-2 text-sm text-amber-900">
              {iss.kind === 'item' ? (
                <div>
                  <p>Item {iss.item}: {iss.note}. Choose the answer:</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[...CHOICE_SETS[quiz.choices], ''].map((letter) => (
                      <button key={letter || 'blank'} type="button" onClick={() => decide(r.photo, { answers: { [iss.item]: letter } })} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold">{letter || 'No answer'}</button>
                    ))}
                  </div>
                </div>
              ) : iss.kind === 'learner' ? (
                <div>
                  <p>{iss.note}</p>
                  <select aria-label="Learner" defaultValue="" onChange={(e) => decide(r.photo, { learner: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-amber-300 bg-white p-2">
                    <option value="" disabled>Choose the learner</option>
                    {quiz.learners.map((l) => <option key={l.n} value={l.n}>{l.name}</option>)}
                  </select>
                </div>
              ) : <p>{iss.note}</p>}
            </div>
          ))}
        </Card>
      ))}

      {review && review.rows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 bg-white border-t border-gray-200 p-3 space-y-1" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
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
    </div>
  );
}
