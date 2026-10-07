import { describe, it, expect } from 'vitest';
import { isSignupNotice } from './notices';

describe('admin notifications', () => {
  it('only real sign-ups show as "New Registration"', () => {
    expect(isSignupNotice({ type: 'new_user', email: 'ana@deped.gov.ph', givenName: 'Ana' })).toBe(true);
    expect(isSignupNotice({ email: 'old@deped.gov.ph' })).toBe(true); // older sign-ups had no type
    // The nightly cleanup report has no name or email: it is a system notice, not a sign-up.
    expect(isSignupNotice({ type: 'inactivity_cleanup', message: 'Inactivity cleanup: 2 account(s) deactivated' })).toBe(false);
    expect(isSignupNotice({ message: 'something' })).toBe(false);
    expect(isSignupNotice(null)).toBe(false);
  });
});
