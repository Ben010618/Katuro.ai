import { describe, it, expect } from 'vitest';
import { authErrorText } from './authError.js';

describe('sign-in errors in plain words', () => {
  it('known codes get a short sentence', () => {
    expect(authErrorText({ code: 'auth/invalid-credential', message: 'Firebase: Error (auth/invalid-credential).' })).toBe('Wrong email or password.');
    expect(authErrorText({ code: 'auth/network-request-failed' })).toBe('No internet connection.');
  });

  it('other messages lose the Firebase prefix and code; an empty one gets the fallback', () => {
    expect(authErrorText({ message: 'Firebase: Password should be at least 6 characters (auth/weak-password).' })).toBe('Password should be at least 6 characters');
    expect(authErrorText({ message: 'Firebase: Error (auth/internal-error).' }, 'Sign-in failed.')).toBe('Sign-in failed.');
    expect(authErrorText(null, 'Sign-in failed.')).toBe('Sign-in failed.');
  });
});
