import { describe, it, expect, afterEach } from 'vitest';
import { getPlatform, isDesk, isMobile, isWeb } from './platform.js';

const hadWindow = 'window' in globalThis;
const originalWindow = globalThis.window;

afterEach(() => {
  if (hadWindow) globalThis.window = originalWindow;
  else delete globalThis.window;
});

describe('platform', () => {
  it('is the website when there is no window (node / SSR)', () => {
    delete globalThis.window;
    expect(getPlatform()).toBe('web');
  });
  it('is the website in a plain browser', () => {
    globalThis.window = {};
    expect(getPlatform()).toBe('web');
    expect(isWeb()).toBe(true);
    expect(isDesk()).toBe(false);
    expect(isMobile()).toBe(false);
  });
  it('is KaTuroDesk when the Electron bridge is present', () => {
    globalThis.window = { katuroDeskApi: {} };
    expect(getPlatform()).toBe('desk');
    expect(isDesk()).toBe(true);
  });
  it('is the phone app when Capacitor runs natively', () => {
    globalThis.window = { Capacitor: { isNativePlatform: () => true } };
    expect(getPlatform()).toBe('mobile');
    expect(isMobile()).toBe(true);
  });
  it('is the website when Capacitor is loaded but not native (browser preview)', () => {
    globalThis.window = { Capacitor: { isNativePlatform: () => false } };
    expect(getPlatform()).toBe('web');
  });
  it('is the website when the Capacitor bridge throws', () => {
    globalThis.window = { Capacitor: { isNativePlatform: () => { throw new Error('x'); } } };
    expect(getPlatform()).toBe('web');
  });
});
