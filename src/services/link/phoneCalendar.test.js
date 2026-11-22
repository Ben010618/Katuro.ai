import { describe, it, expect, beforeEach } from 'vitest';
import { monthGrid, monthRange, shiftMonth, monthOf, dayKinds, itemsByDay, mergeDays, saveMonth, loadMonths } from './phoneCalendar.js';

describe('the month calendar on the phone', () => {
  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  });

  it('lays out a month in 6 weeks, Sunday first', () => {
    const g = monthGrid({ year: 2026, month: 11 }); // 1 Nov 2026 is a Sunday
    expect(g).toHaveLength(42);
    expect(g[0]).toEqual({ iso: '2026-11-01', day: 1, inMonth: true });
    expect(g[29]).toEqual({ iso: '2026-11-30', day: 30, inMonth: true });
    expect(g[30]).toEqual({ iso: '2026-12-01', day: 1, inMonth: false });
    const feb = monthGrid({ year: 2027, month: 2 }); // 1 Feb 2027 is a Monday
    expect(feb[0]).toEqual({ iso: '2027-01-31', day: 31, inMonth: false });
    expect(feb[1].iso).toBe('2027-02-01');
  });

  it('asks KaTuroDesk for the whole month, and moves between months and years', () => {
    expect(monthRange({ year: 2026, month: 2 })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange({ year: 2028, month: 2 }).to).toBe('2028-02-29');
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthOf('2026-11-22')).toEqual({ year: 2026, month: 11 });
  });

  it('shows a dot per kind: own events still to do, classes, school days', () => {
    expect(dayKinds([{ kind: 'class' }, { kind: 'event', done: true }, { kind: 'school' }, { kind: 'class' }])).toEqual(['class', 'school']);
    expect(dayKinds([{ kind: 'event' }, { kind: 'task' }])).toEqual(['event']);
    expect(itemsByDay([{ date: '2026-11-22', items: [{ kind: 'event' }] }])).toEqual({ '2026-11-22': [{ kind: 'event' }] });
  });

  it('the newer copy wins for the days both cover', () => {
    const month = { at: '2026-11-20T00:00:00Z', days: [{ date: '2026-12-02', items: [{ kind: 'class' }] }, { date: '2026-12-20', items: [{ kind: 'class' }] }] };
    const recent = { at: '2026-11-25T00:00:00Z', from: '2026-11-25', to: '2026-12-08', days: [{ date: '2026-12-02', items: [{ kind: 'class' }, { kind: 'event' }] }] };
    const days = mergeDays(month, recent);
    expect(days['2026-12-02']).toHaveLength(2); // the event added later is shown
    expect(days['2026-12-20']).toHaveLength(1); // outside the 14 days: the month copy
    // An event removed later: the newer copy has nothing that day.
    expect(mergeDays({ at: '2026-11-01T00:00:00Z', days: [{ date: '2026-12-03', items: [{ kind: 'event' }] }] }, { ...recent, days: [] })['2026-12-03']).toBeUndefined();
    // A newer month copy decides its days: an event removed since the 14-day copy is gone.
    expect(mergeDays({ at: '2026-11-30', from: '2026-12-01', to: '2026-12-31', days: [] }, recent)['2026-12-02']).toBeUndefined();
    // Only one copy: that one.
    expect(mergeDays(null, recent)['2026-12-02']).toHaveLength(2);
    expect(mergeDays(month, null)['2026-12-20']).toHaveLength(1);
  });

  it('keeps the newest four months on the phone for no Wi-Fi', () => {
    for (const k of ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']) saveMonth(k, { days: [] });
    expect(Object.keys(loadMonths()).sort()).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
  });
});
