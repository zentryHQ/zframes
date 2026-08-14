import { allFrameMetas } from "@zframes/frames/schemas";

// Slot sizing for the hand-composed collages (the hero cluster, the frames
// showcase). Deliberately NOT in LiveFrame.tsx: that module is `"use client"`,
// and a plain function exported from a client module becomes a client
// *reference* — the server render calls it and Next throws "Attempted to call
// … from the server". This file has no directive, so both sides can call it.
//
// `@zframes/frames/schemas` is the React-free metadata source, so importing it
// here is safe from a Server Component (unlike `@zframes/frames/lazy`, whose
// thunks drag every frame component into the server graph).

/** The spec's default board geometry — what every `layout` envelope was measured against. */
const ROW_HEIGHT_PX = 96;
const ROW_GAP_PX = 12;

const MIN_ROWS = new Map(
  allFrameMetas.map((m) => [m.name, m.layout?.minH] as const),
);

/**
 * The smallest height, in pixels, a slot may give a frame — its measured
 * `layout.minH` converted out of board rows.
 *
 * Load-bearing for every collage that hand-sizes its slots: the CSS-grid
 * renderer ignores `layout` entirely, so a slot shorter than this doesn't
 * error — it silently squeezes the frame's axis away or clips its last rows,
 * which reads as a design mistake rather than an undersized card. Put it on the
 * element that OWNS the slot height (the sized wrapper), not on the frame
 * itself, so the card and its glow stay the same box.
 */
export function frameSlotMinHeight(frame: string): number | undefined {
  const minH = MIN_ROWS.get(frame);
  if (!minH) return undefined;
  return minH * ROW_HEIGHT_PX + (minH - 1) * ROW_GAP_PX;
}
