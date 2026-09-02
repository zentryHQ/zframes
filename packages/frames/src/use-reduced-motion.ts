import { useSyncExternalStore } from "react";

/**
 * `prefers-reduced-motion: reduce` as LIVE React state.
 *
 * `@zframes/charts`' `prefersReducedMotion()` is a one-shot read, which is
 * right inside a D3 draw callback (it runs again on every redraw) and wrong in
 * a component: sampled at mount it can never see the user flip the setting, so
 * a card that was already on screen keeps animating for the rest of the
 * session. This subscribes to the query instead, so a flip re-renders every
 * frame that asked.
 *
 * A single module-level `MediaQueryList` with N subscribers, not N queries: a
 * board mounts dozens of frames and `matchMedia` is not free. SSR-safe (false
 * on the server, and in a jsdom without the API).
 *
 * For a purely decorative CSS animation prefer the media query itself (see
 * `marquee.tsx`) — it needs no JS at all. This hook is for motion driven from
 * JS: a timer, a shuffle, an interval-driven slideshow.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

let query: MediaQueryList | null | undefined;

function mediaQuery(): MediaQueryList | null {
  if (query === undefined) {
    query =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(QUERY)
        : null;
  }
  return query;
}

function subscribe(onChange: () => void): () => void {
  const mq = mediaQuery();
  if (!mq) return () => {};
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** A boolean is its own stable snapshot, so no caching is needed here. */
function getSnapshot(): boolean {
  return mediaQuery()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

/** True while the user has asked for reduced motion. Re-renders on a change. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
