/**
 * userStats.js — the Users cards on the admin dashboard, counted one exact way.
 *   Total:      every account in the database (teachers/*)
 *   Active:     used kaTuro in the last 30 days (signed in or used any feature) and the
 *               account is switched on — the same usage the green/orange activity colors show
 *   Subscribed: on a paid plan that is in effect (planInfo decides, same as the rest of the app)
 */
import { planInfo } from '../../services/plans';

export const ACTIVE_DAYS = 30;

/** The account is switched on: not disabled, not waiting for approval, not deactivated for inactivity. */
export function isEnabledAccount(t) {
  return Boolean(t) && !t.disabled && !t.pendingApproval && !t.deactivatedForInactivityAt;
}

const ms = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : v instanceof Date ? v.getTime() : 0);

/**
 * Used kaTuro in the last 30 days: seen in the recent usage logs (recentUids), or the
 * account's last-active time (kept up to date by the server) is within 30 days.
 */
export function isActiveUser(t, { recentUids = new Set(), now = Date.now() } = {}) {
  if (!isEnabledAccount(t)) return false;
  return recentUids.has(t.id) || now - ms(t.lastActiveAt) <= ACTIVE_DAYS * 86400000;
}

/**
 * What the Total Users records are, each account in exactly one group (they add up to Total):
 *   waiting:          deactivated for inactivity, in the 30-day grace before deletion
 *   turnedOff:        switched off by an admin
 *   awaitingApproval: signed up, not approved yet
 *   switchedOn:       everyone else
 * deletableIds: the waiting accounts an admin may delete now (never an admin, never yourself).
 */
export function recordBreakdown(teachers = [], { selfUid = '' } = {}) {
  const out = { switchedOn: 0, waiting: 0, turnedOff: 0, awaitingApproval: 0, deletableIds: [] };
  for (const t of Array.isArray(teachers) ? teachers : []) {
    if (!t) continue;
    if (t.deactivatedForInactivityAt) {
      out.waiting += 1;
      if (!t.isAdmin && t.id !== selfUid) out.deletableIds.push(t.id);
    } else if (t.pendingApproval) out.awaitingApproval += 1; // also switched off until approved
    else if (t.disabled) out.turnedOff += 1;
    else out.switchedOn += 1;
  }
  return out;
}

export function userStats(teachers = [], opts = {}) {
  const list = Array.isArray(teachers) ? teachers : [];
  return {
    total: list.length,
    active: list.filter((t) => isActiveUser(t, opts)).length,
    subscribed: list.filter((t) => planInfo(t).plan === 'subscription').length,
  };
}
