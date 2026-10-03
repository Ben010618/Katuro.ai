import { describe, it, expect } from 'vitest';
import {
  computeNextRun,
  validateSchedule,
  describeSchedule,
  createTask,
  updateTask,
  dueTasks,
  waitingForFolder,
  startRun,
  finishRun,
  recoverInterrupted,
  shortName,
} from './schedule';

// Local-time helper: Date(y, monthIndex, d, h, m)
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const day = (ms) => new Date(ms).getDay();

describe('computeNextRun', () => {
  it('once: runs at its time, never again after', () => {
    const s = { repeat: 'once', date: '2026-10-10', time: '16:00' };
    expect(computeNextRun(s, at(2026, 10, 3, 9))).toBe(at(2026, 10, 10, 16));
    expect(computeNextRun(s, at(2026, 10, 10, 16))).toBeNull();
  });

  it('daily: today if the time is still ahead, otherwise tomorrow', () => {
    const s = { repeat: 'daily', date: '2026-10-01', time: '07:30' };
    expect(computeNextRun(s, at(2026, 10, 3, 6))).toBe(at(2026, 10, 3, 7, 30));
    expect(computeNextRun(s, at(2026, 10, 3, 7, 30))).toBe(at(2026, 10, 4, 7, 30));
  });

  it('never runs before the start date', () => {
    const s = { repeat: 'daily', date: '2026-10-20', time: '07:30' };
    expect(computeNextRun(s, at(2026, 10, 3, 9))).toBe(at(2026, 10, 20, 7, 30));
  });

  it('weekdays: Friday afternoon rolls over to Monday', () => {
    const s = { repeat: 'weekdays', date: '2026-10-01', time: '08:00' };
    const fri = at(2026, 10, 9, 15); // Friday
    expect(day(fri)).toBe(5);
    const next = computeNextRun(s, fri);
    expect(day(next)).toBe(1);
    expect(next).toBe(at(2026, 10, 12, 8));
  });

  it('weekly: only on the chosen days', () => {
    const s = { repeat: 'weekly', date: '2026-10-01', time: '16:00', weekdays: [5] };
    const next = computeNextRun(s, at(2026, 10, 3, 9)); // Saturday
    expect(day(next)).toBe(5);
    expect(next).toBe(at(2026, 10, 9, 16));
  });

  it('monthly: short months use their last day', () => {
    const s = { repeat: 'monthly', date: '2026-01-01', time: '09:00', dayOfMonth: 31 };
    expect(computeNextRun(s, at(2026, 2, 1))).toBe(at(2026, 2, 28, 9));
    expect(computeNextRun(s, at(2026, 2, 28, 10))).toBe(at(2026, 3, 31, 9));
    // Far beyond the start date still finds the next month.
    expect(computeNextRun(s, at(2028, 6, 5))).toBe(at(2028, 6, 30, 9));
  });

  it('invalid schedules have no run', () => {
    expect(computeNextRun({ repeat: 'weekly', date: '2026-10-01', time: '08:00', weekdays: [] }, at(2026, 10, 3))).toBeNull();
    expect(computeNextRun({ repeat: 'daily', date: '2026-02-30', time: '08:00' }, at(2026, 1, 1))).toBeNull();
    expect(computeNextRun({ repeat: 'daily', date: '2026-10-01', time: '25:00' }, at(2026, 1, 1))).toBeNull();
  });
});

describe('validateSchedule / describeSchedule', () => {
  const now = at(2026, 10, 3, 9);
  it('rejects a one-time task in the past and incomplete schedules', () => {
    expect(validateSchedule({ repeat: 'once', date: '2026-10-02', time: '08:00' }, { now })).toEqual(['That date and time has already passed.']);
    expect(validateSchedule({ repeat: 'weekly', date: '2026-10-03', time: '08:00', weekdays: [] }, { now })).toEqual(['Pick at least one day of the week.']);
    expect(validateSchedule({ repeat: 'daily', date: '', time: '' }, { now })).toHaveLength(2);
    expect(validateSchedule({ repeat: 'daily', date: '2026-10-03', time: '08:00' }, { now })).toEqual([]);
  });

  it('describes schedules in plain words', () => {
    expect(describeSchedule({ repeat: 'weekdays', time: '07:30' })).toBe('Every weekday (Mon–Fri) at 7:30 AM');
    expect(describeSchedule({ repeat: 'weekly', time: '16:00', weekdays: [5, 1] })).toBe('Every Mon, Fri at 4:00 PM');
    expect(describeSchedule({ repeat: 'monthly', time: '00:15', dayOfMonth: 22 })).toBe('Monthly on the 22nd at 12:15 AM');
  });
});

