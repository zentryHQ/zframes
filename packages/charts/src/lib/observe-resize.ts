/**
 * Observe one or more elements for size changes, coalescing every burst of
 * callbacks into a single `requestAnimationFrame`.
 *
 * A GridStack drag-resize fires the observer many times per frame, and each of
 * these callbacks re-measures and re-renders a chart (one of them restarts a
 * force simulation), so an uncoalesced observer does that work several times
 * per painted frame. The FIRST measurement runs synchronously — a real
 * observer's initial observation is what sizes the chart at mount, and
 * deferring it to a frame leaves jsdom (which never flushes rAF) at 0×0.
 * Returns the teardown for effect cleanup; it cancels a pending frame so a
 * callback can't run after unmount.
 */
export const observeResize = (
  targets: Element | null | undefined | (Element | null | undefined)[],
  callback: () => void,
): (() => void) => {
  if (typeof ResizeObserver === "undefined") return () => {};

  let frame: number | null = null;
  const schedule = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = null;
      callback();
    });
  };

  let observed = false;
  const observer = new ResizeObserver(() => {
    if (observed) schedule();
  });
  const list = Array.isArray(targets) ? targets : [targets];
  for (const target of list) if (target) observer.observe(target);
  observed = true;
  callback();

  return () => {
    if (frame !== null) cancelAnimationFrame(frame);
    observer.disconnect();
  };
};
