import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Ported from zhive's `useCountdown` (Zentry's own IP) — the owner's optimized
 * live-readout renderer, reused here for the `clock` frame.
 *
 * Why it's shaped this way: instead of one timer per clock, a single global
 * 24fps interval drives every registered callback, and each callback writes
 * straight to its node's textContent (no React re-render per frame). It's also
 * viewport-gated — a clock scrolled off-screen costs nothing — using cached
 * scroll/resize values so the hot path never touches layout.
 */

/** HH:MM:SS:cs (centisecond precision). */
export function formatCountdownCs(ms: number): string {
  const totalSeconds = ms / 1_000;
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = (ms % 60) * 1000;

  const pad = (n: number): string => String(n).padStart(2, "0");

  return `${pad(hours)}:${pad(minutes)}:${pad(Math.floor(seconds))}:${pad(
    Number(milliseconds.toString().substring(0, 2)),
  )}`;
}

interface UseCountdownOptions {
  ref: RefObject<HTMLElement | null>;
  getRemainingMs: () => number;
  format: (ms: number) => string;
  enabled?: boolean;
}

let _cachedScrollY = typeof window !== "undefined" ? window.scrollY : 0;
let _cachedInnerHeight = typeof window !== "undefined" ? window.innerHeight : 0;

let timeoutId: number | undefined = undefined;
if (typeof window !== "undefined") {
  window.addEventListener(
    "scroll",
    () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      timeoutId = window.setTimeout(() => {
        _cachedScrollY = window.scrollY;
      }, 200);
    },
    { passive: true },
  );
  window.addEventListener(
    "resize",
    () => {
      _cachedInnerHeight = window.innerHeight;
    },
    { passive: true },
  );
}

const globalTick = {
  _callbacks: [] as (() => void)[],
  register(x: () => void) {
    this._callbacks.push(x);
  },
  unregister(x: () => void) {
    this._callbacks = this._callbacks.filter((y) => y !== x);
  },
  tick() {
    const fps = 24; // movie fps, more than enough!
    setInterval(() => {
      this._callbacks.forEach((x) => x());
    }, 1000 / fps);
  },
};
if (typeof window !== "undefined") globalTick.tick();

export function useCountdown({
  ref,
  getRemainingMs,
  format,
}: UseCountdownOptions): void {
  const callbacksRef = useRef({ getRemainingMs, format });
  callbacksRef.current = { getRemainingMs, format };
  const elementTop = useRef(0);

  useLayoutEffect(() => {
    const observe = () => {
      if (!ref.current) return;
      elementTop.current =
        ref.current.getBoundingClientRect().top + window.scrollY;
    };
    observe();
    window.addEventListener("resize", observe);
    return () => {
      window.removeEventListener("resize", observe);
    };
  }, [ref]);

  useEffect(() => {
    const act = () => {
      if (!ref.current) return;
      const absTop = elementTop.current - _cachedScrollY;
      if (absTop > _cachedInnerHeight) return;
      if (absTop < 0) return;

      const remaining = callbacksRef.current.getRemainingMs();
      if (ref.current) {
        ref.current.textContent = callbacksRef.current.format(remaining);
      }
    };
    globalTick.register(act);
    return () => {
      globalTick.unregister(act);
    };
  }, [ref]);
}
