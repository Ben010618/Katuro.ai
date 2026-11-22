import { afterEach, describe, expect, it } from 'vitest';
import { applyLook, cleanLook, DEFAULT_LOOK, displayScale, isDark, loadLook, LOOK_KEY, saveLook, textScale } from './phoneLook';

// A stand-in for <html> (the tests run without a browser page).
function fakeRoot() {
  const props = {};
  const attrs = {};
  return {
    style: { fontSize: '', colorScheme: '', setProperty: (k, v) => { props[k] = v; }, getPropertyValue: (k) => props[k] ?? '' },
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: (k) => attrs[k] ?? null,
  };
}

afterEach(() => localStorage.clear());

describe('phoneLook', () => {
  it('cleans unknown values back to the defaults', () => {
    expect(cleanLook(null)).toEqual(DEFAULT_LOOK);
    expect(cleanLook({ text: 'huge', display: 'larger', theme: 'purple' })).toEqual({ text: 'normal', display: 'larger', theme: 'system' });
  });

  it('saves and loads the look on the phone', () => {
    expect(loadLook()).toEqual(DEFAULT_LOOK);
    saveLook({ text: 'largest', display: 'large', theme: 'dark' });
    expect(loadLook()).toEqual({ text: 'largest', display: 'large', theme: 'dark' });
    localStorage.setItem(LOOK_KEY, '{not json');
    expect(loadLook()).toEqual(DEFAULT_LOOK);
  });

  it('dark follows the choice, or the phone for "Like my phone"', () => {
    expect(isDark({ theme: 'dark' }, false)).toBe(true);
    expect(isDark({ theme: 'light' }, true)).toBe(false);
    expect(isDark({ theme: 'system' }, true)).toBe(true);
    expect(isDark({ theme: 'system' }, false)).toBe(false);
  });

  it('puts the sizes and the theme on the page', () => {
    const look = { text: 'largest', display: 'larger', theme: 'dark' };
    expect(textScale(look)).toBe(1.3);
    expect(displayScale(look)).toBe(1.2);
    const root = fakeRoot();
    expect(applyLook(look, root)).toBe(true);
    expect(root.style.fontSize).toBe('120%');
    expect(root.style.getPropertyValue('--kt-fs')).toBe('1.3');
    expect(root.style.getPropertyValue('--kt-px')).toBe('1.56');
    expect(root.getAttribute('data-phone-dark')).toBe('true');
    applyLook({ ...DEFAULT_LOOK, theme: 'light' }, root);
    expect(root.style.fontSize).toBe('100%');
    expect(root.getAttribute('data-phone-dark')).toBe('false');
  });
});
