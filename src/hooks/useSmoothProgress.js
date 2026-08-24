import { useEffect, useRef, useState } from 'react';

/**
 * Turns the coarse progress milestones a generator reports into a bar that
 * actually keeps moving while the user waits.
 *
 * The problem this solves: our generators set progress at a handful of points
 * (COT goes 5 → 15 → 85 → 100), so the bar sat frozen at 15% for the entire
 * 60–180s AI call. A stationary progress bar reads as a hung app, and teachers
 * reload the page — which throws away a generation they already paid tokens for.
 *
 * So between milestones the value creeps forward on its own, easing toward a
 * ceiling part-way to the next milestone and slowing as it approaches. Real
 * milestones always win when they arrive: reporting 85% snaps the creep up to
 * meet it. The creep never reaches 100% on its own, so the bar cannot claim a
 * finish that has not happened.
 *
 * Unlike the download overlay — where the main thread is blocked by the DOCX
 * packer and only CSS can animate — generation is network-bound and the main
 * thread is idle, so a JS ticker is both available and more accurate here.
 *
 */
/**
 * One tick of the curve. Pure, so the behaviour that actually matters — that it
 * always advances and never fakes a finish — is unit-testable without React.
 *
 * @param {number} prev        currently displayed percentage
 * @param {number} value       last reported real milestone, 0-100
 * @param {number} elapsedSec  seconds since this run started
 * @param {number} estimateSec rough expected total duration
 */
export function nextProgress(prev, { value = 0, elapsedSec = 0, estimateSec = 60 }) {
  if (value >= 100) return 100;

  // Asymptotic in elapsed time: fast at first, then slower and slower, so a
  // long call decelerates instead of parking at a round number.
  const timeCeiling = 92 * (1 - Math.exp(-elapsedSec / Math.max(1, estimateSec * 0.55)));
  // Once a real milestone exists, creep only part of the way to the next one so
  // an early milestone can't run the bar up near 100 and stall there.
  const creepCeiling = value > 0 ? value + (100 - value) * 0.3 : 0;

  const ceiling = Math.min(95, Math.max(value, creepCeiling, timeCeiling));
  const next    = prev + (ceiling - prev) * 0.08;
  // Monotonic: a bar that goes backwards looks like a failure, even when the
  // underlying estimate legitimately revised downward.
  return Math.max(prev, next);
}

/**
 * @param {object}  opts
 * @param {boolean} opts.active       true while the generation is running
 * @param {number}  opts.value        last reported real milestone, 0-100
 * @param {number}  opts.estimateSec  rough expected duration, used before any
 *                                    milestone is reported (single-call flows
 *                                    like DLL never report one at all)
 * @returns {number} integer 0-100 to render
 */
export function useSmoothProgress({ active, value = 0, estimateSec = 60 }) {
  const [display, setDisplay] = useState(0);

  // Read inside the ticker without making it a dependency — otherwise every
  // milestone would tear down and restart the interval, resetting the clock.
  const valueRef    = useRef(value);
  const estimateRef = useRef(estimateSec);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { estimateRef.current = estimateSec; }, [estimateSec]);

  // Restart at 0 for each new run. Done during render rather than in an effect
  // so the bar never paints a stale percentage from the previous attempt for a
  // frame — which looked like the retry had instantly jumped ahead.
  const [prevActive, setPrevActive] = useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    if (active) setDisplay(0);
  }

  useEffect(() => {
    if (!active) return undefined;
    const startedAt = Date.now();

    const id = setInterval(() => {
      setDisplay(prev => nextProgress(prev, {
        value:       valueRef.current,
        elapsedSec:  (Date.now() - startedAt) / 1000,
        estimateSec: estimateRef.current,
      }));
    }, 80);

    return () => clearInterval(id);
  }, [active]);

  return Math.round(display);
}

export default useSmoothProgress;
