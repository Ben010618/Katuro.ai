import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ZOOM_STEPS, cleanZoom, nextZoom, zoomKeyDirection } = require('../electron/windowZoom.cjs');

describe('KaTuroDesk screen size (zoom)', () => {
  it('steps bigger and smaller, and stops at the ends', () => {
    expect(nextZoom(1, 'in')).toBe(1.1);
    expect(nextZoom(1, 'out')).toBe(0.9);
    expect(nextZoom(2, 'in')).toBe(2);
    expect(nextZoom(0.67, 'out')).toBe(0.67);
    expect(nextZoom(1.5, 'reset')).toBe(1);
    expect(nextZoom(1.25, 'sideways')).toBe(1.25);
  });

  it('a saved or asked-for size is always one of the steps', () => {
    expect(cleanZoom(1.26)).toBe(1.25);
    expect(cleanZoom(9)).toBe(2);
    expect(cleanZoom(0.1)).toBe(0.67);
    for (const bad of [undefined, null, 'big', NaN, Infinity, {}]) expect(cleanZoom(bad)).toBe(1);
    expect(ZOOM_STEPS).toContain(1);
  });

  it('only Ctrl + / Ctrl − / Ctrl 0 key presses zoom', () => {
    const key = (k, extra = {}) => zoomKeyDirection({ type: 'keyDown', key: k, control: true, ...extra });
    expect(key('=')).toBe('in');
    expect(key('+')).toBe('in');
    expect(key('-')).toBe('out');
    expect(key('0')).toBe('reset');
    expect(key('a')).toBeNull();
    expect(key('=', { control: false })).toBeNull();
    expect(key('=', { alt: true })).toBeNull();
    expect(key('=', { type: 'keyUp' })).toBeNull();
    expect(zoomKeyDirection(null)).toBeNull();
  });
});
