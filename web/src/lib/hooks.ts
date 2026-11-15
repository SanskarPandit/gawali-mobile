import { useEffect, useRef, useState } from 'react';

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Milliseconds until `target`, corrected for the gap between the device clock and the server clock. */
export function useCountdown(targetIso: string | undefined, serverNowIso: string | undefined) {
  const skew = useRef(0);
  useEffect(() => {
    if (serverNowIso) skew.current = new Date(serverNowIso).getTime() - Date.now();
  }, [serverNowIso]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!targetIso) return 0;
  return new Date(targetIso).getTime() - (now + skew.current);
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Press-and-hold detection that leaves a normal tap alone. */
export function useLongPress(onLong: () => void, onTap: () => void, ms = 480) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => timer.current && clearTimeout(timer.current);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(12);
        onLong();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: () => {
      clear();
      if (!fired.current && start.current) onTap();
      start.current = null;
    },
    onPointerLeave: () => {
      clear();
      start.current = null;
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clear();
      if (!fired.current) {
        fired.current = true;
        onLong();
      }
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (e.shiftKey) onLong();
        else onTap();
      }
    },
  };
}
