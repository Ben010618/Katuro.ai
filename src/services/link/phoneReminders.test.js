import { describe, it, expect } from 'vitest';
import { reminderNotifications, idFor } from './phoneReminders.js';

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
