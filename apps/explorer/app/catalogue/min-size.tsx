import type { FrameLayout } from "@zframes/spec/frame";

/**
 * A frame's size envelope, rendered for the catalogue.
 *
 * Every frame declares `layout` — the default span it lands at, and the floor
 * and ceiling the editor's resize handles enforce. The floor is the part a
 * person browsing needs: it is what decides whether three of these fit across a
 * board, and the live preview on the card can't show it (the preview renders the
 * frame at its DEFAULT span, which is by definition not its smallest).
 *
 * Deliberately server-safe — no hooks, no `"use client"` — because it is used by
 * both the client-only card grid and the server-rendered text index, and the two
 * must not be able to disagree about a frame's floor.
 *
 * `@zframes/spec/frame` is the React-free subpath, so importing the type here
 * costs a Server Component nothing.
 */

/** The renderer's fallback when a frame declares no layout (mirrors the editor). */
const FALLBACK: Required<Pick<FrameLayout, "w" | "h">> = { w: 4, h: 3 };

export function minSpan(layout?: FrameLayout): { w: number; h: number } {
  return {
    w: layout?.minW ?? layout?.w ?? FALLBACK.w,
    h: layout?.minH ?? layout?.h ?? FALLBACK.h,
  };
}

/** "3×2 min, up to 12×6" — the whole envelope as one readable clause. */
export function describeSize(layout?: FrameLayout): string {
  const min = minSpan(layout);
  const maxW = layout?.maxW;
  const maxH = layout?.maxH;
  const ceiling =
    maxW || maxH
      ? `, up to ${maxW ?? "any"}×${maxH ?? "any"}`
      : ", scales to the full board";
  return `${min.w}×${min.h} min${ceiling}`;
}

/**
 * The footer chip. Columns × rows on the standard 12-column board — the same
 * units a `dashboard.json` `position` is written in, so the number transfers
 * directly to the spec someone is about to write.
 */
export function MinSize({ layout }: { layout?: FrameLayout }) {
  const { w, h } = minSpan(layout);
  return (
    <span
      className="shrink-0 rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white/55"
      title={`Smallest size this frame reads well at: ${w} column${
        w === 1 ? "" : "s"
      } × ${h} row${h === 1 ? "" : "s"} on a 12-column board (${describeSize(
        layout,
      )})`}
    >
      min {w}&times;{h}
    </span>
  );
}
