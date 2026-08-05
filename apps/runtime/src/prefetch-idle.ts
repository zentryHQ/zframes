// Run `fn` when the browser next goes idle, so warming a chunk never competes
// with first paint. Falls back to a short timer where requestIdleCallback is
// missing (Safari). Returns a cancel handle for the effect cleanup.
const FALLBACK_DELAY_MS = 1500;

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function prefetchIdle(fn: () => void): () => void {
  const w = window as IdleWindow;
  if (w.requestIdleCallback) {
    const handle = w.requestIdleCallback(fn, { timeout: FALLBACK_DELAY_MS });
    return () => w.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(fn, FALLBACK_DELAY_MS);
  return () => window.clearTimeout(handle);
}
