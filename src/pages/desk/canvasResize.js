// Width of the Document Canvas (right panel), dragged by the divider like a VS Code split.

export const CANVAS_DEFAULT_WIDTH = 460;
export const CANVAS_MIN_WIDTH = 320;
export const CHAT_MIN_WIDTH = 380;
const STORAGE_KEY = 'kt-desk-canvas-width';

/** Keeps the canvas between its minimum and what leaves the chat at least CHAT_MIN_WIDTH. */
export function clampCanvasWidth(width, maxWidth) {
  const w = Number.isFinite(width) ? width : CANVAS_DEFAULT_WIDTH;
  const max = Number.isFinite(maxWidth) ? Math.max(CANVAS_MIN_WIDTH, maxWidth) : Infinity;
  return Math.round(Math.min(Math.max(w, CANVAS_MIN_WIDTH), max));
}

export function loadCanvasWidth() {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return n >= CANVAS_MIN_WIDTH ? n : CANVAS_DEFAULT_WIDTH;
  } catch {
    return CANVAS_DEFAULT_WIDTH;
  }
}

export function saveCanvasWidth(width) {
  try { localStorage.setItem(STORAGE_KEY, String(Math.round(width))); } catch { /* storage blocked — width resets next start */ }
}
