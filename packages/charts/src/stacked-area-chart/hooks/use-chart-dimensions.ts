import { useState, useLayoutEffect, useMemo, RefObject } from "react";
import { observeResize } from "../../lib/observe-resize";
import { CHART_MARGIN, CHART_DEFAULTS } from "../constants";
import type { StackedAreaChartDimensions } from "../types";

interface UseChartDimensionsProps {
  height?: number;
  margin?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  containerRef: RefObject<HTMLDivElement | null>;
  /**
   * Size the chart to the CONTAINER's height instead of the `height` prop.
   *
   * `height` pins the container, so a card body shorter than it can't shrink
   * the chart and the bands spill out clipped. Opt-in, so every existing caller
   * keeps its fixed height and pixel-identical output.
   */
  fill?: boolean;
}

export function useChartDimensions({
  height = CHART_DEFAULTS.height,
  margin,
  containerRef,
  fill = false,
}: UseChartDimensionsProps): StackedAreaChartDimensions {
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);

  const marginTop = margin?.top ?? CHART_MARGIN.top;
  const marginRight = margin?.right ?? CHART_MARGIN.right;
  const marginBottom = margin?.bottom ?? CHART_MARGIN.bottom;
  const marginLeft = margin?.left ?? CHART_MARGIN.left;

  useLayoutEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerWidth((prev) =>
          Math.abs(prev - rect.width) < 0.5 ? prev : rect.width,
        );
        // Only tracked when filling — a pinned container is `height` by
        // construction, so measuring it would re-render for nothing.
        if (fill)
          setContainerHeight((prev) =>
            Math.abs(prev - rect.height) < 0.5 ? prev : rect.height,
          );
      }
    };

    updateWidth();

    return observeResize(containerRef.current, updateWidth);
  }, [containerRef, fill]);

  // Memoized on the scalars: the returned object sits in the consumer's
  // axes-effect deps, so a fresh literal per render re-created the axes on every
  // tooltip mousemove.
  return useMemo(() => {
    // The container can measure 0 before layout settles, so the prop stays the
    // fallback — a collapsed chart is worse than a slightly-too-tall one.
    const resolvedHeight = fill && containerHeight ? containerHeight : height;
    const innerWidth = Math.max(0, containerWidth - marginLeft - marginRight);
    const innerHeight = Math.max(0, resolvedHeight - marginTop - marginBottom);

    return {
      width: containerWidth,
      height: resolvedHeight,
      innerWidth,
      innerHeight,
      marginTop,
      marginRight,
      marginBottom,
      marginLeft,
    };
  }, [
    containerWidth,
    containerHeight,
    fill,
    height,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
  ]);
}
