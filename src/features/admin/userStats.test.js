import { describe, it, expect } from 'vitest';
import { userStats, isActiveAccount } from './userStats';

const future = { toDate: () => new Date(Date.now() + 30 * 86400000) };
const past = { toDate: () => new Date(Date.now() - 86400000) };

describe('admin Users cards', () => {
  it('Total counts every account; Active only those who can use kaTuro now; Subscribed only paid plans in effect', () => {
    const teachers = [
      { id: 'a', disabled: false },                                                 // active, free
      { id: 'b', disabled: false, access: { mode: 'subscription', subscriptionUntil: future } }, // active, subscribed
      { id: 'c', disabled: false, access: { mode: 'subscription', subscriptionUntil: past } },   // active, subscription ended
      { id: 'd', disabled: true },                                                  // switched off by an admin
      { id: 'e', disabled: true, pendingApproval: true },                           // waiting for approval
      { id: 'f', disabled: true, deactivatedForInactivityAt: { seconds: 1 } },      // inactive, pending deletion
      { id: 'g', disabled: false, deactivatedForInactivityAt: { seconds: 1 } },     // flag left behind: not active
    ];
    expect(userStats(teachers)).toEqual({ total: 7, active: 3, subscribed: 1 });
    expect(['a', 'b', 'c'].every((id) => isActiveAccount(teachers.find((t) => t.id === id)))).toBe(true);
    expect(userStats(undefined)).toEqual({ total: 0, active: 0, subscribed: 0 });
  });

  it('deleting accounts lowers Total at once (the list is live)', () => {
    const before = [{ id: 'a' }, { id: 'f', disabled: true, deactivatedForInactivityAt: { seconds: 1 } }];
    const after = before.filter((t) => !t.deactivatedForInactivityAt);
    expect(userStats(before).total - userStats(after).total).toBe(1);
    expect(userStats(before).active).toBe(userStats(after).active);   // a deactivated account was never "active"
  });
});
