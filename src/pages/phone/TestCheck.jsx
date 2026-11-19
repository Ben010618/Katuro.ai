import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, ClipboardCheck, CloudOff, FileQuestion, Keyboard, Loader2, RefreshCw, ScanLine, Trash2, Undo2, X } from 'lucide-react';
import BubbleLiveScan from './BubbleLiveScan';
import TestRecord from './TestRecord';
import { BubbleRows, KeyTyping } from './ScoreParts';
import { reviewSheets } from '../../services/desk/bubble/quiz';
import { sendFiles } from '../../services/link/phoneFiles';
import {
  CHECK_BATCH, PAPERS_FOLDER, UPDATE_DESK, bubbleScored, cacheTests, cachedTests, inBatches, isOffline, isOldDesk, keyChoices,
  matchTestByCode, mergeRows, newestFirst, photoScored, photosFolder, photosToRecheck, reviewPhotoRows, testChip, testFromQuiz, testLine,
} from '../../services/link/phoneTests';

// checkPhotos reads the papers with the AI on KaTuroDesk, which stops at about 4 minutes:
// the phone waits a little longer, so KaTuroDesk's own answer arrives first.
const CHECK_MS = 5 * 60000;

// ── talking to KaTuroDesk (Tests, with the older quiz requests as a fallback) ──

/** → { tests, online, old?, error? } */
async function loadTests(client) {
  try {
    const r = await client.request('tests');
    const tests = newestFirst(r.tests || []);
    cacheTests(tests);
    return { tests, online: true };
  } catch (err) {
    if (isOldDesk(err)) {
      try {
        const q = await client.request('quizzes');
        return { tests: (q.quizzes || []).map((s) => testFromQuiz(s)), online: true, old: true };
      } catch (e2) {
        return { tests: [], online: !isOffline(e2), old: true, error: isOffline(e2) ? '' : e2.message };
      }
    }
    return { tests: newestFirst(cachedTests() || []), online: !isOffline(err), error: isOffline(err) ? '' : err.message };
  }
}

/** One test with its quiz (learners, layout) and answer key. → { test, quiz, answerKey } */
async function openTest(client, test) {
  try {
    const r = await client.request('test', { path: test.path });
    return { test: { ...test, ...(r.test || {}) }, quiz: r.quiz, answerKey: r.answerKey || null };
  } catch (err) {
    if (!isOldDesk(err)) throw err;
    const r = await client.request('quiz', { path: test.path });
    return { test: { ...test, setId: r.quiz.setId, choices: r.quiz.choices }, quiz: r.quiz, answerKey: r.answerKey || null };
  }
}

/** Saves the key with the test. → true, or false when KaTuroDesk is older (the key is used on this phone only). */
async function saveKey(client, test, key) {
  try {
    await client.request('testKey', { path: test.path, key });
    return true;
  } catch (err) {
    if (isOldDesk(err)) return false;
    throw err;
  }
}

/** Sets a ref to this screen's own Back while it is shown (→ true when it went back inside). */
function useBack(ref, fn) {
  useEffect(() => {
    if (!ref) return undefined;
    ref.current = fn;
    return () => { ref.current = null; };
  });
}

// ── small pieces ──

