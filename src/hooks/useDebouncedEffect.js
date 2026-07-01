import { useEffect, useRef } from 'react';

// Runs `effect` `delay`ms after the last change to `deps`. Skips the very first
// mount so loading/creating a session doesn't immediately trigger a redundant save.
export function useDebouncedEffect(effect, deps, delay = 500) {
  const isFirst = useRef(true);
  const effectRef = useRef(effect);
  effectRef.current = effect;

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    const handle = setTimeout(() => effectRef.current(), delay);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
