import { describe, it, expect } from 'vitest';
import { reminderNotifications, idFor, classNotifications, classAlertMinutes, setClassAlertMinutes } from './phoneReminders.js';

describe('KaTuroDesk reminders on the phone', () => {
  const now = new Date('2026-11-16T08:00:00').getTime();
  const r = (o) => ({ id: 'a', title: 'Parent meeting', date: '2026-11-17', time: '15:00', remindMinutes: 30, note: '', ...o });

  it('rings at the reminder time, says when the entry is', () => {
    const [n] = reminderNotifications([r()], now);
    expect(n.at.getTime()).toBe(new Date('2026-11-17T14:30:00').getTime());
    expect(n.title).toBe('Parent meeting');
    expect(n.body).toBe('in 30 minutes, at 3:00 PM');
    expect(reminderNotifications([r({ remindMinutes: 0, note: 'Room 4' })], now)[0].body).toBe('at 3:00 PM · Room 4');
    expect(reminderNotifications([r({ remindMinutes: 60 })], now)[0].body).toMatch(/^in 1 hour,/);
    expect(reminderNotifications([r({ remindMinutes: 1440 })], now)[0].body).toMatch(/^tomorrow,/);
  });

  it('leaves out reminders already past, sorts by time, and keeps ids stable and different', () => {
    const list = reminderNotifications([r({ id: 'late', time: '23:00' }), r({ id: 'early', time: '07:00' }), r({ id: 'past', date: '2026-11-16', time: '08:10', remindMinutes: 30 })], now);
    expect(list.map((n) => n.title && n.at.getHours())).toEqual([6, 22]);
    expect(list[0].id).not.toBe(list[1].id);
    expect(reminderNotifications([r()], now)[0].id).toBe(reminderNotifications([r()], now)[0].id);
    expect(idFor('x')).toBeGreaterThan(0);
    expect(idFor('x')).toBeLessThan(2 ** 31);
  });
});

describe('class alerts on the phone', () => {
  const now = new Date('2026-11-16T07:00:00').getTime();
  const days = [
    { date: '2026-11-16', items: [
      { kind: 'class', time: '07:10', title: 'Grade 7 Rizal', detail: 'Cells' },
      { kind: 'class', time: '09:00', title: 'Grade 8 Luna', detail: '' },
      { kind: 'event', time: '10:00', title: 'Meeting' },
      { kind: 'class', time: '', title: 'No time' },
    ] },
    { date: '2026-11-17', items: [{ kind: 'class', time: '07:30', title: 'Grade 7 Rizal' }] },
  ];

  it('rings the chosen minutes before each class, future ones only', () => {
    const list = classNotifications(days, 15, now);
    expect(list.map((n) => n.title)).toEqual(['Grade 8 Luna in 15 minutes', 'Grade 7 Rizal in 15 minutes']);
    expect(list[0].at).toEqual(new Date('2026-11-16T08:45:00'));
    expect(list[0].body).toBe('Class at 9:00 AM');
    expect(classNotifications(days, 5, now)[0].body).toBe('Class at 7:10 AM · Cells');
  });

  it('off rings nothing, and the choice is kept (15 minutes when never chosen)', () => {
    expect(classNotifications(days, 0, now)).toEqual([]);
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    expect(classAlertMinutes()).toBe(15);
    setClassAlertMinutes(0);
    expect(classAlertMinutes()).toBe(0);
    setClassAlertMinutes(30);
    expect(classAlertMinutes()).toBe(30);
  });
});
