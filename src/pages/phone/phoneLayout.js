/**
 * phoneLayout.js — sizes measured on the screen, so nothing hides behind the bottom bar or the
 * chat box whatever the phone's size, the text size or the display size (Settings).
 */
import { useEffect, useRef, useState } from 'react';

/** [ref, height in px] of an element, kept up to date as it changes size. */
export function useBoxHeight() {
  const ref = useRef(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, h];
}

/**
 * [ref, top in px] of an element from the top of the page: what is above it (the header, a
 * note) may change size. A hidden element (another tab) keeps the last top it had.
 */
export function useTopOffset() {
  const ref = useRef(null);
  const [top, setTop] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width || r.height) setTop(Math.round(r.top + window.scrollY));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(document.body);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return [ref, top];
}
