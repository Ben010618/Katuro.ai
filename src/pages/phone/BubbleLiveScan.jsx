import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Flashlight, X } from 'lucide-react';
import { layoutOf } from '../../services/desk/bubble/quiz';
import { createScanSession, SCAN_STATUS } from '../../services/desk/bubble/scanSession';
import { scoreSheet } from '../../services/desk/generators/answerSheets';

// Said out loud (TalkBack) only when something happened, not for every frame.
const ANNOUNCE = new Set(['accepted', 'duplicate', 'otherQuiz', 'unclear', 'key']);

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
 */
export default function BubbleLiveScan({ quiz, answerKey, mode = 'sheets', taken = [], onSheet, onKey, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const trackRef = useRef(null);
  const cb = useRef({ onSheet, onKey });
  useEffect(() => { cb.current = { onSheet, onKey }; }, [onSheet, onKey]);
  const [status, setStatus] = useState('searching');
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
    const session = createScanSession(quiz, { mode, taken });
    const layout = layoutOf(quiz);
    const nameOf = (n) => quiz.learners.find((l) => l.n === n)?.name || 'Learner not known: choose later';
    const scoreOf = (answers) => (answerKey ? scoreSheet({ answers }, answerKey).score : null);

    (async () => {
      let readSheet;
      let toGray;
      try {
        ({ readSheet, toGray } = await import('../../services/desk/bubble/reader'));
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
      const tick = () => {
        if (!alive) return;
        const v = videoRef.current;
        let wait = PAUSE_MS;
        if (v && v.readyState >= 2 && v.videoWidth) {
          const scale = Math.min(1, READ_SIDE / Math.max(v.videoWidth, v.videoHeight));
          const cw = Math.round(v.videoWidth * scale);
          const ch = Math.round(v.videoHeight * scale);
          if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
          g.drawImage(v, 0, 0, canvas.width, canvas.height);
          const { data } = g.getImageData(0, 0, canvas.width, canvas.height);
          let res;
          try {
            res = readSheet({ gray: toGray(data, canvas.width, canvas.height), width: canvas.width, height: canvas.height }, layout);
          } catch {
            res = { ok: false, error: 'alignment' };
          }
          const out = session.feed(res);
          setStatus(out.status);
          if (ANNOUNCE.has(out.status)) setSaid(SCAN_STATUS[out.status]);
          if (out.status === 'accepted') {
            navigator.vibrate?.(70);
            beep();
            setLast({ name: nameOf(out.number), score: scoreOf(out.sheet.answers) });
            setCount(session.count);
            cb.current.onSheet?.(out.sheet);
            wait = AFTER_TAKE_MS;
          } else if (out.status === 'key') {
            navigator.vibrate?.(70);
            beep();
            cb.current.onKey?.(out.key);
            return; // done: the parent closes the scanner
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
    // The camera starts once for this scanner; taken/answerKey are read when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, mode]);

  const toggleTorch = async () => {
    const next = !torch;
    try {
      await trackRef.current?.applyConstraints({ advanced: [{ torch: next }] });
      setTorch(next);
    } catch { /* light not available */ }
  };

  const good = status === 'accepted' || status === 'held' || status === 'key';
  const total = quiz.learners.length;
  return (
    <div role="dialog" aria-modal="true" aria-label={mode === 'key' ? 'Scan the answer key sheet' : 'Scan bubble sheets'} className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <p className="text-sm font-semibold">{mode === 'key' ? 'Scan the answer key sheet' : `Scanning · ${count} of ${total}`}</p>
        <span className="flex items-center gap-1">
          {torch !== null && (
            <button type="button" onClick={toggleTorch} aria-pressed={torch} aria-label="Light" className={`rounded-full p-2 ${torch ? 'bg-white text-black' : 'text-white'}`}><Flashlight size={20} /></button>
          )}
          <button ref={closeRef} type="button" onClick={onClose} aria-label={mode === 'key' ? 'Close the scanner' : 'Done scanning'} className="-mr-2 p-2"><X size={22} /></button>
        </span>
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
        {cameraError ? <p className="text-sm text-amber-300">{cameraError}</p> : <p className="text-sm">{SCAN_STATUS[status] || SCAN_STATUS.searching}</p>}
        {last && mode !== 'key' && (
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <CheckCircle2 size={16} /> {last.name}{last.score !== null ? ` · ${last.score}/${quiz.items}` : ''}
          </p>
        )}
        {mode !== 'key' && (
          <button type="button" onClick={onClose} className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white">Done · check the results</button>
        )}
      </div>
    </div>
  );
}
