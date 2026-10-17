import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDeskStore } from '../../../store/deskStore';
import { CALENDAR_TOOLS, scheduleSummary, dayLabel, DEFAULT_REMIND } from './calendarTools';
import { scheduleQuestion } from './scheduleQuestion';
import { fastRoute } from './fastRoute';
import { TOOLS } from './registry';
import { needsConfirmation } from './deskAgent';

// Tuesday, 2026-10-20, 9:00 AM local time (an ordinary school day of SY 2026-2027).
const NOW = new Date(2026, 9, 20, 9, 0).getTime();
const cls = { id: 'c1', subject: 'Science', grade: 'Grade 7', section: 'Rizal', days: [1, 2, 3, 4, 5], start: '10:00', end: '11:00' };
const run = (tool, args) => CALENDAR_TOOLS[tool].run(args);

describe('the teacher asks about and changes their schedule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    useDeskStore.setState({ calendarEvents: [], myClasses: [], lessonSequences: {}, teachingLog: { noClass: [], noClassFor: {}, repeat: {} }, scheduledTasks: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('the three tools are in the planner catalog; changing an entry asks first when the planner is unsure', () => {
    expect(TOOLS.my_schedule && TOOLS.add_calendar_event && TOOLS.change_calendar_event).toBeTruthy();
    expect(needsConfirmation([{ tool: 'change_calendar_event' }])).toBe(true);
    expect(needsConfirmation([{ tool: 'add_calendar_event' }])).toBe(false);
  });

  it('adds a timed entry with the 10-minute reminder (said in the reply), and does not add it twice', async () => {
    const r = await run('add_calendar_event', { title: 'Parent meeting', date: '2026-10-23', time: '15:00' });
    expect(r.reply).toBe('Added to your calendar: Parent meeting, Friday, October 23 at 3:00 PM. I will remind you 10 minutes before (say another time if you prefer).');
    expect(useDeskStore.getState().calendarEvents).toMatchObject([{ title: 'Parent meeting', date: '2026-10-23', time: '15:00', remindMinutes: DEFAULT_REMIND }]);
    const again = await run('add_calendar_event', { title: 'parent meeting', date: '2026-10-23', time: '15:00' });
    expect(again.summary).toBe('already in your calendar');
    expect(useDeskStore.getState().calendarEvents).toHaveLength(1);
  });

  it('an all-day entry has no reminder; the reminder the teacher said is kept', async () => {
    await run('add_calendar_event', { title: 'Submit grades', date: '2026-10-21' });
    await run('add_calendar_event', { title: 'LAC session', date: '2026-10-21', time: '13:00', remindMinutes: 60 });
    const [a, b] = useDeskStore.getState().calendarEvents;
    expect([a.time, a.remindMinutes]).toEqual(['', null]);
    expect(b.remindMinutes).toBe(60);
  });

  it('never guesses: no day, no title, a past day or a bad time is asked about', async () => {
    const ask = async (args) => { try { await run('add_calendar_event', args); return null; } catch (e) { return e; } };
    expect((await ask({ title: 'Meeting' })).code).toBe('NEEDS_INFO');
    expect((await ask({ date: '2026-10-23' })).message).toMatch(/call this/);
    expect((await ask({ title: 'Meeting', date: '2026-10-19' })).message).toMatch(/already passed/);
    expect((await ask({ title: 'Meeting', date: '2026-10-20', time: '08:00' })).message).toMatch(/already passed/);
    expect((await ask({ title: 'Meeting', date: '2026-10-23', time: '3pm' })).message).toMatch(/valid time/);
    expect(useDeskStore.getState().calendarEvents).toHaveLength(0);
  });

  it('moves an entry (it rings again at the new time), renames it, and cancels it', async () => {
    await run('add_calendar_event', { title: 'Parent meeting', date: '2026-10-23', time: '15:00' });
    const id = useDeskStore.getState().calendarEvents[0].id;
    useDeskStore.getState().updateCalendarEvent(id, { doneAt: 1 });
    const moved = await run('change_calendar_event', { title: 'parent meeting', newTime: '16:00' });
    expect(moved.reply).toBe('Updated: Parent meeting, Friday, October 23 at 4:00 PM, reminder 10 minutes before.');
    expect(useDeskStore.getState().calendarEvents[0]).toMatchObject({ id, time: '16:00', doneAt: null, remindMinutes: 10 });
    await run('change_calendar_event', { date: '2026-10-23', newTitle: 'Meeting with parents' });
    expect(useDeskStore.getState().calendarEvents[0].title).toBe('Meeting with parents');
    const gone = await run('change_calendar_event', { title: 'meeting with parents', cancel: true });
    expect(gone.reply).toMatch(/^Removed from your calendar: Meeting with parents/);
    expect(useDeskStore.getState().calendarEvents).toHaveLength(0);
  });

  it('asks which one when the title fits several entries or none', async () => {
    await run('add_calendar_event', { title: 'Meeting with the principal', date: '2026-10-22', time: '08:00' });
    await run('add_calendar_event', { title: 'Meeting with parents', date: '2026-10-23', time: '15:00' });
    await expect(run('change_calendar_event', { title: 'meeting', cancel: true })).rejects.toThrow(/Which one\?/);
    await expect(run('change_calendar_event', { title: 'Seminar', cancel: true })).rejects.toThrow(/couldn't find "Seminar"/);
    await expect(run('change_calendar_event', {})).rejects.toThrow(/Which calendar entry/);
    expect(useDeskStore.getState().calendarEvents).toHaveLength(2);
  });

  it("the schedule is built from the teacher's own data: classes, own entries and scheduled jobs", async () => {
    useDeskStore.setState({
      myClasses: [cls],
      lessonSequences: { c1: { items: [{ text: 'Parts of a cell', sessions: 2 }], startDate: '2026-10-20' } },
      scheduledTasks: [{ id: 't', name: 'Weekly attendance check', enabled: true, nextRunAt: new Date(2026, 9, 20, 16, 0).getTime() }],
    });
    await run('add_calendar_event', { title: 'Faculty meeting', date: '2026-10-20', time: '14:00' });
    const r = await run('my_schedule', {});
    expect(r.reply).toBe('Today (Tuesday, October 20): Classes: 10:00 AM Science 7 – Rizal (Parts of a cell (session 1 of 2)). Your schedule: 2:00 PM Faculty meeting (reminder 10 minutes before). KaTuroDesk will run: 4:00 PM Weekly attendance check. School calendar: End of Testing Window for MOSY Assessments (CRLA, RMA, Phil-IRI, etc.); United Nations Week.');
    expect(r.summary).toBe('5 items');
    const next = await run('my_schedule', { focus: 'next' });
    expect(next.reply).toBe('Next: Science 7 – Rizal at 10:00 AM: Parts of a cell (session 1 of 2), today.');
  });

  it('says plainly when nothing is scheduled, and when My classes is empty', () => {
    const out = scheduleSummary({ from: '2026-10-21', state: {}, now: NOW, focus: 'events' });
    expect(out).toEqual({ text: 'Nothing scheduled tomorrow: no entries in your calendar.', count: 0 });
    expect(scheduleSummary({ from: '2026-10-21', state: {}, now: NOW }).text).toMatch(/United Nations Week\.\n\(Your classes are not set yet/);
    expect(scheduleSummary({ from: '2026-10-21', state: {}, now: NOW, focus: 'classes' }).text).toBe('Nothing scheduled tomorrow: no classes. (Your classes are not set yet: add them in My classes.)');
  });

  it('school calendar days come from the DepEd calendar (a holiday has no classes)', () => {
    // November 1, 2026 is All Saints' Day; November 2 (Monday) is checked for classes.
    const out = scheduleSummary({ from: '2026-11-01', to: '2026-11-02', state: { myClasses: [cls] }, now: NOW, focus: 'school' });
    expect(out.text).toMatch(/Sunday, November 1: School calendar: .*All Saints/);
  });

  it('dates read nicely', () => {
    const today = '2026-10-20';
    expect(dayLabel('2026-10-20', today)).toBe('Today (Tuesday, October 20)');
    expect(dayLabel('2026-10-21', today)).toBe('Tomorrow (Wednesday, October 21)');
    expect(dayLabel('2027-01-04', today)).toBe('Monday, January 4, 2027');
  });
});

