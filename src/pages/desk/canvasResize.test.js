import { describe, it, expect, beforeEach } from 'vitest';
import { clampCanvasWidth, loadCanvasWidth, saveCanvasWidth, CANVAS_DEFAULT_WIDTH, CANVAS_MIN_WIDTH } from './canvasResize';

describe('Document Canvas width (draggable divider)', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* no storage */ } });

  it('never narrower than the minimum, never wider than the room left for the chat', () => {
    expect(clampCanvasWidth(100, 900)).toBe(CANVAS_MIN_WIDTH);
    expect(clampCanvasWidth(700, 900)).toBe(700);
    expect(clampCanvasWidth(1200, 900)).toBe(900);
    expect(clampCanvasWidth(600.6, Infinity)).toBe(601);
  });

  it('on a very small window the minimum still wins (the chat scrolls instead)', () => {
    expect(clampCanvasWidth(500, 120)).toBe(CANVAS_MIN_WIDTH);
  });

  it('bad values fall back to the default width', () => {
    expect(clampCanvasWidth(NaN, 900)).toBe(CANVAS_DEFAULT_WIDTH);
    expect(clampCanvasWidth(undefined)).toBe(CANVAS_DEFAULT_WIDTH);
  });

  it('remembers the width on this PC', () => {
    expect(loadCanvasWidth()).toBe(CANVAS_DEFAULT_WIDTH);
    saveCanvasWidth(640.4);
    expect(loadCanvasWidth()).toBe(640);
    localStorage.setItem('kt-desk-canvas-width', 'junk');
    expect(loadCanvasWidth()).toBe(CANVAS_DEFAULT_WIDTH);
  });
});
