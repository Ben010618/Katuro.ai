import { describe, it, expect, beforeEach } from 'vitest';
import { setPin, checkPin, hasPin, forgetPin, validPin, shouldLock, LOCK_KEY, MAX_TRIES, WAIT_MS, LOCK_AFTER_MS } from './appLock.js';

beforeEach(() => localStorage.clear());

describe('the KaTuro App PIN lock', () => {
  it('keeps only a salted hash, and opens with the right PIN only', async () => {
    expect(hasPin()).toBe(false);
    expect(validPin('12')).toBe(false);
    expect(validPin('1234')).toBe(true);
    await expect(setPin('12a4')).rejects.toThrow(/4 to 6 numbers/);
    await setPin('2468');
    expect(hasPin()).toBe(true);
    expect(localStorage.getItem(LOCK_KEY)).not.toContain('2468');
    expect((await checkPin('2468')).ok).toBe(true);
    expect(await checkPin('1111')).toMatchObject({ ok: false, left: MAX_TRIES - 1 });
  });

  it('after 5 wrong PINs the teacher waits 30 seconds, then the right PIN works again', async () => {
    await setPin('2468');
    const t = 1_000_000;
    for (let i = 0; i < MAX_TRIES - 1; i++) await checkPin('0000', t);
    expect(await checkPin('0000', t)).toMatchObject({ ok: false, waitMs: WAIT_MS });
    expect(await checkPin('2468', t + 1000)).toMatchObject({ ok: false, waitMs: WAIT_MS - 1000 });
    expect((await checkPin('2468', t + WAIT_MS + 1)).ok).toBe(true);
  });

  it('locks again after 5 minutes away; forgetting the PIN removes it', async () => {
    expect(shouldLock(0, 10)).toBe(false);
    expect(shouldLock(1000, 1000 + LOCK_AFTER_MS - 1)).toBe(false);
    expect(shouldLock(1000, 1000 + LOCK_AFTER_MS)).toBe(true);
    await setPin('1234');
    forgetPin();
    expect(hasPin()).toBe(false);
  });
});
