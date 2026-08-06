import { createContext } from "react";

/**
 * Per-frame viewport visibility, published by the card chrome (`FrameContent`)
 * and consumed by data hooks (`usePolled`) so a frame scrolled off-screen can
 * pause its network polling without re-rendering. Deliberately a ref + pub/sub
 * (not a boolean state): reads in hot paths never trigger a render, and a hook
 * that wants to act on a change subscribes for an exact callback. Lives in its
 * own module so `frame-content` and `hooks` can both import it without forming
 * an import cycle.
 */
export type FrameVisibilityListener = (visible: boolean) => void;

export interface FrameVisibility {
  /** Live flag — read without subscribing or causing a render. */
  readonly visibleRef: { readonly current: boolean };
  /** Run `listener` on every change; returns an unsubscribe fn. */
  subscribe(listener: FrameVisibilityListener): () => void;
}

/** Null when a frame is rendered outside a visibility-providing card (no gating). */
export const FrameVisibilityContext = createContext<FrameVisibility | null>(
  null,
);

/**
 * PAGE-level visibility — the whole tab/window, as opposed to the per-frame
 * viewport gating above. The second axis of idle cost, and the one that was
 * missing: a frame scrolled off-screen stopped polling, but a dashboard left
 * open in a background tab kept every timer, socket and WebGL loop running.
 * On a laptop that is pure battery drain for output nobody can see.
 *
 * Deliberately ONE module-level `visibilitychange` listener with fan-out (the
 * same shape as `onHeartbeat`'s single ticker): 40 frames must not install 40
 * listeners. Attached on the first subscriber, removed on the last, so a
 * server render or a test that never subscribes touches no browser global.
 *
 * Why not rely on the browser: hidden-tab throttling is real but partial and
 * inconsistent — Chrome suspends `requestAnimationFrame` and clamps timers to
 * ~1/min, but WebSocket messages keep arriving and waking the CPU, Safari's
 * behaviour differs, and an *occluded* (not hidden) window is throttled by
 * some engines and not others. Explicitly standing the work down is the only
 * behaviour that holds across all of them.
 */
const pageVisibilityListeners = new Set<(hidden: boolean) => void>();
let pageVisibilityBound: (() => void) | undefined;

/** True when the tab/window is currently hidden. False in SSR and in jsdom without the API. */
export function isPageHidden(): boolean {
  return typeof document !== "undefined" && document.hidden === true;
}

/**
 * Run `cb(hidden)` on every page show/hide; returns an unsubscribe fn. Fires
 * only on CHANGE — read the current value with {@link isPageHidden} first, or a
 * subscriber that mounts while already hidden waits for a transition that never
 * comes.
 */
export function onPageVisibilityChange(
  cb: (hidden: boolean) => void,
): () => void {
  pageVisibilityListeners.add(cb);
  if (!pageVisibilityBound && typeof document !== "undefined") {
    const handler = () => {
      const hidden = isPageHidden();
      // Snapshot so a callback that unsubscribes mid-notify can't perturb iteration.
      for (const fn of [...pageVisibilityListeners]) fn(hidden);
    };
    document.addEventListener("visibilitychange", handler);
    pageVisibilityBound = () =>
      document.removeEventListener("visibilitychange", handler);
  }
  return () => {
    pageVisibilityListeners.delete(cb);
    if (pageVisibilityListeners.size === 0 && pageVisibilityBound) {
      pageVisibilityBound();
      pageVisibilityBound = undefined;
    }
  };
}
