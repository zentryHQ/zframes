import { useCallback, useRef } from "react";
import { prefersReducedMotion } from "./utils";

/**
 * How long after a chart's first real draw an intro may still (re)start.
 *
 * Long enough to absorb the burst of re-renders that immediately follows first
 * paint, short enough that a data poll minutes later never re-animates.
 */
const INTRO_WINDOW_MS = 1000;

/**
 * Gate for a chart's one-time intro animation.
 *
 * Returns a predicate to call from inside the draw effect, **after** its
 * early-return guards: it answers "should this draw animate in?".
 *
 * It is a grace *window* rather than a one-shot flag because these draw effects
 * re-run for reasons that have nothing to do with new data. Callers routinely
 * pass a freshly-built array — `colors={slices.map((s) => s.color)}` is the
 * house style — so the effect fires again on every parent render, and React's
 * StrictMode (which the runtime enables) invokes it twice on mount in dev. A
 * one-shot flag is burned by that second run, and because these effects open
 * with `svg.selectAll("*").remove()`, the run that burns the flag also wipes
 * the marks the intro was animating: the intro gets scheduled and then
 * destroyed before a single frame of it is seen. The window instead lets the
 * intro restart across that burst and settle once the renders quiesce.
 *
 * The window opens at the first *successful* draw rather than at mount, because
 * most of these charts bail out for a while waiting on dimensions, colours or
 * data — measured from mount it would often expire before the chart ever had
 * anything to animate.
 *
 * The predicate's identity is stable, so listing it in a draw effect's dep array
 * is a no-op rather than a re-render trigger.
 */
export function useChartIntro(): () => boolean {
  const openedAt = useRef<number | null>(null);

  return useCallback(() => {
    // Checked per call, not at mount: never open the window under reduce, so a
    // later draw cannot inherit a window it should not have had.
    if (prefersReducedMotion()) return false;
    const now = Date.now();
    if (openedAt.current === null) {
      openedAt.current = now;
      return true;
    }
    return now - openedAt.current < INTRO_WINDOW_MS;
  }, []);
}
