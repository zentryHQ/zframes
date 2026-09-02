import { useEffect, useState } from "react";
import { prefersReducedMotion } from "./utils";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * `prefers-reduced-motion`, kept LIVE.
 *
 * The one-shot `prefersReducedMotion()` is right inside a draw effect (it is
 * re-read on the next draw) and wrong in a `useState` initialiser or a React
 * render: a component that samples it at mount keeps whatever the setting was
 * then, so turning the preference on never reaches an already-mounted chart —
 * and turning it off never gives back a behaviour that was removed with the
 * animation (the bubble cloud's drag).
 *
 * SSR-safe: `false` on the server and on any host without `matchMedia`, which
 * matches `prefersReducedMotion()`.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const list = window.matchMedia?.(QUERY);
    if (!list) return;
    const sync = () => setReduced(list.matches);
    // Re-synced on subscribe, not just on change: the setting can flip between
    // the initial render and this effect, and StrictMode's remount replays it.
    sync();
    // Safari < 14 exposes only the deprecated addListener/removeListener pair.
    if (typeof list.addEventListener === "function") {
      list.addEventListener("change", sync);
      return () => list.removeEventListener("change", sync);
    }
    list.addListener?.(sync);
    return () => list.removeListener?.(sync);
  }, []);

  return reduced;
}
