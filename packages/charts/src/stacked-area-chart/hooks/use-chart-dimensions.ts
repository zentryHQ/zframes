import { useState, useLayoutEffect, useMemo, RefObject } from "react";
import { observeResize } from "../../lib/observe-resize";
import { CHART_MARGIN, CHART_DEFAULTS } from "../constants";
import type { StackedAreaChartDimensions } from "../types";

interface UseChartDimensionsProps {
  height?: number;
  containerRef: RefObject<HTMLDivElement | null>;
  /**
   * Size the chart to the CONTAINER's height instead of the `height` prop.
   *
   * `height` pins the container, so a card body shorter than it can't shrink
   * the chart and the bands spill out clipped. Opt-in, so every existing caller
   * keeps its fixed height and pixel-identical output.
   */
  fill?: boolean;
  /**
   * Y-axis gutter in px, when the caller has measured its own tick labels.
   * `CHART_MARGIN.left` is a guess that fits `$40.0M` and clips `$40.00T`, so
   * the consumer measures the widest label it will actually draw and passes it
   * here. Never narrower than the constant — a chart whose labels are short
   * keeps the gutter it has always had, so existing cards don't reflow.
   */
  leftMargin?: number;
}

export function useChartDimensions({
  height = CHART_DEFAULTS.height,
  containerRef,
  fill = false,
  leftMargin,
}: UseChartDimensionsProps): StackedAreaChartDimensions {
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);

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
    const marginLeft = Math.max(CHART_MARGIN.left, leftMargin ?? 0);
    const innerWidth = Math.max(
      0,
      containerWidth - marginLeft - CHART_MARGIN.right,
    );
    const innerHeight = Math.max(
      0,
      resolvedHeight - CHART_MARGIN.top - CHART_MARGIN.bottom,
    );

    return {
      width: containerWidth,
      height: resolvedHeight,
      innerWidth,
      innerHeight,
      marginTop: CHART_MARGIN.top,
      marginRight: CHART_MARGIN.right,
      marginBottom: CHART_MARGIN.bottom,
      marginLeft,
    };
  }, [containerWidth, containerHeight, fill, height, leftMargin]);
}
