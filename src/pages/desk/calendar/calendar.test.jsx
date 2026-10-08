import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SCHOOL_ACTIVITIES, OBSERVANCES, activitiesOn, monthObservances, holidayOn, upcomingActivities, nthWeekday,
} from '../../../services/desk/knowledge/depedActivities';
import { CALENDARS } from '../../../services/desk/knowledge/schoolCalendar';
import {
  alarmAtMs, ringingAlarms, missedAlarms, eventProblem, eventsOn, formatTime, RING_LIMIT_MS,
} from './reminders';

const titles = (list) => list.map((a) => a.title);

describe('official SY 2026–2027 calendar (DO 9, s. 2026, Annex B)', () => {
  it('has the dated school activities of each term', () => {
    expect(titles(activitiesOn('2026-09-09').school)).toEqual(expect.arrayContaining(['End-of-Term Block', 'PTA Meeting & Distribution of Report Cards']));
    expect(titles(activitiesOn('2026-10-07').school)).toEqual(expect.arrayContaining(['Term 2: First Teacher-made Summative Test', 'NAT for Grade 10']));
    expect(titles(activitiesOn('2026-12-15').school)).toContain('PTA Meeting & Distribution of Progress/Performance Report');
    expect(titles(activitiesOn('2027-04-08').school)).toEqual(expect.arrayContaining(['End of Term 3', 'PTA Meeting & Distribution of Report Cards']));
    expect(titles(activitiesOn('2027-04-02').school)).toContain('INSET');                 // "2 & 5"
    expect(titles(activitiesOn('2027-04-03').school)).not.toContain('INSET');
    expect(titles(activitiesOn('2027-03-29').school)).toContain('End-of-Term Block');     // "24, 29, 30, & 31"
    expect(titles(activitiesOn('2027-03-25').school)).toContain('Maundy Thursday');
  });

  it('marks holidays with their type', () => {
    expect(holidayOn('2026-12-25')).toMatchObject({ title: 'Christmas Day', holiday: 'Regular Holiday' });
    expect(holidayOn('2026-11-02')).toMatchObject({ holiday: 'Additional Special Non-Working Holiday' });
    expect(holidayOn('2026-10-08')).toBeNull();
  });

  it('every entry has a valid date inside the calendar the order covers', () => {
    for (const a of SCHOOL_ACTIVITIES) {
      const dates = a.days || [a.start, a.end || a.start];
      for (const d of dates) expect(d, a.title).toMatch(/^202[67]-\d{2}-\d{2}$/);
      if (a.end) expect(a.end >= a.start, a.title).toBe(true);
    }
    // The term dates match the summary already used by the AI (p. 27).
    const t = CALENDARS['2026-2027'].terms;
    expect(titles(activitiesOn(t[1].start).school)).toContain('Start of Term 2');
    expect(titles(activitiesOn(t[2].end).school)).toContain('End of Term 3');
  });

  it('lists what is coming, including an activity already in progress', () => {
    const up = upcomingActivities('2026-10-06', 3).map((u) => `${u.iso} ${u.activity.title}`);
    expect(up).toContain('2026-10-06 NAT for Grade 10');                      // runs Oct 5–9
    expect(up).toContain('2026-10-07 Term 2: First Teacher-made Summative Test');
  });
});

describe('legislated activities and celebrations (Annex D)', () => {
  it('dated observances appear on their day; week-only ones are listed for the month', () => {
    expect(titles(activitiesOn('2026-10-05').observances)).toEqual(expect.arrayContaining(["World Teachers' Day", "National Teachers' Day"]));
    expect(titles(activitiesOn('2026-10-20').observances)).toContain('United Nations Week');
    expect(titles(activitiesOn('2026-10-01', { includeMonthLong: true }).observances)).toContain('National Scouting Month');
    expect(titles(activitiesOn('2026-10-01').observances)).not.toContain('National Scouting Month'); // month-long hidden by default
    expect(titles(monthObservances(2026, 10))).toEqual(expect.arrayContaining(['National Scouting Month', 'ADHD Awareness Week']));
  });

  it('works out the nth weekday the order names (e.g. 3rd Saturday of September)', () => {
    expect(nthWeekday(2026, 9, 3, 6)).toBe(19);
    expect(titles(activitiesOn('2026-09-19').observances)).toContain('International Coastal Clean-up Day');
    expect(nthWeekday(2027, 2, 2, 2)).toBe(9);                                  // 2nd Tuesday of Feb 2027
    expect(titles(activitiesOn('2027-02-09').observances)).toContain('Safer Internet Day for Children Philippines');
  });

  it('cross-month observances span both months', () => {
    expect(titles(activitiesOn('2026-09-30').observances)).toContain("National Teachers' Month");
    expect(titles(activitiesOn('2026-10-05').observances)).toContain("National Teachers' Month");
    expect(titles(activitiesOn('2026-12-10').observances)).toContain('18-day Campaign to End Violence Against Women (VAW)');
  });

  it('every observance names its legal basis', () => {
    for (const o of OBSERVANCES) expect(o.basis, o.title).toBeTruthy();
    expect(OBSERVANCES.length).toBeGreaterThan(100);
  });
});

