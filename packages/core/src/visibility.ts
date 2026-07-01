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
