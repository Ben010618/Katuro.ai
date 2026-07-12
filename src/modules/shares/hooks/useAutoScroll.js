import { useEffect, useRef } from 'react';

const SPEED_PX_PER_SEC = 26;             // slow, readable pace
const PAUSE_AFTER_INTERACTION_MS = 3000; // resume this long after the user last touched/scrolled manually

/**
 * Walk up from `el` to find the nearest ancestor set up to scroll (overflow-y
 * auto/scroll). Matches purely on the CSS rule rather than the *current*
 * scrollHeight/clientHeight — at mount time layout (avatars, images) can
 * still be settling, so a live-content check here can false-negative and
 * fall back to an ancestor that never actually scrolls in this app's
 * fixed-viewport shell.
 */
function findScrollParent(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

/**
 * Slowly auto-scrolls the nearest scrollable ancestor of `anchorRef.current` while `enabled`.
 * Pauses whenever the user scrolls/touches/drags manually, resuming a few seconds after they
 * stop. Stops on its own once the bottom of the container is reached.
 */
export function useAutoScroll(anchorRef, enabled) {
  const pausedRef   = useRef(false);
  const resumeTimer = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const container = findScrollParent(anchorRef.current);
    if (!container) return undefined;

    let rafId = null;
    let lastTime = null;

    function pauseThenResume() {
      pausedRef.current = true;
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => { pausedRef.current = false; }, PAUSE_AFTER_INTERACTION_MS);
    }

    function step(ts) {
      if (lastTime == null) lastTime = ts;
      const dt = Math.min((ts - lastTime) / 1000, 0.1); // clamp so a backgrounded-tab gap doesn't jump-scroll
      lastTime = ts;

      if (!pausedRef.current) {
        const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 2;
        if (!atBottom) container.scrollTop += SPEED_PX_PER_SEC * dt;
      }
      rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);

    container.addEventListener('wheel',      pauseThenResume, { passive: true });
    container.addEventListener('touchstart', pauseThenResume, { passive: true });
    container.addEventListener('pointerdown',pauseThenResume, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      container.removeEventListener('wheel',       pauseThenResume);
      container.removeEventListener('touchstart',  pauseThenResume);
      container.removeEventListener('pointerdown', pauseThenResume);
    };
  }, [enabled, anchorRef]);
}
