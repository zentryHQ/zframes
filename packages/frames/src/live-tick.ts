import { useEffect, useRef, type RefObject } from "react";

/**
 * Shared infrastructure for the live-accumulating liveline frames (price-liveline,
 * portfolio-value, price-chart) so a dashboard with many of them stays cheap.
 *
 * Two concerns, both modelled on the `use-countdown.ts` precedent (one global
 * tick + viewport gating) but adapted to feed React state rather than write the
 * DOM directly:
 *
 *  - {@link onHeartbeat} collapses what used to be one `setInterval(…, 1000)` PER
 *    frame into a SINGLE module-level 1 Hz ticker that fans out to every
 *    registered appender. 20 live frames = 1 timer, not 20.
 *  - {@link useVisibilityRef} hands a frame an IntersectionObserver-backed
 *    `visibleRef` so its appender can SKIP the per-tick `setState` (and the
 *    re-render it triggers) while the card is scrolled off-screen. Paired with
 *    liveline's own off-screen RAF freeze, an off-screen live frame costs ~nothing.
 *    rootMargin keeps it ~200px ahead of scroll so it's warm before it's seen.
 */

const heartbeatCbs = new Set<() => void>();
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Register `cb` to run on the shared 1 Hz heartbeat; returns an unregister fn.
 * The single underlying interval starts on the first registration and stops when
 * the last one unregisters, so an idle dashboard holds no timer.
 */
export function onHeartbeat(cb: () => void): () => void {
  heartbeatCbs.add(cb);
  if (heartbeatTimer === undefined && typeof window !== "undefined") {
    heartbeatTimer = setInterval(() => {
      // Snapshot so a callback that unregisters mid-tick can't perturb iteration.
      for (const fn of [...heartbeatCbs]) fn();
    }, 1_000);
  }
  return () => {
    heartbeatCbs.delete(cb);
    if (heartbeatCbs.size === 0 && heartbeatTimer !== undefined) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
  };
}

/**
 * An IntersectionObserver-backed visibility flag for a frame's root element.
 * Attach `ref` to the outer element; read `visibleRef.current` (a ref, so it
 * never triggers a render) in hot paths to gate per-tick work. Defaults to
 * `true` so a freshly-mounted in-view frame works before the observer's first
 * async callback (and on platforms without IntersectionObserver).
 */
export function useVisibilityRef<T extends HTMLElement>(
  rootMargin = "200px",
): {
  ref: RefObject<T | null>;
  visibleRef: RefObject<boolean>;
} {
  const ref = useRef<T | null>(null);
  const visibleRef = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) visibleRef.current = entry.isIntersecting;
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return { ref, visibleRef };
}
