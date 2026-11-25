import { describe, it, expect } from 'vitest';
import { MANUAL_MINUTES, pilotSummary, pilotText, TWO_WEEKS_MS } from './pilot.js';
import { CARDS } from './catalog.js';

const routine = (id, enabled) => ({ id, enabled, cards: [] });
const run = (status, steps) => ({ status, routine: { cards: Object.keys(steps).map((id) => ({ id, type: steps[id][0] })) }, steps: Object.fromEntries(Object.entries(steps).map(([id, [, st]]) => [id, { status: st }])) });

describe('how routines are going (pilot summary)', () => {
  it('counts routines, runs, approvals and a rough time estimate; never names or files', () => {
    const now = 10 * TWO_WEEKS_MS;
    const routines = [routine('a', true), routine('b', true), routine('c', false)];
    const meta = { a: { enabledAt: now - TWO_WEEKS_MS - 1 }, b: { enabledAt: now - 1000 } };
    const runs = [
      run('done', { w: ['when.schedule', 'done'], s: ['get.sheet', 'done'], x: ['do.attendance', 'done'] }),
      run('done', { w: ['when.manual', 'done'], k: ['ask.approve', 'approved'], t: ['do.typeScores', 'done'] }),
      run('done', { w: ['when.manual', 'done'], k: ['ask.approve', 'rejected'], t: ['do.typeScores', 'skipped'] }),
      run('error', { w: ['when.manual', 'done'], x: ['do.attendance', 'error'] }),
    ];
    const s = pilotSummary(routines, runs, meta, now);
    expect(s).toMatchObject({ routines: 3, on: 2, onTwoWeeks: 1, runs: 4, finished: 3, stopped: 1, waiting: 0, approved: 1, notApproved: 1, minutes: 35 });
    expect(s.byCard).toEqual([{ type: 'do.attendance', label: 'Find frequent absences', done: 1, minutes: 20 }, { type: 'do.typeScores', label: 'Type scores into my class record', done: 1, minutes: 15 }]);
    const text = pilotText(s);
    expect(text).toContain('Estimated time saved (rough estimate): 35 min');
    expect(text).toContain('counts only, no names');
    expect(pilotText(s, 'fil')).toContain('Tinatayang oras na natipid (magaspang na tantiya): 35 min');
  });

  it('every green card has a manual-time estimate', () => {
    for (const c of CARDS.filter((x) => x.kind === 'do')) expect(MANUAL_MINUTES[c.type], c.type).toBeGreaterThan(0);
  });
});
