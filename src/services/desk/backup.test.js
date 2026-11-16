import { describe, it, expect } from 'vitest';
import { backupDue, backupAge } from './backup.js';

const now = new Date('2026-11-16T12:00:00').getTime();
const daysAgo = (n) => ({ at: new Date(now - n * 86400000).toISOString() });

describe('backup reminder', () => {
  it('reminds when there is no backup, or the last one is older than 7 days', () => {
    expect(backupDue(null, now)).toBe(true);
    expect(backupDue({}, now)).toBe(true);
    expect(backupDue(daysAgo(8), now)).toBe(true);
    expect(backupDue(daysAgo(6), now)).toBe(false);
  });

  it('says how long ago the last backup was', () => {
    expect(backupAge(null, now)).toBe('never');
    expect(backupAge(daysAgo(0), now)).toBe('today');
    expect(backupAge(daysAgo(1), now)).toBe('yesterday');
    expect(backupAge(daysAgo(9), now)).toBe('9 days ago');
  });
});
