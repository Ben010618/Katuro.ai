import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// The desktop window's size and zoom, for a layout that fits any window size.

const deskApi = () => (typeof window !== 'undefined' ? window.katuroDeskApi : undefined);

/** True while the window is at least this many CSS pixels wide (zooming in makes it "narrower"). */
export function useMinWidth(px) {
  const query = `(min-width: ${px}px)`;
  const [wide, setWide] = useState(() => (typeof window === 'undefined' || !window.matchMedia ? true : window.matchMedia(query).matches));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const onChange = () => setWide(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return wide;
}

/** How big KaTuroDesk looks (1 = 100%): follows Ctrl + / −, Ctrl + wheel and Settings › Screen size. */
export function useDeskZoom() {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const api = deskApi();
    if (!api?.getZoom) return undefined;
    let alive = true;
    const take = (z) => { if (alive && Number.isFinite(z) && z > 0) setZoom(z); };
    api.getZoom().then(take).catch(() => {});
    const off = api.onZoom?.(take);
    return () => { alive = false; off?.(); };
  }, []);
  return zoom;
}

// The window reports where its buttons are (Window Controls Overlay); otherwise their
// usual width, which stays the same on screen while the page zooms.
function measureControlsInset(fallbackPx, zoom) {
  const wco = typeof navigator !== 'undefined' ? navigator.windowControlsOverlay : undefined;
  if (wco?.visible) {
    const r = wco.getTitlebarAreaRect();
    if (r && r.width > 0) return Math.max(0, Math.ceil(window.innerWidth - (r.x + r.width)));
  }
  return Math.ceil(fallbackPx / (zoom || 1));
}

/** Room (CSS px) taken at the top right by the window's minimize / maximize / close buttons. */
export function useWindowControlsInset(fallbackPx, zoom) {
  const [inset, setInset] = useState(() => measureControlsInset(fallbackPx, zoom));
  useEffect(() => {
    const update = () => setInset(measureControlsInset(fallbackPx, zoom));
    update();
    const wco = navigator.windowControlsOverlay;
    window.addEventListener('resize', update);
    wco?.addEventListener?.('geometrychange', update);
    return () => {
      window.removeEventListener('resize', update);
      wco?.removeEventListener?.('geometrychange', update);
    };
  }, [fallbackPx, zoom]);
  return inset;
}

/**
 * How tight a bar is: 0 = everything fits, 1 = a little short, 2 = very short (icons only).
 * Each step back is taken once the bar is as wide as that step needed.
 */
export function useBarFit(barRef, maxLevel = 2) {
  const [level, setLevel] = useState(0);
  const needAt = useRef([]);
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === 'undefined') return undefined;
    const check = () => {
      const room = bar.clientWidth;
      if (level > 0 && room >= needAt.current[level - 1]) {
        setLevel(level - 1);
        return;
      }
      if (level >= maxLevel) return;
      const st = getComputedStyle(bar);
      const groups = [...bar.children].filter((g) => g.offsetParent !== null);
      const need = groups.reduce((sum, g) => sum + g.offsetWidth, 0) + 16 * Math.max(0, groups.length - 1)
        + parseFloat(st.paddingLeft) + parseFloat(st.paddingRight);
      if (need > room) {
        needAt.current[level] = need;
        setLevel(level + 1);
      }
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(bar);
    for (const g of bar.children) ro.observe(g);
    return () => ro.disconnect();
  }, [barRef, level, maxLevel]);
  return level;
}
