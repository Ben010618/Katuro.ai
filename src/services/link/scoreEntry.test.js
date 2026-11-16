import { describe, it, expect, beforeEach } from 'vitest';
import { parseEntry, checkEntries, queueRecording, queuedRecordings, sendQueued, cacheClass, cachedClasses } from './scoreEntry.js';

const CLS = {
  learners: [
    { lrn: '136512340001', name: 'Dela Cruz, Juan P.', sex: 'M', row: 11 },
    { lrn: '136512340002', name: 'Reyes, Pedro A.', sex: 'M', row: 12 },
    { lrn: '136512340003', name: 'Santos, Maria L.', sex: 'F', row: 14 },
  ],
  scores: { ww1: { '136512340003': 18 } },
};

beforeEach(() => localStorage.clear());

describe('typing scores on the phone', () => {
  it('reads numbers, blanks and "absent"', () => {
    expect(parseEntry('18')).toEqual({ kind: 'score', score: 18 });
    expect(parseEntry('17,5')).toEqual({ kind: 'score', score: 17.5 });
    expect(parseEntry(' ')).toEqual({ kind: 'blank' });
    expect(parseEntry('abs')).toEqual({ kind: 'absent' });
    expect(parseEntry('1o')).toEqual({ kind: 'bad' });
  });

  it('checks every score before sending: out of range, missing papers, changes to scores in the file', () => {
    const c = checkEntries(CLS, 'ww1', 20, { '136512340001': '19', '136512340002': '25', '136512340003': '17' });
    expect(c.invalid).toEqual([expect.objectContaining({ name: 'Reyes, Pedro A.', why: 'must be from 0 to 20' })]);
    expect(c.changes).toEqual([{ lrn: '136512340003', name: 'Santos, Maria L.', before: 18, after: 17 }]);
    expect(c.ready).toBe(false);

    const ok = checkEntries(CLS, 'ww1', 20, { '136512340001': '19', '136512340002': 'a' });
    expect(ok.ready).toBe(true);
    expect(ok.scores).toEqual([{ lrn: '136512340001', score: 19 }]);
    expect(ok.absent.map((l) => l.name)).toEqual(['Reyes, Pedro A.']);
    // Maria already has a score in the file, so she is not a missing paper.
    expect(ok.missing).toEqual([]);
  });

  it('needs the highest possible score', () => {
    expect(checkEntries(CLS, 'ww2', '', { '136512340001': '5' }).ready).toBe(false);
  });
});

describe('recordings kept on the phone while KaTuroDesk is off', () => {
  const item = { id: 'q1', path: 'Records/Grade 7 - Rizal - Science.xlsx', column: 'ww1', hps: 20, scores: [{ lrn: '136512340001', score: 19 }] };

  it('waits while unreachable, then is sent once and removed', async () => {
    queueRecording(item);
    const off = { request: async () => { throw Object.assign(new Error('off'), { code: 'UNREACHABLE' }); } };
    expect(await sendQueued(off)).toMatchObject({ unreachable: true, sent: [] });
    expect(queuedRecordings()).toHaveLength(1);

    const calls = [];
    const on = { request: async (op, args) => { calls.push([op, args.id]); return { ok: true, written: 1 }; } };
    const res = await sendQueued(on);
    expect(res.sent).toHaveLength(1);
    expect(calls).toEqual([['record', 'q1']]);
    expect(queuedRecordings()).toEqual([]);
  });

  it('a recording KaTuroDesk refuses stays on the phone with the reason', async () => {
    queueRecording(item);
    const refuses = { request: async () => { throw Object.assign(new Error('1 learner(s) already have a score in WW 1.'), { code: 'CONFLICTS' }); } };
    const res = await sendQueued(refuses);
    expect(res.failed).toHaveLength(1);
    expect(queuedRecordings()[0].error).toMatch(/already have a score/);
  });

  it('class lists are kept for typing offline', () => {
    cacheClass('Records/A.xlsx', CLS);
    expect(cachedClasses().classes['Records/A.xlsx'].learners).toHaveLength(3);
  });
});

describe('attendance waits on the phone too', () => {
  it('is sent with its own request', async () => {
    queueRecording({ id: 'att1', op: 'attendance', args: { path: 'Records/A.xlsx', date: '2026-11-16', marks: { '136512340001': 'A' } }, className: 'A', columnLabel: 'Attendance' });
    const calls = [];
    await sendQueued({ request: async (op, args) => { calls.push([op, args]); return { ok: true }; } });
    expect(calls).toEqual([['attendance', { path: 'Records/A.xlsx', date: '2026-11-16', marks: { '136512340001': 'A' }, id: 'att1' }]]);
  });
});
