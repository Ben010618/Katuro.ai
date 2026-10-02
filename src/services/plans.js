/**
 * plans.js — KaTuro access plans (replaces the old token currency).
 *
 * Every teacher is on the Free plan unless an admin grants a Subscription
 * (optionally with an end date). The admin's global "free for everyone" switch
 * gives everybody Subscription-level limits during promos.
 * The server (functions/index.js → effectivePlan / FREE_DAILY_LIMITS) is the
 * authority; this file mirrors it for display only — keep the two in sync.
 */

export const PLAN_LABELS = { free: 'Free', subscription: 'Subscription' };

/** Daily AI limits per feature (action = server usage key). Mirrors functions/index.js. */
export const PLAN_LIMITS = [
  { action: 'ilaw_unpack', feature: 'Lesson plans (ILAW)', free: 5, subscription: 20 },
  { action: 'dll_gen', feature: 'Daily Lesson Logs', free: 3, subscription: 10 },
  { action: 'cot_gen', feature: 'COT lesson plans', free: 3, subscription: 15 },
  { action: 'quiz_gen', feature: 'Quizzes', free: 4, subscription: 20 },
  { action: 'test_builder_items', feature: 'Test Builder items', free: 20, subscription: 60 },
  { action: 'action_research_ai', feature: 'Action Research AI', free: 10, subscription: 30 },
  { action: 'gamification_gen', feature: 'Game worksheets', free: 4, subscription: 10 },
  { action: 'expand_slides', feature: 'Slide decks (full expand)', free: 2, subscription: 5 },
  { action: 'desk_agent_run', feature: 'KaTuroDesk requests', free: 15, subscription: 50 },
  { action: 'scan_answer_sheet', feature: 'Answer-sheet scans', free: 80, subscription: 80 },
  { action: 'protect_chat', feature: 'KaTuro Protect chat', free: 40, subscription: 40 },
];

const toDate = (v) => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Plan details for a teacher profile.
 * @returns {{ plan, mode, until, daysLeft, expired, expiringSoon, freeForAll, label }}
 */
export function planInfo(profile, freeForAll = false, now = new Date()) {
  const access = profile?.access || {};
  const mode = access.mode === 'subscription' ? 'subscription' : 'free';
  const until = mode === 'subscription' ? toDate(access.subscriptionUntil) : null;
  const expired = Boolean(until && until.getTime() < now.getTime());
  const daysLeft = until ? Math.ceil((until.getTime() - now.getTime()) / 86400000) : null;
  const plan = freeForAll || (mode === 'subscription' && !expired) ? 'subscription' : 'free';
  const expiringSoon = mode === 'subscription' && !expired && daysLeft !== null && daysLeft <= 7;
  let label = PLAN_LABELS[plan];
  if (freeForAll && mode !== 'subscription') label = 'Free for everyone';
  return { plan, mode, until, daysLeft, expired, expiringSoon, freeForAll: Boolean(freeForAll), label };
}

export function formatPlanDate(d) {
  return d ? d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
}

/** Short status line, e.g. "Subscription until June 30, 2027". */
export function planStatusText(info) {
  if (info.freeForAll && info.mode !== 'subscription') return 'Free for everyone (promo)';
  if (info.mode === 'subscription' && info.expired) return `Subscription ended ${formatPlanDate(info.until)} — now on Free`;
  if (info.plan === 'subscription') return info.until ? `Subscription until ${formatPlanDate(info.until)}` : 'Subscription';
  return 'Free plan';
}

// The KaTuro Facebook page (same contact the old top-up flow used).
export const SUBSCRIBE_CONTACT_URL = 'https://www.facebook.com/Teachers2ls';

/** Manila calendar date (YYYY-MM-DD) — the key of teachers/{uid}/usage/{date}. */
export function manilaToday(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}
