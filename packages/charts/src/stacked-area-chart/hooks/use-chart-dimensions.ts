import { useState, useLayoutEffect, RefObject } from "react";
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
        setContainerWidth(rect.width);
      }
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef]);

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
}
