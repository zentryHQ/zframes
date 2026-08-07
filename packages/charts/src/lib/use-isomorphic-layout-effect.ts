import { useEffect, useLayoutEffect } from "react";

/**
 * `useLayoutEffect` in the browser, `useEffect` on the server.
 *
 * An intro animation has to be applied *before* the browser paints, or the
 * marks show one frame at their final state and then snap back to the start —
 * a visible flash. Only `useLayoutEffect` runs that early. It has no meaning
 * under SSR though (there is no layout to read), where React only warns about
 * it, so the explorer's server render falls back to `useEffect`.
 */
export const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
