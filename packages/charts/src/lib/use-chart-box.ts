import type { CSSProperties, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { observeResize } from "./observe-resize";

interface ChartBox {
  /** Ref for the measured wrapper `<div>`; take `boxStyle` for its style. */
  wrapRef: RefObject<HTMLDivElement | null>;
  /** Ref for the `<svg>` the draw effect paints into. */
  svgRef: RefObject<SVGSVGElement | null>;
  /** Measured wrapper width; `null` until the first measurement lands. */
  width: number | null;
  /** The height to draw at: the measured one when filling, else `height`. */
  plotHeight: number;
  /** Style for the wrapper — the half of `fill` the caller can't compute. */
  boxStyle: CSSProperties;
}

/**
 * The wrapper-measuring half every D3 chart in this package needs: a wrapper to
 * observe, an `<svg>` to draw into, and the width/height that draw should use.
 *
 * A hook rather than a `<ChartBox>` wrapper component because the two things a
 * caller needs from it point in opposite directions — the svg ref goes *down*
 * into the markup and the measured width comes *up* into a draw effect — so a
 * component would have to plumb both through children to hand back what this
 * returns directly.
 *
 * `fill` sizes the chart to its CONTAINER's height instead of `height`:
 * `height` pins the wrapper, so a card body shorter than it can't shrink the
 * chart and the plot spills out clipped. With `fill` the wrapper takes the
 * card's height and the plot is drawn to whatever that measures. Opt-in — a
 * caller that leaves it off keeps its fixed height and pixel-identical output.
 */
export function useChartBox({
  height,
  fill = false,
}: {
  height: number;
  fill?: boolean;
}): ChartBox {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setWidth((prev) =>
        prev !== null && Math.abs(prev - rect.width) < 0.5 ? prev : rect.width,
      );
      // Only tracked when filling — a pinned wrapper is `height` by
      // construction, so measuring it would re-render for nothing.
      if (fill)
        setMeasuredHeight((prev) =>
          prev !== null && Math.abs(prev - rect.height) < 0.5
            ? prev
            : rect.height,
        );
    };
    update();
    return observeResize(el, update);
  }, [fill]);

  // The wrapper can measure 0 before layout settles, so the prop stays the
  // fallback — a collapsed chart is worse than a slightly-too-tall one.
  const plotHeight = fill && measuredHeight ? measuredHeight : height;

  return {
    wrapRef,
    svgRef,
    width,
    plotHeight,
    boxStyle: fill ? { height: "100%", minHeight: 0 } : { height },
  };
}
