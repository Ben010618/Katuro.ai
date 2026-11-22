/**
 * phoneLook.js — the KaTuro App's look, chosen in Menu → Settings: text size, display size
 * (everything larger: text, buttons and spacing) and light / dark / like the phone.
 *
 *   text size     → --kt-fs on <html>; phone.css scales the font sizes by it
 *   display size  → <html> font-size (rem): every size in rem grows with it
 *   theme         → <html data-phone-dark="true">: phone.css and the shared colour tokens go dark
 *
 * Kept on the phone (not teacher data: it stays after signing out).
 */
export const LOOK_KEY = 'katuro-phone-look-v1';

export const TEXT_SIZES = [
  { id: 'small', label: 'Small', scale: 0.9 },
  { id: 'normal', label: 'Default', scale: 1 },
  { id: 'large', label: 'Large', scale: 1.15 },
  { id: 'largest', label: 'Largest', scale: 1.3 },
];
export const DISPLAY_SIZES = [
  { id: 'normal', label: 'Default', scale: 1 },
  { id: 'large', label: 'Large', scale: 1.1 },
  { id: 'larger', label: 'Larger', scale: 1.2 },
];
export const THEMES = [
  { id: 'system', label: 'Like my phone' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];
export const DEFAULT_LOOK = { text: 'normal', display: 'normal', theme: 'system' };

const pick = (list, id, fallback) => (list.some((o) => o.id === id) ? id : fallback);

/** A look with every value known (anything else → the default). */
export function cleanLook(look) {
  const l = look && typeof look === 'object' ? look : {};
  return {
    text: pick(TEXT_SIZES, l.text, DEFAULT_LOOK.text),
    display: pick(DISPLAY_SIZES, l.display, DEFAULT_LOOK.display),
    theme: pick(THEMES, l.theme, DEFAULT_LOOK.theme),
  };
}

export function loadLook() {
  try { return cleanLook(JSON.parse(localStorage.getItem(LOOK_KEY) || 'null')); } catch { return { ...DEFAULT_LOOK }; }
}
export function saveLook(look) {
  const clean = cleanLook(look);
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(clean)); } catch { /* storage blocked */ }
  return clean;
}

const phoneDark = () => {
  try { return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches); } catch { return false; }
};
/** Dark for this look? 'system' follows the phone's own dark theme. */
export const isDark = (look, systemDark = phoneDark()) => (look.theme === 'dark' || (look.theme === 'system' && systemDark));

export const textScale = (look) => TEXT_SIZES.find((o) => o.id === look.text)?.scale || 1;
export const displayScale = (look) => DISPLAY_SIZES.find((o) => o.id === look.display)?.scale || 1;

// The status bar is left to Android (it follows the phone's own light/dark theme): the app
// draws below it, so forcing light icons there could leave them white on a white strip.

/** Puts the look on the page. → dark (boolean) */
export function applyLook(look, root = document.documentElement) {
  const l = cleanLook(look);
  const dark = isDark(l);
  root.style.fontSize = `${displayScale(l) * 100}%`;
  root.style.setProperty('--kt-fs', String(textScale(l)));
  // For text sized in px (Messages): both scales.
  root.style.setProperty('--kt-px', String(Math.round(textScale(l) * displayScale(l) * 1000) / 1000));
  root.setAttribute('data-phone-dark', dark ? 'true' : 'false');
  root.style.colorScheme = dark ? 'dark' : 'light';
  const meta = typeof document !== 'undefined' ? document.querySelector('meta[name="theme-color"]') : null;
  if (meta) meta.setAttribute('content', dark ? '#161c19' : '#e8ece9');
  return dark;
}

let stopWatching = null;
/**
 * The saved look, now and whenever the phone switches between light and dark ('system').
 * Called once when the phone app starts and again after each change in Settings.
 */
export function startPhoneLook(look = loadLook()) {
  stopWatching?.();
  stopWatching = null;
  applyLook(look);
  if (look.theme !== 'system') return;
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyLook(look);
    mq.addEventListener('change', onChange);
    stopWatching = () => mq.removeEventListener('change', onChange);
  } catch { /* no matchMedia */ }
}
