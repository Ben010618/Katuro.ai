import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Flashlight, X } from 'lucide-react';
import { layoutOf } from '../../services/desk/bubble/quiz';
import { createIdentifier, createScanSession, SCAN_STATUS } from '../../services/desk/bubble/scanSession';
import { scoreSheet } from '../../services/desk/generators/answerSheets';

// Said out loud (TalkBack) only when something happened, not for every frame.
const ANNOUNCE = new Set(['accepted', 'duplicate', 'otherQuiz', 'unclear', 'key', 'finding', 'unknownTest']);

// The long side of the picture that is read: enough for the bubbles and the code on a cut
// quarter sheet, small enough to read a few times a second on a school phone.
const READ_SIDE = 1400;
const PAUSE_MS = 120;
const AFTER_TAKE_MS = 900; // a moment to see "Got it" and change the sheet

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 1046;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.13);
    o.onended = () => ctx.close();
  } catch { /* no sound on this phone */ }
}

/**
 * Live bubble-sheet scanner: the back camera reads sheet after sheet by itself (no shutter
 * button). Everything stays on the phone; reader.js reads, scanSession.js decides.
 *   mode 'sheets': onSheet(sheet) for every learner's sheet taken; taken = learner numbers already in
 *   mode 'key':    onKey(['A', …]) once a sheet filled as the answer key is read
 *   auto (quiz = null, onIdentify): the first KaTuro sheet's QR code names the test:
 *     onIdentify({ setId, number }) → a note when that test can't be used, else nothing; the
 *     parent then gives the quiz (scanning goes on, the camera stays open) or closes the scanner.
 *   chip: what is known about the test, shown at the top ("Quiz 3 · Grade 7 - Rizal · key saved ✓")
 */
