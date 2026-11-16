import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { TOUR_KEY, TOUR_EVENT, FIRST_RUN, tourToShow, whatsNewSteps } from './tourSteps';

const GAP = 14; // between the highlighted part and the card
const PAD = 6; // around the highlighted part
const EDGE = 16; // from the window edges

const readSeen = () => { try { return JSON.parse(localStorage.getItem(TOUR_KEY) || 'null'); } catch { return null; } };
const saveSeen = (version) => { try { localStorage.setItem(TOUR_KEY, JSON.stringify({ version, at: new Date().toISOString() })); } catch { /* shown again next time */ } };

/** Where the card goes: below, above, right or left of the part; the middle when none fits. */
function placeCard(rect, card, vw, vh) {
  const fitsX = (x) => Math.min(Math.max(EDGE, x), vw - card.w - EDGE);
  const fitsY = (y) => Math.min(Math.max(EDGE, y), vh - card.h - EDGE);
  if (rect) {
    const cx = rect.left + rect.width / 2 - card.w / 2;
    const cy = rect.top + rect.height / 2 - card.h / 2;
    if (rect.bottom + GAP + card.h <= vh - EDGE) return { left: fitsX(cx), top: rect.bottom + GAP };
    if (rect.top - GAP - card.h >= EDGE) return { left: fitsX(cx), top: rect.top - GAP - card.h };
    if (rect.right + GAP + card.w <= vw - EDGE) return { left: rect.right + GAP, top: fitsY(cy) };
    if (rect.left - GAP - card.w >= EDGE) return { left: rect.left - GAP - card.w, top: fitsY(cy) };
  }
  return { left: (vw - card.w) / 2, top: (vh - card.h) / 2 };
}

/**
 * The spotlight: dims KaTuroDesk except the part a step is about ([data-tour="…"]) and shows
 * the step's card beside it. Next / Back / Skip tour; Esc skips, ← → step.
 * → onDone() when finished or skipped.
 */
function TourOverlay({ steps, kind, onDone }) {
  const [i, setI] = useState(0);
  const [layout, setLayout] = useState({ rect: null, pos: null });
  const cardRef = useRef(null);
  const nextRef = useRef(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  const place = useCallback(() => {
    const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    const r = el?.getBoundingClientRect();
    const rect = r && r.width > 0 && r.height > 0 ? r : null;
    const card = { w: cardRef.current?.offsetWidth || 340, h: cardRef.current?.offsetHeight || 200 };
    setLayout({ rect, pos: placeCard(rect, card, window.innerWidth, window.innerHeight) });
  }, [step]);

  useEffect(() => {
    const frame = requestAnimationFrame(place);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (cardRef.current) ro?.observe(cardRef.current);
    window.addEventListener('resize', place);
    return () => { cancelAnimationFrame(frame); ro?.disconnect(); window.removeEventListener('resize', place); };
  }, [place]);

  useEffect(() => { nextRef.current?.focus(); }, [i]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onDone(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (last) onDone(); else setI((n) => n + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, onDone]);

  const { rect, pos } = layout;
  return (
    <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true" aria-labelledby="kt-tour-title">
      {/* Dims everything but the highlighted part; clicks never reach KaTuroDesk behind it. */}
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl transition-all duration-300"
          style={{
            left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            boxShadow: '0 0 0 3px #34d399, 0 0 0 9999px rgba(10, 20, 15, 0.62)',
          }}
        />
      ) : <div className="fixed inset-0 bg-[rgba(10,20,15,0.62)]" />}
      <div
        ref={cardRef}
        className="fixed w-[340px] max-w-[calc(100vw-32px)] rounded-2xl bg-white p-5 shadow-2xl transition-all duration-300"
        style={pos ? { left: pos.left, top: pos.top } : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', visibility: 'hidden' }}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-emerald-700">
            {kind === 'new' ? <><Sparkles size={12} /> What&apos;s new</> : 'Quick tour'}
            <span className="font-semibold text-gray-400 normal-case tracking-normal">· {i + 1} of {steps.length}</span>
          </p>
          <button type="button" onClick={onDone} aria-label="Close the tour" className="-mr-1 -mt-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={16} /></button>
        </div>
        <h2 id="kt-tour-title" className="text-[15px] font-bold text-gray-900">{step.title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={onDone} className="text-xs font-semibold text-gray-500 hover:text-gray-800">Skip tour</button>
          <div className="ml-auto flex gap-2">
            {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Back</button>}
            <button
              ref={nextRef}
              type="button"
              onClick={() => (last ? onDone() : setI(i + 1))}
              className="rounded-lg bg-[#2d6a4f] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#235841]"
            >
              {last ? 'Done' : i === 0 && kind === 'welcome' ? 'Start the tour' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Shows the right tour once: the welcome tour on a first start, "What's new" after an update
 * (tourSteps.tourToShow). Settings can replay either (startDeskTour). Desktop app only.
 */
export default function DeskTourHost() {
  const [tour, setTour] = useState(null); // { kind, steps, version }
  const version = useRef('');

  useEffect(() => {
    const desk = typeof window !== 'undefined' ? window.katuroDeskApi : undefined;
    if (!desk?.getVersion) return undefined;
    let alive = true;
    let timer = null;
    Promise.all([desk.getVersion(), desk.isFirstRun?.().catch(() => false) ?? false]).then(([v, firstRun]) => {
      if (!alive) return;
      version.current = v || '';
      const next = tourToShow({ seen: readSeen(), firstRun: Boolean(firstRun), version: version.current });
      // A moment after KaTuroDesk opens, so the folder and the panels are in place.
      if (next) timer = setTimeout(() => alive && setTour({ ...next, version: version.current }), 1200);
    }).catch(() => {});
    const replay = (e) => {
      const kind = e.detail === 'new' ? 'new' : 'welcome';
      const steps = kind === 'new' ? whatsNewSteps(null, version.current) : FIRST_RUN;
      if (steps.length) setTour({ kind, steps, version: version.current });
    };
    window.addEventListener(TOUR_EVENT, replay);
    return () => { alive = false; clearTimeout(timer); window.removeEventListener(TOUR_EVENT, replay); };
  }, []);

  const done = useCallback(() => {
    setTour((t) => {
      if (t?.version) saveSeen(t.version);
      return null;
    });
  }, []);

  return tour ? <TourOverlay key={`${tour.kind}-${tour.steps.length}`} steps={tour.steps} kind={tour.kind} onDone={done} /> : null;
}