describe('quick schedule questions skip the planner', () => {
  const now = new Date(NOW);
  it('today, tomorrow, this week, next week, next class, holidays', () => {
    expect(scheduleQuestion("What's my schedule today?", now)).toEqual({ from: '2026-10-20', to: '2026-10-20', focus: 'all' });
    expect(scheduleQuestion('Ano ang schedule ko bukas?', now)).toEqual({ from: '2026-10-21', to: '2026-10-21', focus: 'all' });
    expect(scheduleQuestion('What classes do I have tomorrow?', now)).toEqual({ from: '2026-10-21', to: '2026-10-21', focus: 'classes' });
    expect(scheduleQuestion('What is my schedule this week?', now)).toEqual({ from: '2026-10-20', to: '2026-10-24', focus: 'all' });
    expect(scheduleQuestion('Any events next week?', now)).toEqual({ from: '2026-10-26', to: '2026-11-01', focus: 'all' });
    expect(scheduleQuestion("What's my next class?", now).focus).toBe('next');
    expect(scheduleQuestion('Are there holidays coming up?', now)).toEqual({ from: '2026-10-20', to: '2026-11-02', focus: 'school' });
  });

  it('commands and lesson questions go to the planner instead', () => {
    for (const t of [
      'Schedule a parent meeting on Friday at 3 PM',
      'Add LAC session to my calendar tomorrow',
      'Move my meeting to 4 PM',
      'Cancel the meeting tomorrow',
      'What activities can I do for fractions?',
      'Make a quiz for my class tomorrow',
      'What is the topic of my class tomorrow about cells?',
      'What is photosynthesis?',
    ]) expect(scheduleQuestion(t, now), t).toBeNull();
  });

  it('fastRoute runs my_schedule with no folder and no planner', () => {
    const r = fastRoute({ prompt: "What's my schedule tomorrow?", persona: 'matt', teacherName: 'Sir Ben', now });
    expect(r).toEqual({ reply: '', tasks: [{ id: 't1', tool: 'my_schedule', args: { from: '2026-10-21', to: '2026-10-21', focus: 'all' }, label: 'My schedule', dependsOn: [] }] });
    expect(fastRoute({ prompt: 'Hello Matt', persona: 'matt', teacherName: 'Sir Ben', now }).local).toBe(true);
  });
});
