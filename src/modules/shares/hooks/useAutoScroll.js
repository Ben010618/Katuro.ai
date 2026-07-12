import { useEffect, useRef } from 'react';

const SPEED_PX_PER_SEC = 26;             // slow, readable pace
const PAUSE_AFTER_INTERACTION_MS = 3000; // resume this long after the user last touched/scrolled manually

/**
 * Walk up from `el` to find the nearest ancestor that both is set up to
 * scroll (overflow-y auto/scroll) AND currently has room to (scrollHeight >
 * clientHeight). AppShell's <main> carries overflow-y:auto but its outer
 * shell uses minHeight (not height): once the feed is taller than one
 * screen, the whole shell stretches to fit it and <main> grows right along,
 * so it never actually gains scroll room — the real scrolling element ends
 * up being the document. The capacity check is what steers past that
 * dead end to document.scrollingElement; callers must re-run this live
 * (not just once at mount) since capacity only appears once layout settles.
 */
function findScrollParent(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    if (node.scrollHeight > node.clientHeight) {
      const { overflowY } = window.getComputedStyle(node);
      if (overflowY === 'auto' || overflowY === 'scroll') return node;
    }
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

    let rafId = null;
    let lastTime = null;
    let container = null;
    let scrollPos = 0; // sub-pixel accumulator — scrollTop itself rounds to an integer, so
                        // adding ~0.4px/frame (26px/s @ 60fps) straight to it never moves

    function pauseThenResume() {
      pausedRef.current = true;
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => { pausedRef.current = false; }, PAUSE_AFTER_INTERACTION_MS);
    }

    function attach(el) {
      el.addEventListener('wheel',      pauseThenResume, { passive: true });
      el.addEventListener('touchstart', pauseThenResume, { passive: true });
      el.addEventListener('pointerdown',pauseThenResume, { passive: true });
    }
    function detach(el) {
      el.removeEventListener('wheel',       pauseThenResume);
      el.removeEventListener('touchstart',  pauseThenResume);
      el.removeEventListener('pointerdown', pauseThenResume);
    }

    function step(ts) {
      if (lastTime == null) lastTime = ts;
      const dt = Math.min((ts - lastTime) / 1000, 0.1); // clamp so a backgrounded-tab gap doesn't jump-scroll
      lastTime = ts;

      // Re-resolve while there's no confirmed scrollable container yet — layout
      // (avatars/images, or content simply not having grown past one screen)
      // can settle well after mount, so a one-shot lookup can miss it.
      if (!container || container.scrollHeight <= container.clientHeight) {
        const next = findScrollParent(anchorRef.current);
        if (next !== container) {
          if (container) detach(container);
          container = next;
          attach(container);
          scrollPos = container.scrollTop;
        }
      }

      if (container && container.scrollHeight > container.clientHeight) {
        if (pausedRef.current) {
          scrollPos = container.scrollTop; // track the user's manual scroll so resuming doesn't jump
        } else {
          const atBottom = scrollPos + container.clientHeight >= container.scrollHeight - 2;
          if (!atBottom) {
            scrollPos += SPEED_PX_PER_SEC * dt;
            container.scrollTop = scrollPos;
          }
        }
      }
      rafId = requestAnimationFrame(step);
    }
    rafId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      if (container) detach(container);
    };
  }, [enabled, anchorRef]);
}
