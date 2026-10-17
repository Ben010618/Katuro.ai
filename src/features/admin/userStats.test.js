import { describe, it, expect } from 'vitest';
import { userStats, isActiveUser, isEnabledAccount, recordBreakdown } from './userStats';

const DAY = 86400000;
const now = Date.UTC(2026, 9, 11);
const at = (daysAgo) => ({ toMillis: () => now - daysAgo * DAY });
const future = { toDate: () => new Date(now + 30 * DAY) };
const past = { toDate: () => new Date(now - DAY) };

describe('admin Users cards', () => {
  const teachers = [
    { id: 'a', disabled: false, lastActiveAt: at(2) },                          // used 2 days ago
    { id: 'b', disabled: false, lastActiveAt: at(25), access: { mode: 'subscription', subscriptionUntil: future } },
    { id: 'c', disabled: false, lastActiveAt: at(45) },                         // switched on, but idle 45 days
    { id: 'd', disabled: false },                                               // no last-active time, seen in recent usage logs
    { id: 'e', disabled: false, access: { mode: 'subscription', subscriptionUntil: past } }, // never used, subscription ended
    { id: 'f', disabled: true, lastActiveAt: at(1) },                           // switched off by an admin
    { id: 'g', disabled: true, pendingApproval: true },
    { id: 'h', disabled: true, deactivatedForInactivityAt: { seconds: 1 } },
  ];

  it('Total = every account; Active = used kaTuro in the last 30 days (and switched on); Subscribed = paid plans in effect', () => {
    expect(userStats(teachers, { recentUids: new Set(['d', 'f']), now })).toEqual({ total: 8, active: 3, subscribed: 1 });
    expect(['a', 'b', 'd'].every((id) => isActiveUser(teachers.find((t) => t.id === id), { recentUids: new Set(['d']), now }))).toBe(true);
    expect(isActiveUser(teachers.find((t) => t.id === 'c'), { now })).toBe(false);
    expect(isEnabledAccount(teachers.find((t) => t.id === 'c'))).toBe(true);
    expect(userStats(undefined)).toEqual({ total: 0, active: 0, subscribed: 0 });
  });

  it('the records under Total: every account in exactly one group, adding up to Total', () => {
    const list = [...teachers, { id: 'adm', isAdmin: true, disabled: true, deactivatedForInactivityAt: { seconds: 2 } }, { id: 'p2', disabled: false, pendingApproval: true }];
    const b = recordBreakdown(list, { selfUid: 'a' });
    expect(b).toEqual({ switchedOn: 5, waiting: 2, turnedOff: 1, awaitingApproval: 2, deletableIds: ['h'] });
    expect(b.switchedOn + b.waiting + b.turnedOff + b.awaitingApproval).toBe(userStats(list).total);
    // Never yourself, even if your own account were waiting.
    expect(recordBreakdown([{ id: 'me', deactivatedForInactivityAt: { seconds: 1 } }], { selfUid: 'me' }).deletableIds).toEqual([]);
    expect(recordBreakdown(undefined)).toEqual({ switchedOn: 0, waiting: 0, turnedOff: 0, awaitingApproval: 0, deletableIds: [] });
  });

  it('exactly 30 days ago still counts; 31 does not', () => {
    expect(isActiveUser({ id: 'x', lastActiveAt: at(30) }, { now })).toBe(true);
    expect(isActiveUser({ id: 'x', lastActiveAt: at(31) }, { now })).toBe(false);
  });
});