export default function BubbleLiveScan({ quiz, answerKey, mode = 'sheets', taken = [], chip = '', onIdentify, onSheet, onKey, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const trackRef = useRef(null);
  const cb = useRef({ onSheet, onKey, onIdentify });
  useEffect(() => { cb.current = { onSheet, onKey, onIdentify }; }, [onSheet, onKey, onIdentify]);
  const keyRef = useRef(answerKey);
  useEffect(() => { keyRef.current = answerKey; }, [answerKey]);
  // What is read: set again when the test is found (auto mode), without restarting the camera.
  const cfg = useRef(null);
  useEffect(() => {
    cfg.current = quiz ? { quiz, layout: layoutOf(quiz), session: createScanSession(quiz, { mode, taken }) } : null;
    // taken is read when the quiz is set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, mode]);
  const [status, setStatus] = useState(quiz ? 'searching' : 'identify');
  const [note, setNote] = useState(''); // why the test of the sheet in view can't be used
  const [last, setLast] = useState(null); // { name, score } of the sheet just taken
  const [count, setCount] = useState(taken.length);
  const [cameraError, setCameraError] = useState('');
  const [torch, setTorch] = useState(null); // null = this camera has no light
  const [said, setSaid] = useState('');
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, []);

  useEffect(() => {
    let alive = true;
    let stream = null;
    let timer = 0;
    const identifier = createIdentifier();

    (async () => {
      let readSheet;
      let toGray;
      let jsQR;
      try {
        [{ readSheet, toGray }, { default: jsQR }] = await Promise.all([import('../../services/desk/bubble/reader'), import('jsqr')]);
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        track?.applyConstraints?.({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        if (track?.getCapabilities?.().torch) setTorch(false);
        const v = videoRef.current;
        v.srcObject = stream;
        await v.play();
      } catch {
        if (alive) setCameraError('The camera could not start. Allow KaTuro to use the camera in your phone settings, or use Take a photo instead.');
        return;
      }
      const canvas = canvasRef.current;
      const g = canvas.getContext('2d', { willReadFrequently: true });

      // Auto mode: look for a KaTuro QR code anywhere in the picture.
      let retryAt = 0; // after a failed lookup (e.g. Wi-Fi), a moment before trying again
      const identify = (data) => {
        if (Date.now() < retryAt) return;
        let text = null;
        try { text = jsQR(data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })?.data ?? null; } catch { /* not readable */ }
        const out = identifier.feed(text);
        setStatus(out.status);
        if (out.status === 'unknownTest') setNote(out.note);
        else if (out.status === 'identify') setNote('');
        if (!out.code) return;
        setSaid(SCAN_STATUS.finding);
        const show = (why) => { if (alive) { setNote(why); setSaid(why); setStatus('unknownTest'); } };
        Promise.resolve()
          .then(() => cb.current.onIdentify?.(out.code))
          .then((why) => {
            // A note: this test is not on KaTuroDesk (remembered). Nothing: found.
            const note = typeof why === 'string' ? why : '';
            identifier.settle(note);
            if (note) show(note);
          }, (err) => {
            // Could not look it up now: not remembered, tried again in a moment.
            identifier.settle();
            retryAt = Date.now() + 3000;
            show(err?.message || 'The test could not be opened.');
          });
      };

      const tick = () => {
        if (!alive) return;
        const v = videoRef.current;
        const c = cfg.current;
        let wait = PAUSE_MS;
        if (v && v.readyState >= 2 && v.videoWidth) {
          const scale = Math.min(1, READ_SIDE / Math.max(v.videoWidth, v.videoHeight));
          const cw = Math.round(v.videoWidth * scale);
          const ch = Math.round(v.videoHeight * scale);
          if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
          g.drawImage(v, 0, 0, canvas.width, canvas.height);
          const { data } = g.getImageData(0, 0, canvas.width, canvas.height);
          if (!c) {
            identify(data);
          } else {
            let res;
            try {
              res = readSheet({ gray: toGray(data, canvas.width, canvas.height), width: canvas.width, height: canvas.height }, c.layout);
            } catch {
              res = { ok: false, error: 'alignment' };
            }
            const out = c.session.feed(res);
            setStatus(out.status);
            if (ANNOUNCE.has(out.status)) setSaid(SCAN_STATUS[out.status]);
            if (out.status === 'accepted') {
              navigator.vibrate?.(70);
              beep();
              const name = c.quiz.learners.find((l) => l.n === out.number)?.name || 'Learner not known: choose later';
              setLast({ name, score: keyRef.current ? scoreSheet({ answers: out.sheet.answers }, keyRef.current).score : null });
              setCount(c.session.count);
              cb.current.onSheet?.(out.sheet);
              wait = AFTER_TAKE_MS;
            } else if (out.status === 'key') {
              navigator.vibrate?.(70);
              beep();
              cb.current.onKey?.(out.key);
              return; // done: the parent closes the scanner
            }
          }
        }
        timer = setTimeout(tick, wait);
      };
      tick();
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleTorch = async () => {
    const next = !torch;
    try {
      await trackRef.current?.applyConstraints({ advanced: [{ torch: next }] });
      setTorch(next);
    } catch { /* light not available */ }
  };

  const good = status === 'accepted' || status === 'held' || status === 'key' || status === 'finding';
  const total = quiz?.learners.length || 0;
  const title = mode === 'key' ? 'Scan the answer key sheet' : quiz ? `Scanning · ${count} of ${total}` : 'Scan a bubble sheet';
  const message = status === 'unknownTest' && note ? note : SCAN_STATUS[status] || SCAN_STATUS.searching;
  return (
    <div role="dialog" aria-modal="true" aria-label={mode === 'key' ? 'Scan the answer key sheet' : 'Scan bubble sheets'} className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="px-4 py-3 text-white" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{title}</p>
          <span className="flex items-center gap-1">
            {torch !== null && (
              <button type="button" onClick={toggleTorch} aria-pressed={torch} aria-label="Light" className={`rounded-full p-2 ${torch ? 'bg-white text-black' : 'text-white'}`}><Flashlight size={20} /></button>
            )}
            <button ref={closeRef} type="button" onClick={onClose} aria-label={mode === 'key' || !quiz ? 'Close the scanner' : 'Done scanning'} className="-mr-2 p-2"><X size={22} /></button>
          </span>
        </div>
        {chip && <p className="mt-1 inline-block max-w-full truncate rounded-full bg-emerald-700/80 px-3 py-1 text-xs font-semibold">{chip}</p>}
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className={`aspect-[3/4] w-full max-w-sm rounded-2xl border-4 transition-colors ${good ? 'border-emerald-400' : status === 'steady' ? 'border-amber-300' : 'border-white/70'}`} />
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="space-y-2 bg-black p-4 text-white" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <p className="sr-only" aria-live="polite">{said}</p>
        {cameraError ? <p className="text-sm text-amber-300">{cameraError}</p> : <p className={`text-sm ${status === 'unknownTest' ? 'text-amber-300' : ''}`}>{message}</p>}
        {last && mode !== 'key' && quiz && (
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <CheckCircle2 size={16} /> {last.name}{last.score !== null ? ` · ${last.score}/${quiz.items}` : ''}
          </p>
        )}
        {mode !== 'key' && quiz && (
          <button type="button" onClick={onClose} className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white">Done · check the results</button>
        )}
      </div>
    </div>
  );
}
