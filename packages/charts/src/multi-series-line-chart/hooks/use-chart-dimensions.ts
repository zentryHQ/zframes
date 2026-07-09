import { useState, useLayoutEffect, RefObject } from "react";
import * as d3 from "d3";
import { CHART_MARGIN, CHART_DEFAULTS } from "../constants";
import { parseMarketData } from "../../lib/format";
import type { ChartDimensions } from "../types";

interface UseChartDimensionsProps {
  width?: number;
  height?: number;
  yDomain: [number, number];
  formatValue?: (value: number) => string;
  containerRef: RefObject<HTMLDivElement | null>;
}

/**
 * Measure a y-axis tick label's rendered width via a shared canvas 2D context.
 * Works during render with no dependency on a mounted <svg> ref — the previous
 * getBBox path measured against `svgRef.current`, which is null on first paint
 * (React attaches refs at commit), so it fell back to a too-narrow fixed margin
 * and clipped the leading glyph of wide/signed labels ("$90.80M" → "0.80M",
 * "-0.0030%" → "0030%"). Canvas measurement has the value on the first render.
 */
let labelMeasureCtx: CanvasRenderingContext2D | null | undefined;
const measureLabelWidth = (text: string): number => {
  if (labelMeasureCtx === undefined) {
    labelMeasureCtx =
      typeof document !== "undefined"
        ? document.createElement("canvas").getContext("2d")
        : null;
    if (labelMeasureCtx) {
      labelMeasureCtx.font = `700 ${CHART_DEFAULTS.fontSize}px "DM Sans", sans-serif`;
    }
  }
  // SSR / no-canvas fallback: estimate ~0.62em per glyph at the label font size.
  if (!labelMeasureCtx) return text.length * CHART_DEFAULTS.fontSize * 0.62;
  return labelMeasureCtx.measureText(text).width;
};

export const useChartDimensions = ({
  width,
  height = CHART_DEFAULTS.height,
  yDomain,
  formatValue,
  containerRef,
}: UseChartDimensionsProps): ChartDimensions => {
  const [containerWidth, setContainerWidth] = useState<number | undefined>(
    width,
  );

  useLayoutEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Only re-render on an actual (sub-pixel-rounded) width change so the
        // ResizeObserver can't drive a feedback loop.
        setContainerWidth((prev) =>
          prev !== undefined && Math.abs(prev - rect.width) < 0.5
            ? prev
            : rect.width,
        );
      }
    };

    updateWidth();
    // Observe the container itself, not just window resize — GridStack drag-
    // resizes the card without firing a window resize, which otherwise leaves
    // dimensions.width stale and scales the whole SVG (labels included) down.
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updateWidth)
        : null;
    if (observer && containerRef.current)
      observer.observe(containerRef.current);
    window.addEventListener("resize", updateWidth);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [containerRef]);

  const calculateYAxisWidth = (
    yScale: d3.ScaleLinear<number, number, never>,
  ): number => {
    const [minValue, maxValue] = yScale.domain();
    const numTicks = 5;
    let maxWidth = 0;

    for (let i = 0; i < numTicks; i++) {
      const value = minValue + ((maxValue - minValue) / (numTicks - 1)) * i;
      const formattedValue = formatValue
        ? formatValue(value)
        : parseMarketData(value);
      maxWidth = Math.max(maxWidth, measureLabelWidth(formattedValue));
    }

    return Math.ceil(maxWidth) + CHART_DEFAULTS.yAxisPadding;
  };

  let effectiveWidth: number | null = containerWidth ?? null;
  if (!effectiveWidth && containerRef.current) {
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0) {
      effectiveWidth = rect.width;
    }
  }
  effectiveWidth = effectiveWidth || width || null;

  const innerHeight = height - CHART_MARGIN.top - CHART_MARGIN.bottom;

  const tempYScale = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);

  const dynamicLeftMargin =
    effectiveWidth && effectiveWidth > 0
      ? calculateYAxisWidth(tempYScale)
      : null;

  const innerWidth =
    effectiveWidth &&
    effectiveWidth > 0 &&
    dynamicLeftMargin &&
    dynamicLeftMargin > 0
      ? effectiveWidth -
        dynamicLeftMargin -
        (effectiveWidth > 640 ? CHART_MARGIN.right : 20)
      : null;

  return {
    width: effectiveWidth,
    height,
    innerWidth,
    innerHeight,
    dynamicLeftMargin,
  };
};
