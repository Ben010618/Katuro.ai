import { describe, it, expect } from 'vitest';
import { planInfo, planStatusText, PLAN_LIMITS } from './plans';

const NOW = new Date('2026-10-03T10:00:00+08:00');
const ts = (iso) => ({ toDate: () => new Date(iso) });

describe('planInfo', () => {
  it('defaults to Free (new accounts, legacy accounts without access)', () => {
    expect(planInfo({}, false, NOW)).toMatchObject({ plan: 'free', mode: 'free', label: 'Free' });
    expect(planInfo(null, false, NOW).plan).toBe('free');
    expect(planStatusText(planInfo({}, false, NOW))).toBe('Free plan');
  });

  it('active subscription with an end date, and the 7-day renewal window', () => {
    const p = planInfo({ access: { mode: 'subscription', subscriptionUntil: ts('2027-06-30T23:59:59+08:00') } }, false, NOW);
    expect(p).toMatchObject({ plan: 'subscription', expired: false, expiringSoon: false });
    expect(planStatusText(p)).toBe('Subscription until June 30, 2027');
    const soon = planInfo({ access: { mode: 'subscription', subscriptionUntil: ts('2026-10-08T23:59:59+08:00') } }, false, NOW);
    expect(soon).toMatchObject({ plan: 'subscription', expiringSoon: true, daysLeft: 6 });
  });

  it('expired subscription falls back to Free', () => {
    const p = planInfo({ access: { mode: 'subscription', subscriptionUntil: ts('2026-09-30T23:59:59+08:00') } }, false, NOW);
    expect(p).toMatchObject({ plan: 'free', mode: 'subscription', expired: true });
    expect(planStatusText(p)).toMatch(/^Subscription ended September 30, 2026/);
  });

  it('subscription without an end date never expires', () => {
    expect(planInfo({ access: { mode: 'subscription', subscriptionUntil: null } }, false, NOW)).toMatchObject({ plan: 'subscription', daysLeft: null, expiringSoon: false });
  });

  it('the global free-for-everyone switch gives Subscription limits', () => {
    const p = planInfo({}, true, NOW);
    expect(p).toMatchObject({ plan: 'subscription', freeForAll: true, label: 'Free for everyone' });
  });

  it('Free limits never exceed Subscription limits', () => {
    for (const row of PLAN_LIMITS) expect(row.free).toBeLessThanOrEqual(row.subscription);
  });
});

describe('display limits match the server', () => {
  it('PLAN_LIMITS mirrors FREE_DAILY_LIMITS / DAILY_LIMITS in functions/index.js', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf-8');
    const block = (name) => {
      const m = src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\r?\\n\\};`));
      return Object.fromEntries([...m[1].matchAll(/^\s*([a-z_]+):\s*(\d+)/gm)].map((x) => [x[1], Number(x[2])]));
    };
    const full = { ...block('DAILY_LIMITS'), ...block('PROXY_LIMITS') };
    const free = block('FREE_DAILY_LIMITS');
    for (const row of PLAN_LIMITS) {
      expect(full[row.action], `${row.action} subscription`).toBe(row.subscription);
      expect(free[row.action], `${row.action} free`).toBe(row.free);
    }
  });
});
