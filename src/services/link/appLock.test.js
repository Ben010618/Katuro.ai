import { describe, it, expect, beforeEach } from 'vitest';
import { setPin, checkPin, hasPin, forgetPin, validPin, shouldLock, LOCK_KEY, MAX_TRIES, MAX_ROUNDS, WAIT_MS, LOCK_AFTER_MS } from './appLock.js';

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

describe('the wait grows with each round of wrong PINs', () => {
  it('30 seconds, then 1 minute, then 2 minutes', async () => {
    await setup2468();
    let t = 5_000_000;
    const round = async () => { let r; for (let i = 0; i < MAX_TRIES; i++) r = await checkPin('0000', t); return r.waitMs; };
    expect(await round()).toBe(WAIT_MS);
    t += WAIT_MS + 1;
    expect(await round()).toBe(WAIT_MS * 2);
    t += WAIT_MS * 2 + 1;
    expect(await round()).toBe(WAIT_MS * 4);
    t += WAIT_MS * 4 + 1;
    expect((await checkPin('2468', t)).ok).toBe(true);
    // A right PIN starts the count again.
    expect(await round()).toBe(WAIT_MS);
  });
});

describe('changing the phone clock does not get around the PIN', () => {
  it('a clock moved back waits one round, not until the old clock time', async () => {
    await setup2468();
    const t = 9_000_000_000;
    for (let i = 0; i < MAX_TRIES; i++) await checkPin('0000', t);
    // The clock is moved back a year: still only the normal 30 seconds.
    const back = t - 365 * 24 * 3600 * 1000;
    expect(await checkPin('2468', back)).toMatchObject({ ok: false, waitMs: WAIT_MS });
    expect((await checkPin('2468', back + WAIT_MS + 1)).ok).toBe(true);
  });

  it('a clock moved forward each time: after 50 wrong PINs the phone signs out', async () => {
    await setup2468();
    let t = 1_000;
    let last;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      for (let i = 0; i < MAX_TRIES; i++) last = await checkPin('0000', t);
      t += 10 * 24 * 3600 * 1000; // jump past any wait
    }
    expect(last).toEqual({ ok: false, wipe: true });
    // Even the right PIN does not open it now: only signing out (Forgot the PIN).
    expect(await checkPin('2468', t)).toEqual({ ok: false, wipe: true });
  });
});

async function setup2468() {
  localStorage.clear();
  await setPin('2468');
}
