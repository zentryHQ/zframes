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
}

export function useChartDimensions({
  height = CHART_DEFAULTS.height,
  margin,
  containerRef,
}: UseChartDimensionsProps): StackedAreaChartDimensions {
  const [containerWidth, setContainerWidth] = useState<number>(0);

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
      }
    };

    updateWidth();

    return observeResize(containerRef.current, updateWidth);
  }, [containerRef]);

  // Memoized on the scalars: the returned object sits in the consumer's
  // axes-effect deps, so a fresh literal per render re-created the axes on every
  // tooltip mousemove.
  return useMemo(() => {
    const innerWidth = Math.max(0, containerWidth - marginLeft - marginRight);
    const innerHeight = Math.max(0, height - marginTop - marginBottom);

    return {
      width: containerWidth,
      height,
      innerWidth,
      innerHeight,
      marginTop,
      marginRight,
      marginBottom,
      marginLeft,
    };
  }, [
    containerWidth,
    height,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
  ]);
}
