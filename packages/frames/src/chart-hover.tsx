import {
  chartTooltipLabel,
  hideChartTooltip,
  moveChartTooltip,
  showChartTooltip,
  type ChartTooltipContent,
} from "@zframes/charts";
import { useEffect } from "react";

export type { ChartTooltipContent };

/**
 * Hover tooltips for a frame that draws its OWN svg marks.
 *
 * Most frames don't need this: the base charts in `@zframes/charts` wire the
 * shared tooltip up internally, so a frame rendering `<BarChart>` or
 * `TimeSeriesChart` gets one for free. A handful of frames hand-roll a small
 * `<svg>` instead — a yield curve, the options strike ladders, the IV smiles —
 * and those bypass the chart layer entirely, so they were the only cards on a
 * board with no hover readout at all.
 *
 * The right long-term fix is to move them onto the base charts (this package's
 * cardinal rule), but that changes how they render; this gives them the same
 * tooltip in the meantime, off the same primitive, so no board shows two
 * tooltip designs.
 */

/**
 * Pointer handlers for one mark. Spread onto the element that should be the hit
 * target — which, for a 1.5px curve or a thin bar, means an invisible rect
 * covering the mark's whole column, not the mark itself.
 *
 * Returns `undefined` for null content so `{...hoverTip(null)}` is a clean no-op
 * on a mark with nothing to say.
 *
 * Pair it with `aria-label={chartTooltipLabel(content)}`: the tooltip node is
 * shared and `aria-hidden`, so the mark carries the accessible reading — and on
 * these frames it is often the only place the figure appears in the DOM.
 */
export function hoverTip(content: ChartTooltipContent | null) {
  if (!content) return undefined;
  return {
    onPointerEnter: (event: React.PointerEvent<Element>) => {
      showChartTooltip(
        event.currentTarget,
        event.clientX,
        event.clientY,
        content,
      );
    },
    onPointerMove: (event: React.PointerEvent<Element>) => {
      moveChartTooltip(event.clientX, event.clientY);
    },
    onPointerLeave: hideChartTooltip,
    onPointerCancel: hideChartTooltip,
  };
}

/**
 * Dismiss the shared tooltip when the frame goes away.
 *
 * A card can unmount under the cursor — a data poll re-keying the tree, the
 * editor deleting it, the board switching dashboards — and none of those fire
 * `pointerleave`. Without this the tooltip stays on screen describing a chart
 * that is no longer there.
 */
export function useHideTipOnUnmount(): void {
  useEffect(() => hideChartTooltip, []);
}

export { chartTooltipLabel };
