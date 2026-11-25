// How big KaTuroDesk looks (Ctrl + / Ctrl − / Ctrl 0, Ctrl + mouse wheel, Settings › Screen size).
// The size is remembered on this PC.

const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
const ZOOM_DEFAULT = 1;

/** A saved or asked-for size, kept to one of the steps (anything odd → 100%). */
function cleanZoom(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return ZOOM_DEFAULT;
  return ZOOM_STEPS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), ZOOM_DEFAULT);
}

/** The size one step bigger ('in'), one step smaller ('out'), or back to 100% ('reset'). */
function nextZoom(current, direction) {
  if (direction === 'reset') return ZOOM_DEFAULT;
  const i = ZOOM_STEPS.indexOf(cleanZoom(current));
  if (direction === 'in') return ZOOM_STEPS[Math.min(i + 1, ZOOM_STEPS.length - 1)];
  if (direction === 'out') return ZOOM_STEPS[Math.max(i - 1, 0)];
  return cleanZoom(current);
}

/** Which way a Ctrl key press zooms, or null when it is not a zoom key. */
function zoomKeyDirection(input) {
  if (!input || input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return null;
  if (input.key === '=' || input.key === '+') return 'in';
  if (input.key === '-' || input.key === '_') return 'out';
  if (input.key === '0') return 'reset';
  return null;
}

module.exports = { ZOOM_STEPS, ZOOM_DEFAULT, cleanZoom, nextZoom, zoomKeyDirection };
