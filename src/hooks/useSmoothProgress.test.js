import { describe, it, expect } from 'vitest';
import { nextProgress } from './useSmoothProgress';

/** Run the curve forward, sampling the displayed value once per second. */
function run({ milestones = [], totalSec, estimateSec }) {
  const TICK = 0.08;
  let display = 0;
  const samples = [];
  for (let t = 0; t < totalSec; t += TICK) {
    let value = 0;
    for (const [at, v] of milestones) if (t >= at) value = v;
    display = nextProgress(display, { value, elapsedSec: t, estimateSec });
    samples.push({ t, display });
  }
  return { final: display, samples };
}

const at = (samples, sec) => samples.find(s => s.t >= sec)?.display ?? 0;

describe('nextProgress', () => {
  it('never goes backwards, even when a milestone reports lower than the creep', () => {
    // The creep runs ahead to ~40% off a 15% milestone; a later 20% milestone
    // must not yank the bar back down.
    const { samples } = run({ milestones: [[0, 15], [30, 20]], totalSec: 60, estimateSec: 120 });
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].display).toBeGreaterThanOrEqual(samples[i - 1].display);
    }
  });

  it('never reaches 100 on its own — only a real 100 milestone completes it', () => {
    // Ten minutes with no completion signal must still not claim to be done.
    const { final } = run({ totalSec: 600, estimateSec: 60 });
    expect(final).toBeLessThan(96);

    const done = nextProgress(80, { value: 100, elapsedSec: 5, estimateSec: 60 });
    expect(done).toBe(100);
  });

  it('keeps moving through a long gap between milestones (the COT case)', () => {
    // COT reports 5 -> 15 and then nothing until 85. The bar used to sit frozen
    // at 15% for the entire AI call; it must visibly advance instead.
    const { samples } = run({ milestones: [[0, 5], [2, 15]], totalSec: 120, estimateSec: 150 });
    const t30 = at(samples, 30);
    const t60 = at(samples, 60);
    const t90 = at(samples, 90);

    expect(t30).toBeGreaterThan(15);          // moved past the stale milestone
    expect(t60).toBeGreaterThan(t30 + 3);     // still climbing
    expect(t90).toBeGreaterThan(t60 + 3);
  });

  it('advances with no milestones at all (the DLL single-call case)', () => {
    const { samples } = run({ totalSec: 70, estimateSec: 70 });
    expect(at(samples, 10)).toBeGreaterThan(5);
    expect(at(samples, 30)).toBeGreaterThan(at(samples, 10));
    expect(at(samples, 60)).toBeGreaterThan(at(samples, 30));
  });

  it('lets a real milestone overtake the creep immediately', () => {
    // Creep off 15% tops out around 40%; an 85% milestone must win outright.
    const crept = run({ milestones: [[0, 15]], totalSec: 40, estimateSec: 300 }).final;
    expect(crept).toBeLessThan(60);
    expect(nextProgress(crept, { value: 85, elapsedSec: 40, estimateSec: 300 })).toBeGreaterThan(crept);
  });

  it('decelerates rather than advancing linearly', () => {
    const { samples } = run({ totalSec: 90, estimateSec: 60 });
    const first30 = at(samples, 30) - at(samples, 0);
    const last30  = at(samples, 90) - at(samples, 60);
    expect(first30).toBeGreaterThan(last30);
  });
});