describe('my schedules and alarms', () => {
  const ev = (over = {}) => ({ id: 'e1', title: 'Submit SF2', date: '2026-10-08', time: '07:30', note: '', remindMinutes: 10, doneAt: null, snoozeUntil: null, ...over });
  const at = (iso) => new Date(iso).getTime();

  it('rings at the reminder time and keeps ringing until dismissed (up to the limit)', () => {
    expect(alarmAtMs(ev())).toBe(at('2026-10-08T07:20:00'));
    expect(ringingAlarms([ev()], at('2026-10-08T07:19:59'))).toHaveLength(0);
    expect(ringingAlarms([ev()], at('2026-10-08T07:20:00'))).toHaveLength(1);
    expect(ringingAlarms([ev()], at('2026-10-08T07:40:00'))).toHaveLength(1);  // still ringing
    expect(ringingAlarms([ev({ doneAt: 1 })], at('2026-10-08T07:40:00'))).toHaveLength(0);
    const end = at('2026-10-08T07:20:00') + RING_LIMIT_MS;
    expect(ringingAlarms([ev()], end)).toHaveLength(0);
    expect(missedAlarms([ev()], end)).toHaveLength(1);                         // rang out: missed
  });

  it('snooze moves the alarm; notes without a reminder never ring', () => {
    const snoozed = ev({ snoozeUntil: at('2026-10-08T07:30:00') });
    expect(ringingAlarms([snoozed], at('2026-10-08T07:25:00'))).toHaveLength(0);
    expect(ringingAlarms([snoozed], at('2026-10-08T07:30:00'))).toHaveLength(1);
    expect(ringingAlarms([ev({ remindMinutes: null })], at('2026-10-08T07:30:00'))).toHaveLength(0);
    expect(ringingAlarms([ev({ time: '' })], at('2026-10-08T07:30:00'))).toHaveLength(0);
  });

  it('checks what the teacher typed', () => {
    expect(eventProblem(ev())).toBe('');
    expect(eventProblem(ev({ title: '  ' }))).toMatch(/title/);
    expect(eventProblem(ev({ date: '' }))).toMatch(/date/);
    expect(eventProblem(ev({ time: '' }))).toMatch(/reminder needs a time/);
    expect(eventProblem(ev({ time: '', remindMinutes: null }))).toBe('');      // an all-day note is fine
  });

  it('lists a day in time order, notes last; shows 12-hour times', () => {
    const list = eventsOn([ev({ id: 'a', time: '13:00' }), ev({ id: 'b', time: '' }), ev({ id: 'c', time: '07:05' })], '2026-10-08');
    expect(list.map((e) => e.id)).toEqual(['c', 'a', 'b']);
    expect([formatTime('07:05'), formatTime('13:00'), formatTime('00:15'), formatTime('12:00')]).toEqual(['7:05 AM', '1:00 PM', '12:15 AM', '12:00 PM']);
  });
});

describe('calendar panel', () => {
  it('renders the month, the legend and the source', async () => {
    const { default: DeskCalendarPanel } = await import('./DeskCalendarPanel');
    const html = renderToStaticMarkup(<DeskCalendarPanel onClose={() => {}} />);
    expect(html).toMatch(/School Calendar/);
    expect(html).toMatch(/Instructional Block/);
    expect(html).toMatch(/DepEd Order No\. 9, s\. 2026, Annex B/);
  });
});
