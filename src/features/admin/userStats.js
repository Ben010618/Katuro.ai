/**
 * userStats.js — the Users cards on the admin dashboard, counted one exact way.
 *   Total:      every account in the database (teachers/*)
 *   Active:     can use kaTuro right now — switched on, not waiting for approval,
 *               and not deactivated for inactivity
 *   Subscribed: on a paid plan that is in effect (planInfo decides, same as the rest of the app)
 */
import { planInfo } from '../../services/plans';

export function isActiveAccount(t) {
  return Boolean(t) && !t.disabled && !t.pendingApproval && !t.deactivatedForInactivityAt;
}

export function userStats(teachers = []) {
  const list = Array.isArray(teachers) ? teachers : [];
  return {
    total: list.length,
    active: list.filter(isActiveAccount).length,
    subscribed: list.filter((t) => planInfo(t).plan === 'subscription').length,
  };
}