describe('task lifecycle', () => {
  const now = at(2026, 10, 3, 9);
  const base = { prompt: 'Make the weekly attendance summary', attachedPaths: ['SF2.xlsx', 'SF2.xlsx'], workspaceId: 'C:/Class', workspaceName: 'Class' };

  it('creates a task with its first run and refuses bad input', () => {
    const t = createTask({ ...base, schedule: { repeat: 'weekly', date: '2026-10-03', time: '16:00', weekdays: [5] } }, now);
    expect(t.nextRunAt).toBe(at(2026, 10, 9, 16));
    expect(t.attachedPaths).toEqual(['SF2.xlsx']);
    expect(t.name).toBe('Make the weekly attendance summary');
    expect(() => createTask({ ...base, prompt: ' ', schedule: t.schedule }, now)).toThrow(/what the task should do/);
    expect(() => createTask({ ...base, workspaceId: '', schedule: t.schedule }, now)).toThrow(/classroom folder/);
    expect(() => createTask({ ...base, schedule: { repeat: 'once', date: '2026-10-01', time: '08:00' } }, now)).toThrow(/already passed/);
  });

  it('runs only due tasks of the open folder, once, and records the result', () => {
    const t = createTask({ ...base, schedule: { repeat: 'daily', date: '2026-10-03', time: '10:00' } }, now);
    const later = at(2026, 10, 5, 8); // app was closed for two days: still ONE catch-up run
    expect(dueTasks([t], later, 'C:/Class')).toHaveLength(1);
    expect(dueTasks([t], later, 'D:/Other')).toHaveLength(0);
    expect(waitingForFolder([t], later, 'D:/Other')).toHaveLength(1);

    const running = startRun(t, later);
    expect(running.nextRunAt).toBe(at(2026, 10, 5, 10));
    expect(dueTasks([running], later, 'C:/Class')).toHaveLength(0);

    const done = finishRun(running, { status: 'done', summary: 'Saved summary', startedAt: later, files: ['KaTuro Outputs/a.docx'] });
    expect(done.lastStatus).toBe('done');
    expect(done.runs[0]).toMatchObject({ status: 'done', late: true, scheduledFor: at(2026, 10, 3, 10) });
    expect(done.scheduledFor).toBeUndefined();
  });

  it('a one-time task switches itself off after running', () => {
    const t = createTask({ ...base, schedule: { repeat: 'once', date: '2026-10-03', time: '10:00' } }, now);
    const r = startRun(t, at(2026, 10, 3, 10));
    expect(r.enabled).toBe(false);
    expect(r.nextRunAt).toBeNull();
    expect(() => updateTask(finishRun(r, { status: 'done' }), { enabled: true }, at(2026, 10, 3, 11))).toThrow(/no upcoming run/);
    const rescheduled = updateTask(finishRun(r, { status: 'done' }), { schedule: { repeat: 'once', date: '2026-10-04', time: '10:00' } }, at(2026, 10, 3, 11));
    expect(rescheduled.enabled).toBe(true);
    expect(rescheduled.nextRunAt).toBe(at(2026, 10, 4, 10));
  });

  it('pausing keeps the task; editing a paused task does not resume it', () => {
    const t = createTask({ ...base, schedule: { repeat: 'daily', date: '2026-10-03', time: '10:00' } }, now);
    const paused = updateTask(t, { enabled: false }, now);
    expect(dueTasks([paused], at(2026, 10, 4, 11), 'C:/Class')).toHaveLength(0);
    expect(updateTask(paused, { schedule: { repeat: 'daily', date: '2026-10-03', time: '11:00' } }, now).enabled).toBe(false);
    expect(updateTask(paused, { enabled: true }, now).enabled).toBe(true);
  });

  it('a run cut off by closing the app is shown as interrupted', () => {
    const t = createTask({ ...base, schedule: { repeat: 'daily', date: '2026-10-03', time: '10:00' } }, now);
    const [r] = recoverInterrupted([startRun(t, at(2026, 10, 3, 10))]);
    expect(r.lastStatus).toBe('error');
    expect(r.runs[0].summary).toMatch(/Interrupted/);
  });
});

describe('shortName', () => {
  it('cuts long requests at a word boundary', () => {
    const n = shortName('Every Friday, check the attendance sheet for learners with 3 or more consecutive absences.');
    expect(n).toBe('Every Friday, check the attendance sheet for learners with 3…');
    expect(shortName('Encode all the Grade 10 scores into the official e-Class Record template'), 'never mid-word').toBe('Encode all the Grade 10 scores into the official e-Class…');
    expect(shortName('Short one')).toBe('Short one');
  });
});