function Choice({ icon: Icon, title, hint, onClick, primary = false, disabled = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${primary ? 'nm-accent' : 'nm'} nm-press flex w-full items-center gap-4 rounded-3xl px-5 py-5 text-left disabled:opacity-60`}>
      {Icon && <Icon size={24} className={`flex-shrink-0 ${primary ? '' : 'nm-green'}`} />}
      <span className="min-w-0">
        <span className="block text-base font-semibold">{title}</span>
        {hint && <span className={`block text-xs ${primary ? 'opacity-90' : 'nm-muted'}`}>{hint}</span>}
      </span>
    </button>
  );
}

const Chip = ({ text }) => (text ? <p className="nm-in nm-green inline-block max-w-full truncate rounded-full px-4 py-1.5 text-xs font-semibold">{text}</p> : null);
const Busy = ({ text }) => <p className="flex items-center gap-2 text-sm" role="status"><Loader2 size={16} className="animate-spin" /> {text}</p>;

/** "Answer key?": the saved key, scan a sheet shaded as the key, type it, or none; a new key is saved with the test (`testKey`). */
function KeyStep({ client, test, quiz, chip, options = ['scan', 'type'], paused, onKey, onOther, innerRef }) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useBack(innerRef, () => {
    if (scanning) { setScanning(false); return true; }
    if (typing) { setTyping(false); return true; }
    return false;
  });
  const use = async (key) => {
    setBusy(true);
    setError('');
    try {
      const saved = await saveKey(client, test, key);
      onKey(key, saved);
    } catch (err) {
      setError(isOffline(err) ? 'KaTuroDesk can’t be reached, so the key was not saved. Try again on the same Wi-Fi.' : err.message);
    } finally {
      setBusy(false);
    }
  };
  const hasSaved = options.includes('saved');
  return (
    <div className="space-y-4">
      <Chip text={chip} />
      <p className="text-lg font-semibold">Answer key?</p>
      {!typing && (
        <>
          {hasSaved && <Choice icon={CheckCircle2} title="The key saved with this test" primary onClick={() => onOther('saved')} />}
          <Choice icon={ScanLine} title="Scan a sheet shaded as the key" hint="Shade one bubble sheet with the right answers" primary={!hasSaved} disabled={!quiz || busy} onClick={() => setScanning(true)} />
          <Choice icon={Keyboard} title="Type it" hint={`${test.items} answers, e.g. ABCDA…`} disabled={busy} onClick={() => setTyping(true)} />
          {options.includes('none') && <Choice icon={X} title="No key — just save the photos" onClick={() => onOther('none')} />}
        </>
      )}
      {typing && (
        <div className="nm space-y-3 rounded-3xl p-5">
          <KeyTyping id="kt-test-key" quiz={{ items: test.items, choices: quiz?.choices || test.choices || 4 }} value={text} onChange={setText} onKey={use} busy={busy} />
          <button type="button" onClick={() => { setTyping(false); setError(''); }} className="nm-sm nm-press w-full rounded-2xl py-3 text-sm font-medium">Back</button>
        </div>
      )}
      {busy && !typing && <Busy text="Saving the key…" />}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {scanning && quiz && !paused && (
        <BubbleLiveScan quiz={quiz} mode="key" chip={chip} onKey={(k) => { setScanning(false); use(k); }} onClose={() => setScanning(false)} />
      )}
    </div>
  );
}

// ── (a) KaTuro bubble sheets ──

function BubbleTests({ client, paused, onFinish, setTitle, backRef, dirtyRef }) {
  const [loaded, setLoaded] = useState(null); // loadTests result
  const testsRef = useRef([]);
  const resolved = useRef(false); // a sheet named the test: no second lookup
  const innerRef = useRef(null);
  const [opened, setOpened] = useState(null); // { test, quiz, answerKey }
  const [step, setStep] = useState('scan'); // scan | key | review | record
  const [live, setLive] = useState(false);
  const [sheets, setSheets] = useState({});
  const [decisions, setDecisions] = useState({});
  const [recorded, setRecorded] = useState(false);
  const count = useRef(0);

  useEffect(() => {
    let alive = true;
    loadTests(client).then((r) => {
      if (!alive) return;
      testsRef.current = r.tests;
      setLoaded(r);
      if (r.online && !r.error) setLive(true); // straight to the camera
    });
    return () => { alive = false; };
  }, [client]);

  useEffect(() => { setTitle({ scan: 'Scan the bubble sheets', key: 'Answer key', review: 'Check the results', record: 'Record the scores' }[step]); }, [step, setTitle]);
  useEffect(() => { dirtyRef.current = Object.keys(sheets).length > 0 && !recorded; }, [sheets, recorded, dirtyRef]);

  // The first sheet's QR code names the test (an older KaTuroDesk: its quizzes are opened one by one).
  const identify = useCallback(async (code) => {
    if (resolved.current) return undefined;
    let m = matchTestByCode(code, testsRef.current);
    if (m?.unknown && loaded?.old) {
      for (const t of testsRef.current.filter((x) => !x.setId)) {
        const o = await openTest(client, t);
        testsRef.current = testsRef.current.map((x) => (x.path === t.path ? o.test : x));
        if (o.quiz.setId === code.setId) { m = { test: o.test }; break; }
      }
    }
    if (!m) return undefined;
    if (m.unknown) return 'This sheet is from a test this KaTuroDesk does not have.';
    resolved.current = true;
    try {
      const o = await openTest(client, m.test);
      setOpened(o);
      if (!o.answerKey) { setLive(false); setStep('key'); }
    } catch (err) {
      resolved.current = false; // try again with the next frame
      throw err;
    }
    return undefined;
  }, [client, loaded?.old]);

  const quiz = opened?.quiz;
  const key = opened?.answerKey;
  const review = useMemo(() => (quiz ? reviewSheets(quiz, key, sheets, decisions) : null), [quiz, key, sheets, decisions]);
  const decide = (photo, change) => setDecisions((d) => ({ ...d, [photo]: { ...(d[photo] || {}), ...change, answers: { ...(d[photo]?.answers || {}), ...(change.answers || {}) } } }));
  const chip = opened ? testChip(opened.test, Boolean(key)) : '';

  const closeScanner = () => {
    setLive(false);
    if (review?.rows.length) setStep('review');
  };

  useBack(backRef, () => {
    if (recorded) { onFinish(); return true; } // recorded: never back to the review (no second recording)
    if (innerRef.current?.()) return true;
    if (live) { closeScanner(); return true; }
    if (step === 'record') { setStep('review'); return true; }
    if (step === 'review') { setStep('scan'); return true; }
    if (step === 'key') { setOpened(null); resolved.current = false; setStep('scan'); return true; }
    return false;
  });

  // The camera stays open while the test is found and sheet after sheet is taken (closed under the PIN screen).
  const scanner = live && !paused ? (
    <BubbleLiveScan
      quiz={quiz || null}
      answerKey={key}
      chip={chip}
      onIdentify={identify}
      taken={Object.entries(sheets).filter(([photo, x]) => x.ok && x.number && !decisions[photo]?.skip).map(([, x]) => x.number)}
      onSheet={(sheet) => {
        count.current += 1;
        const id = `Scan ${String(count.current).padStart(3, '0')}`;
        setSheets((all) => ({ ...all, [id]: sheet }));
      }}
      onClose={closeScanner}
    />
  ) : null;

  if (!loaded) return <Busy text="Looking for your tests…" />;
  if (!loaded.online) return <p className="nm-in rounded-2xl p-4 text-sm text-amber-900"><CloudOff size={16} className="mr-1 inline" /> Checking bubble sheets needs KaTuroDesk on the same Wi-Fi (it knows the tests and the learners).</p>;
  if (loaded.error) return <p role="alert" className="nm-in rounded-2xl p-4 text-sm text-red-700">{loaded.error}</p>;

  if (step === 'key' && opened) {
    return <KeyStep client={client} test={opened.test} quiz={quiz} chip={chip} paused={paused} innerRef={innerRef} onKey={(k) => { setOpened((o) => ({ ...o, answerKey: k })); setStep('scan'); setLive(true); }} />;
  }

  if (step === 'record' && opened) {
    return <TestRecord client={client} test={opened.test} items={quiz.items} scored={bubbleScored(quiz, review) || []} backRef={innerRef} onBack={() => setStep('review')} onRecorded={() => setRecorded(true)} onFinish={onFinish} />;
  }

  if (step === 'review' && review) {
    const scored = bubbleScored(quiz, review);
    return (
      <div className="space-y-3 pb-32">
        <Chip text={chip} />
        <BubbleRows quiz={quiz} review={review} onDecide={decide} />
        <button type="button" onClick={() => setLive(true)} className="nm-sm nm-press flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium"><ScanLine size={18} /> Scan more sheets</button>
        <div className="kt-covers-nav fixed inset-x-0 bottom-0 z-30 space-y-1 bg-[#eef2ef] p-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          {review.open > 0 && <p className="text-xs text-amber-800">{review.open} thing{review.open > 1 ? 's' : ''} to settle above.</p>}
          <button type="button" disabled={!scored?.length || !key} onClick={() => setStep('record')} className="nm-accent nm-press w-full rounded-2xl py-4 font-semibold disabled:opacity-50">
            Next: record {scored?.length || 0} score{scored?.length === 1 ? '' : 's'}
          </button>
        </div>
        {scanner}
      </div>
    );
  }

  // Before the scanner (or after closing it).
  return (
    <div className="space-y-4">
      <Chip text={chip} />
      <p className="nm-muted text-sm">Hold the phone over each sheet, all four black corners in view. The first sheet tells KaTuro which test it is.</p>
      <Choice icon={ScanLine} title={Object.keys(sheets).length ? 'Scan more sheets' : 'Start scanning'} primary onClick={() => setLive(true)} />
      {review?.rows.length > 0 && <Choice icon={CheckCircle2} title={`Check the results (${review.rows.length})`} onClick={() => setStep('review')} />}
      {scanner}
    </div>
  );
}

// ── (b) Other test papers ──

function PaperTests({ client, paused, onFinish, setTitle, onSent, backRef, dirtyRef }) {
  const [loaded, setLoaded] = useState(null);
  const [step, setStep] = useState('which'); // which | key | photos | checking | review | record | end
  const [test, setTest] = useState(null); // null = not in the list
  const [opened, setOpened] = useState(null); // { test, quiz, answerKey } (when KaTuroDesk is reachable)
  const [openError, setOpenError] = useState('');
  const [keyState, setKeyState] = useState(null); // null (not asked) | 'saved' | 'new' | 'none': only the teacher's choice sets it
  const [done, setDone] = useState([]); // sendFiles results
  const [left, setLeft] = useState(() => new Set()); // photos left out of the check (retakes)
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [rows, setRows] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [recorded, setRecorded] = useState(false);
  const inputRef = useRef(null);
  const innerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    loadTests(client).then((r) => alive && setLoaded(r));
    return () => { alive = false; };
  }, [client]);
  useEffect(() => {
    setTitle({ which: 'Which test?', key: 'Answer key', photos: 'Take the photos', checking: 'Checking', review: 'Check the results', record: 'Record the scores', end: 'Saved' }[step]);
  }, [step, setTitle]);
  useEffect(() => { dirtyRef.current = Boolean(rows?.length) && !recorded; }, [rows, recorded, dirtyRef]);

  useBack(backRef, () => {
    if (recorded) { onFinish(); return true; } // recorded: never back to the review (no second recording)
    if (innerRef.current?.()) return true;
    if (step === 'record') { setStep('review'); return true; }
    if (step === 'review') { setStep('photos'); return true; }
    if (step === 'checking') return true; // KaTuroDesk is working: wait
    if (step === 'photos') { setStep(test && loaded?.online && !loaded?.old ? 'key' : 'which'); return true; }
    if (step === 'key') { setStep('which'); return true; }
    return false;
  });

  const choose = (t) => {
    setTest(t);
    setError('');
    setKeyState(null);
    setOpened(null);
    setOpenError('');
    if (!t || !loaded.online) { setStep('photos'); return; } // not in the list, or offline: just save the photos
    setStep('key');
    openTest(client, t).then(setOpened).catch((err) => setOpenError(err.message));
  };

  const folder = test ? photosFolder(test) : PAPERS_FOLDER;
  const take = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy('Saving the photo…');
    setError('');
    try {
      const res = await sendFiles(client, folder, files, () => {}, { prefix: 'Test paper' });
      setDone((d) => [...d, ...res]);
      const refused = res.find((r) => !r.ok);
      if (refused) setError(refused.code === 'NOT_ALLOWED' || refused.code === 'NOT_FOUND' ? 'KaTuroDesk does not let this phone add photos to Lessons. On the computer: Settings → Phones → Lessons → View & add.' : `The photo could not be saved: ${refused.error}`);
      onSent?.();
    } finally {
      setBusy('');
    }
  };
  const saved = done.filter((d) => d.ok);
  const sent = saved.filter((d) => !d.queued);
  const waiting = saved.length - sent.length;
  const toCheck = sent.filter((d) => !left.has(d.name));
  const toggleLeft = (name) => setLeft((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  // At most CHECK_BATCH photos per request; what came back is kept when a later batch fails.
  //   before: the rows so far when only some photos are checked again (merged), else null
  const runCheck = async (paths, before) => {
    setStep('checking');
    setError('');
    const got = [];
    const batches = inBatches(paths, CHECK_BATCH);
    try {
      await client.hello(); // the address that answers now: a long check is never sent to a second one
      for (let i = 0; i < batches.length; i++) {
        setBusy(batches.length > 1 ? `KaTuroDesk is checking papers ${i * CHECK_BATCH + 1}–${i * CHECK_BATCH + batches[i].length} of ${paths.length}…` : `KaTuroDesk is checking ${paths.length} paper${paths.length === 1 ? '' : 's'}…`);
        const r = await client.request('checkPhotos', { path: test.path, photos: batches[i] }, { timeoutMs: CHECK_MS });
        got.push(...(r.rows || []));
      }
    } catch (err) {
      const why = isOldDesk(err) ? `${UPDATE_DESK} The photos are saved in ${folder.split('/').join(' › ')}.` : isOffline(err) ? 'KaTuroDesk can’t be reached now. The photos are saved; check them later.' : err.message;
      setError(got.length || before ? `${paths.length - got.length} photo(s) were not checked: ${why}` : why);
      if (!got.length && !before) { setBusy(''); setStep('photos'); return; }
    }
    setBusy('');
    // Only papers read again are replaced; they start fresh (their old decisions no longer fit).
    const answered = new Set(got.map((r) => r.photo));
    setDecisions((d) => Object.fromEntries(Object.entries(d).filter(([photo]) => !answered.has(photo))));
    setRows(mergeRows(before || [], got, [...answered]));
    setStep('review');
  };
  const checkPaths = toCheck.map((d) => `${folder}/${d.name}`);
  const again = rows ? photosToRecheck(checkPaths, rows) : [];

  if (!loaded) return <Busy text="Looking for your tests…" />;

  if (step === 'which') {
    return (
      <div className="space-y-4">
        {loaded.old && <p className="nm-in rounded-2xl p-4 text-sm text-amber-900">{UPDATE_DESK} Until then the photos go to {PAPERS_FOLDER.split('/').join(' › ')}.</p>}
        {!loaded.online && <p className="nm-in rounded-2xl p-4 text-xs text-amber-900">KaTuroDesk can’t be reached: the photos stay on this phone and go by themselves on the same Wi-Fi.</p>}
        {loaded.error && <p role="alert" className="text-sm text-red-700">{loaded.error}</p>}
        {!loaded.old && loaded.tests.map((t, i) => (
          <Choice key={t.path} icon={ClipboardCheck} title={t.title} hint={[t.className, testLine(t)].filter(Boolean).join(' · ')} primary={i === 0} onClick={() => choose(t)} />
        ))}
        <Choice icon={FileQuestion} title="Not in the list" hint={`Just save the photos (${PAPERS_FOLDER.split('/').slice(1).join(' › ')})`} primary={loaded.old || !loaded.tests.length} onClick={() => choose(null)} />
      </div>
    );
  }

  const current = opened?.test || test;
  const knownKey = keyState === 'saved' || keyState === 'new' || (keyState === null && Boolean(test?.hasKey || opened?.answerKey));
  const chip = test ? testChip(current, keyState === 'none' ? false : knownKey) : '';

  if (step === 'key') {
    const { options } = keyChoices({ ...current, hasKey: Boolean(test.hasKey || opened?.answerKey) });
    return (
      <div className="space-y-3">
        {openError && <p role="alert" className="text-sm text-red-700">{openError}</p>}
        <KeyStep
          client={client}
          test={current}
          quiz={opened?.quiz}
          chip={chip}
          paused={paused}
          innerRef={innerRef}
          options={options.map((o) => o.id)}
          onKey={() => { setKeyState('new'); setStep('photos'); }}
          onOther={(id) => { setKeyState(id); setStep('photos'); }}
        />
      </div>
    );
  }

  if (step === 'checking') return <div className="space-y-4"><Chip text={chip} /><Busy text={busy || 'KaTuroDesk is checking the papers…'} /><p className="nm-muted text-xs">This can take a minute or two.</p></div>;

  if (step === 'review' && rows) {
    return (
      <div className="space-y-3">
        {error && <p role="alert" className="nm-in rounded-2xl p-4 text-sm text-amber-900">{error}</p>}
        {again.length > 0 && loaded.online && (
          <button type="button" onClick={() => runCheck(again, rows)} className="nm-sm nm-press flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold"><RefreshCw size={16} /> Check the unread ones again ({again.length})</button>
        )}
        <PaperReview test={current} quiz={opened?.quiz} rows={rows} decisions={decisions} setDecisions={setDecisions} chip={chip} onNext={() => setStep('record')} />
      </div>
    );
  }

  if (step === 'record') {
    const learners = opened?.quiz?.learners || [];
    const scored = photoScored(learners, reviewPhotoRows(rows, decisions, learners)) || [];
    return <TestRecord client={client} test={current} items={current.items} scored={scored} backRef={innerRef} onBack={() => setStep('review')} onRecorded={() => setRecorded(true)} onFinish={onFinish} />;
  }

  if (step === 'end') {
    const offline = waiting > 0 || !loaded.online;
    return (
      <div className="space-y-4">
        <div className="nm space-y-2 rounded-3xl p-5 text-center" role="status">
          {offline ? <CloudOff size={40} className="mx-auto text-amber-600" /> : <CheckCircle2 size={40} className="nm-green mx-auto" />}
          <p className="text-lg font-semibold">{offline ? 'Saved on the phone' : 'Saved'}</p>
          <p className="nm-muted text-sm">
            {offline
              ? `${saved.length} photo(s). Checking needs KaTuroDesk on the same Wi-Fi.`
              : `${sent.length} photo(s) in ${folder.split('/').join(' › ')}.`}
          </p>
        </div>
        <button type="button" onClick={onFinish} className="nm-accent nm-press w-full rounded-2xl py-4 font-semibold">Done</button>
      </div>
    );
  }

  // photos
  const canCheck = Boolean(test) && Boolean(opened) && knownKey && keyState !== 'none' && loaded.online && !loaded.old && toCheck.length > 0 && waiting === 0;
  return (
    <div className="space-y-4">
      <Chip text={chip} />
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={take} />
      <p className="nm-muted text-sm">One paper per photo, the whole page in view, on a plain surface.</p>
      <button type="button" disabled={Boolean(busy)} onClick={() => inputRef.current?.click()} className="nm-accent nm-press flex w-full items-center justify-center gap-3 rounded-3xl py-5 text-base font-semibold disabled:opacity-50">
        <Camera size={22} /> {done.length ? 'Next paper' : 'Take a photo'}
      </button>
      {busy && <Busy text={busy} />}
      {saved.length > 0 && (
        <div className="nm-in space-y-2 rounded-2xl px-4 py-3 text-sm" role="status">
          <p className="text-base font-semibold">{saved.length} paper{saved.length === 1 ? '' : 's'}{left.size ? ` · ${left.size} left out` : ''}</p>
          {waiting > 0 && <p className="text-xs text-amber-800">{waiting} saved on this phone: they go to KaTuroDesk by themselves on the same Wi-Fi</p>}
          <p className="nm-muted text-xs">{folder.split('/').join(' › ')}</p>
          {test && sent.length > 0 && (
            <ul className="space-y-1">
              {sent.map((d) => (
                <li key={d.name} className="flex items-center gap-2">
                  <span className={`min-w-0 flex-1 truncate text-xs ${left.has(d.name) ? 'nm-muted line-through' : ''}`}>{d.name}</span>
                  <button type="button" onClick={() => toggleLeft(d.name)} aria-label={left.has(d.name) ? `Check ${d.name} again` : `Leave ${d.name} out of the check`} className="nm-muted grid h-11 w-11 place-items-center">
                    {left.has(d.name) ? <Undo2 size={18} /> : <Trash2 size={18} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {test && openError && <p role="alert" className="text-sm text-amber-900">The test could not be opened, so the papers can’t be checked from here: {openError}</p>}
      {saved.length > 0 && (canCheck ? (
        <>
          <p className="nm-muted text-xs">The photos are read by the KaTuro AI on KaTuroDesk (it may see the learners’ names on the papers).</p>
          <button type="button" disabled={Boolean(busy)} onClick={() => runCheck(checkPaths, null)} className="nm-accent nm-press flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-semibold disabled:opacity-50"><CheckCircle2 size={18} /> Check them now</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => setStep('end')} className="nm-sm nm-press w-full rounded-2xl py-3 text-sm font-medium">Not now, just save them</button>
        </>
      ) : (
        <button type="button" disabled={Boolean(busy)} onClick={() => setStep('end')} className="nm-sm nm-press w-full rounded-2xl py-3 text-sm font-semibold">Done</button>
      ))}
    </div>
  );
}

/** Each paper checked on KaTuroDesk: who it is, the score, unclear items to settle. */
function PaperReview({ test, quiz, rows, decisions, setDecisions, chip, onNext }) {
  const learners = useMemo(() => quiz?.learners || [], [quiz]);
  const review = useMemo(() => reviewPhotoRows(rows, decisions, learners), [rows, decisions, learners]);
  const scored = photoScored(learners, review);
  const decide = (photo, change) => setDecisions((d) => ({ ...d, [photo]: { ...(d[photo] || {}), ...change, items: { ...(d[photo]?.items || {}), ...(change.items || {}) } } }));
  const short = (p) => String(p).split('/').pop();
  return (
    <div className="space-y-4 pb-32">
      <Chip text={chip} />
      {!rows.length && <p className="nm-in rounded-2xl p-4 text-sm">KaTuroDesk found no papers in these photos.</p>}
      {review.rows.map((r) => {
        const d = decisions[r.photo] || {};
        return (
          <div key={r.photo} className={`${r.issues.length ? 'nm-in' : 'nm'} rounded-3xl p-4`}>
            <div className="flex items-center gap-2">
              {r.skipped ? <span className="nm-muted flex-1 text-sm">{short(r.photo)}: left out</span> : (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.learner ? r.name : (r.name ? `${r.name}?` : short(r.photo))}</span>
                  {Number.isFinite(r.score) && <span className="nm-green block text-xs font-semibold">{r.score} / {r.items || test.items}</span>}
                </span>
              )}
              <button type="button" onClick={() => decide(r.photo, { skip: !r.skipped })} aria-label={r.skipped ? `Put ${short(r.photo)} back` : `Leave out ${short(r.photo)}`} className="nm-muted grid h-11 w-11 place-items-center">
                {r.skipped ? <Undo2 size={18} /> : <Trash2 size={18} />}
              </button>
            </div>
            {!r.skipped && r.note && <p className="nm-muted mt-1 text-xs">{r.note}</p>}
            {!r.skipped && (r.issues.includes('learner') || r.issues.includes('duplicate') || d.learner !== undefined) && (
              <div className="mt-2 text-sm text-amber-900">
                {r.issues.includes('duplicate') && <p>Two papers are for the same learner. Leave one out, or choose the right learner.</p>}
                <select aria-label={`Learner for ${short(r.photo)}`} value={d.learner ?? r.learner ?? ''} onChange={(e) => decide(r.photo, { learner: Number(e.target.value) })} className="nm-sm mt-1 w-full rounded-xl p-3 text-sm">
                  <option value="" disabled>Choose the learner</option>
                  {learners.map((l) => <option key={l.n} value={l.n}>{l.name}</option>)}
                </select>
              </div>
            )}
            {!r.skipped && r.unread && (
              <label className="mt-2 flex items-center gap-2 text-sm text-amber-900">
                <span className="flex-1">The score could not be read. Type it:</span>
                <input type="number" inputMode="decimal" min="0" max={r.items || test.items} value={d.score ?? ''} onChange={(e) => decide(r.photo, { score: e.target.value === '' ? undefined : Number(e.target.value) })} className="nm-in w-20 rounded-xl px-2 py-2 text-right font-semibold" />
              </label>
            )}
            {!r.skipped && !r.unread && r.unclear.map((u) => (
              <div key={u.item} className="mt-2 flex items-center gap-2 text-sm text-amber-900">
                <span className="flex-1">Item {u.item} is unclear:</span>
                <button type="button" aria-pressed={u.correct === true} onClick={() => decide(r.photo, { items: { [u.item]: true } })} className={`${u.correct === true ? 'nm-accent' : 'nm-sm'} nm-press rounded-xl px-3 py-2 font-semibold`}>Correct</button>
                <button type="button" aria-pressed={u.correct === false} onClick={() => decide(r.photo, { items: { [u.item]: false } })} className={`${u.correct === false ? 'nm-accent' : 'nm-sm'} nm-press rounded-xl px-3 py-2 font-semibold`}>Wrong</button>
              </div>
            ))}
          </div>
        );
      })}
      <div className="kt-covers-nav fixed inset-x-0 bottom-0 z-30 space-y-1 bg-[#eef2ef] p-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        {review.open > 0 && <p className="text-xs text-amber-800">{review.open} thing{review.open > 1 ? 's' : ''} to settle above.</p>}
        <button type="button" disabled={!scored?.length} onClick={onNext} className="nm-accent nm-press w-full rounded-2xl py-4 font-semibold disabled:opacity-50">
          Next: record {scored?.length || 0} score{scored?.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}

/**
 * "Check test papers" (from the camera): one question per screen.
 *   kind 'bubble': KaTuro bubble sheets, scanned live; the first sheet names its test.
 *   kind 'papers': other papers (written, or not KaTuro sheets): photos into the test's folder,
 *                  checked on KaTuroDesk when it has the key.
 * Both end by recording the scores into the test's E-Class Record column.
 * Back (the arrow, or Android's back) goes one step back; leaving with results not yet
 * recorded asks first. paused: the PIN screen is up (the camera is closed meanwhile).
 */
export default function TestCheck({ client, kind, paused = false, onClose, onSent }) {
  const [title, setTitle] = useState('');
  const titleRef = useRef(null);
  const backRef = useRef(null); // the flow's Back → true when it went back a step
  const dirtyRef = useRef(false); // results not recorded yet
  const leaveRef = useRef(null);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { titleRef.current?.focus(); }, [title]);

  const leave = useCallback(() => {
    if (dirtyRef.current && !window.confirm('Leave without recording? The results checked here will be lost.')) return false;
    onClose();
    return true;
  }, [onClose]);
  useEffect(() => { leaveRef.current = leave; }, [leave]);
  const back = () => { if (!backRef.current?.()) leave(); };

  // Android back: one history entry while this is open; each back press is one step back.
  useEffect(() => {
    const mark = () => window.history.pushState({ ...(window.history.state || {}), tc: true }, '');
    mark();
    const onPop = (e) => {
      if (e.state?.tc) return;
      // Under the PIN screen nothing moves: the back press is undone.
      if (pausedRef.current) { mark(); return; }
      if (backRef.current?.() || !leaveRef.current?.()) mark();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (window.history.state?.tc) window.history.back();
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="Check test papers" className="fixed inset-0 z-50 overflow-y-auto bg-[#eef2ef]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-[#eef2ef] px-4 py-3">
        <button type="button" onClick={back} aria-label="Back" className="nm-sm nm-press grid h-11 w-11 place-items-center rounded-full"><ArrowLeft size={20} /></button>
        <h2 ref={titleRef} tabIndex={-1} className="flex-1 truncate text-base font-semibold outline-none">{title || 'Check test papers'}</h2>
        <button type="button" onClick={leave} aria-label="Close" className="grid h-11 w-11 place-items-center"><X size={22} /></button>
      </div>
      <div className="px-5 py-3">
        {kind === 'bubble'
          ? <BubbleTests client={client} paused={paused} onFinish={onClose} setTitle={setTitle} backRef={backRef} dirtyRef={dirtyRef} />
          : <PaperTests client={client} paused={paused} onFinish={onClose} setTitle={setTitle} onSent={onSent} backRef={backRef} dirtyRef={dirtyRef} />}
      </div>
    </div>
  );
}
