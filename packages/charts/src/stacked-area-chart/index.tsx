"use client";

import React, {
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
} from "react";
import * as d3 from "d3";
import { useChartIntro } from "../lib/use-chart-intro";
import { useIsomorphicLayoutEffect } from "../lib/use-isomorphic-layout-effect";

import type {
  StackedAreaSeries,
  StackedAreaChartProps,
  AreaBandProps,
  StackedSeriesData,
  CombinedStackedDataPoint,
} from "./types";
import { AXIS, CHART_DEFAULTS, STACKED_AREA_COLORS, AREA } from "./constants";
import { measureTextWidth } from "../lib/measure-text";
import { chartInk } from "../lib/ink";
import {
  getAllDates,
  combineSeriesData,
  createCombinedDataPoints,
  calculateStackedYDomain,
  formatValueWithSuffix,
  findClosestDataPoint,
} from "./utils";
import { useChartDimensions } from "./hooks/use-chart-dimensions";
import {
  hideChartTooltip,
  moveChartTooltip,
  showChartTooltip,
} from "../lib/chart-tooltip";
import { createScales } from "./d3-rendering/create-scales";
import { createGrid } from "./d3-rendering/create-grid";
import { createAxes } from "./d3-rendering/create-axes";

/**
 * First-draw entrance: the stacked bands fade + rise into place, bottom band
 * first, so the chart visibly builds itself when the card appears. Marks only —
 * grid, axes and tick labels paint instantly, as everywhere else in this repo.
 */
const INTRO_DURATION_MS = 550;
/** Whatever the series count, the last band still lands inside this budget. */
const INTRO_TOTAL_BUDGET_MS = 900;
const INTRO_STAGGER_MAX_MS = 70;
const INTRO_RISE_PX = 12;
/** ≈ d3.easeCubicOut — arriving, not sweeping. */
const INTRO_EASING = "cubic-bezier(0.215, 0.61, 0.355, 1)";

/** What `createAxes` paints the y ticks with — measured against, so the gutter
 *  matches the glyphs that actually land in it. */
const Y_TICK_FONT = `500 ${AXIS.fontSize}px "DM Sans", sans-serif`;
/** d3's tick mark plus its default 3px text padding, plus a hair of slack. */
const Y_TICK_GAP = AXIS.tickSize + 3 + 2;

/**
 * One stacked band - renders a simple filled area
 */
function AreaBand({ pathD, color, isHovered, hasHover }: AreaBandProps) {
  const opacity = hasHover
    ? isHovered
      ? AREA.hoverOpacity
      : AREA.dimmedOpacity
    : AREA.opacity;

  return (
    <path
      d={pathD}
      fill={color}
      fillOpacity={opacity}
      stroke={color}
      strokeWidth={AREA.strokeWidth}
      strokeOpacity={AREA.strokeOpacity}
      style={{ transition: "fill-opacity 200ms ease-out" }}
    />
  );
}

function StackedAreaChartInner<T extends StackedAreaSeries>({
  series,
  height = CHART_DEFAULTS.height,
  fill = false,
  formatXAxis,
  formatYAxis,
  formatValue = formatValueWithSuffix,
}: StackedAreaChartProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const areasGroupRef = useRef<SVGGElement>(null);
  const introAnimationsRef = useRef<Animation[]>([]);
  const [hoveredSeriesId, setHoveredSeriesId] = useState<string | null>(null);
  const shouldIntro = useChartIntro();

  const yDomain = useMemo(() => calculateStackedYDomain(series), [series]);

  /**
   * The y gutter, measured from the labels this chart will actually print.
   * `.ticks()` reads only the domain and the count — never the range — so the
   * tick values here are the same ones `createAxes` renders, and the margin is
   * known before any layout exists. Without it a fixed 50px gutter clipped the
   * leading glyph of a wide compact label ("$40.00T" → "40.00T").
   */
  const yGutter = useMemo(() => {
    const ticks = d3.scaleLinear().domain(yDomain).ticks(AXIS.yTicks);
    const widest = ticks.reduce(
      (max, tick) =>
        Math.max(
          max,
          measureTextWidth(
            formatYAxis ? formatYAxis(tick) : String(tick),
            Y_TICK_FONT,
          ),
        ),
      0,
    );
    return Math.ceil(widest) + Y_TICK_GAP;
  }, [yDomain, formatYAxis]);

  const dimensions = useChartDimensions({
    height,
    fill,
    containerRef,
    leftMargin: yGutter,
  });

  // The one style both the container and the empty box take: filling means the
  // card's height decides, not the prop.
  const containerStyle = fill ? { height: "100%", minHeight: 0 } : { height };

  // Memoize series colors
  const seriesColors = useMemo(() => {
    const colorMap: { [seriesId: string]: string } = {};
    series.forEach((s, index) => {
      colorMap[s.id] = s.color
        ? s.color
        : STACKED_AREA_COLORS[index % STACKED_AREA_COLORS.length];
    });
    return colorMap;
  }, [series]);

  // Memoize computed data
  const dates = useMemo(() => getAllDates(series), [series]);

  const combinedData = useMemo(
    () => combineSeriesData(series, dates),
    [series, dates],
  );

  const combinedDataPoints = useMemo(
    () => createCombinedDataPoints(series, dates),
    [series, dates],
  );

  // Create D3 stack
  const stackedData = useMemo(() => {
    if (series.length === 0 || dates.length === 0) return [];

    const stack = d3
      .stack<{ date: Date; [key: string]: number | Date }>()
      .keys(series.map((s) => s.id))
      .order(d3.stackOrderNone)
      .offset(d3.stackOffsetNone);

    return stack(combinedData) as StackedSeriesData[];
  }, [series, dates, combinedData]);

  // Create scales
  const scales = useMemo(() => {
    if (
      dimensions.innerWidth <= 0 ||
      dimensions.innerHeight <= 0 ||
      dates.length === 0
    ) {
      return null;
    }
    return createScales(
      dates,
      yDomain,
      dimensions.innerWidth,
      dimensions.innerHeight,
    );
  }, [dates, yDomain, dimensions.innerWidth, dimensions.innerHeight]);

  /**
   * Crosshair hover, driven imperatively.
   *
   * This used to live in a `useStackedAreaTooltip` hook that held the hovered
   * point in React state, so every pointer move re-rendered the whole chart —
   * areas, legend and all — to move one dashed line and retype a few numbers.
   * The hover line is now written straight to its node by ref and the readout
   * goes to the shared body-level tooltip, so a pointer sweep does no React work
   * at all. It also stops the readout being clipped: the old tooltip was
   * `absolute` inside the chart with a hard-coded 180px right clamp, which a
   * narrow card cut off.
   */
  const hoverLineRef = useRef<SVGLineElement>(null);
  /** Index currently shown, so content is rebuilt only when the point changes. */
  const hoverIndexRef = useRef<number | null>(null);

  const tooltipFor = useCallback(
    (point: CombinedStackedDataPoint) => ({
      title: point.date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      rows: [
        ...series.map((s) => ({
          label: s.name,
          value: formatValue(point.values[s.id] ?? 0),
          color: seriesColors[s.id],
        })),
        // The stack's whole point is the total, so it is a row rather than a
        // footnote — but unlabelled by colour, since it is not a band.
        { label: "Total", value: formatValue(point.total) },
      ],
    }),
    [series, seriesColors, formatValue],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGRectElement>) => {
      const xScale = scales?.xScale;
      if (!xScale || dates.length === 0) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const closest = findClosestDataPoint(
        event.clientX - rect.left,
        xScale,
        dates,
      );
      if (!closest) return;

      if (hoverLineRef.current) {
        const x = xScale(closest.date);
        hoverLineRef.current.setAttribute("transform", `translate(${x}, 0)`);
        hoverLineRef.current.setAttribute("opacity", "1");
      }

      const point = combinedDataPoints[closest.index] ?? null;
      if (point) {
        if (hoverIndexRef.current !== closest.index) {
          hoverIndexRef.current = closest.index;
          showChartTooltip(
            event.currentTarget,
            event.clientX,
            event.clientY,
            tooltipFor(point),
          );
        } else {
          moveChartTooltip(event.clientX, event.clientY);
        }
      }
    },
    [scales, dates, combinedDataPoints, tooltipFor],
  );

  const handlePointerLeave = useCallback(() => {
    hoverIndexRef.current = null;
    hoverLineRef.current?.setAttribute("opacity", "0");
    hideChartTooltip();
  }, []);

  // A data poll or unmount destroys the point under the cursor; without this the
  // shared tooltip would keep floating over a chart that no longer has it.
  useEffect(() => hideChartTooltip, []);

  // Generate area paths using D3
  const areaPaths = useMemo(() => {
    if (!scales || stackedData.length === 0) return [];

    const areaGenerator = d3
      .area<d3.SeriesPoint<{ date: Date; [key: string]: number | Date }>>()
      .x((d) => scales.xScale(d.data.date))
      .y0((d) => scales.yScale(d[0]))
      .y1((d) => scales.yScale(d[1]))
      .curve(d3.curveMonotoneX);

    return stackedData.map((seriesData) => ({
      seriesId: seriesData.key,
      pathD: areaGenerator(seriesData) || "",
      color: seriesColors[seriesData.key] || "#888888",
    }));
  }, [scales, stackedData, seriesColors]);

  // Draw SVG elements (grid, axes) via D3
  useEffect(() => {
    if (
      !svgRef.current ||
      !scales ||
      series.length === 0 ||
      dimensions.width === 0
    ) {
      return;
    }

    const svg = d3.select(svgRef.current);

    // Clear previous content
    svg.selectAll(".chart-content").remove();

    const g = svg
      .append("g")
      .attr("class", "chart-content")
      .attr(
        "transform",
        `translate(${dimensions.marginLeft},${dimensions.marginTop})`,
      );

    // Draw grid
    createGrid(g, scales.yScale, dimensions.innerWidth);

    // Draw axes
    createAxes(
      g,
      scales.xScale,
      scales.yScale,
      dimensions.innerHeight,
      formatXAxis,
      formatYAxis,
    );
  }, [scales, series.length, dimensions, formatXAxis, formatYAxis]);

  // Intro animation. This effect re-runs on data polls, resizes, prop and theme
  // changes; `shouldIntro()` only answers true inside the grace window that
  // opens at the first real draw, so a 15-minute poll never re-grows the card
  // from zero — while the re-render burst right after first paint may restart
  // the entrance, which is what makes it survive StrictMode's double-invoke.
  useIsomorphicLayoutEffect(() => {
    const group = areasGroupRef.current;
    if (!group || dimensions.width === 0 || !scales || areaPaths.length === 0) {
      // Nothing painted yet (dimensions unmeasured / no scales / no bands) —
      // return before consulting the gate, so the window opens on the draw that
      // actually has bands to animate.
      return;
    }

    if (!shouldIntro()) return;

    const bands = Array.from(
      group.querySelectorAll<SVGGElement>("g[data-series-id]"),
    );
    // No Web Animations API (jsdom): the chart just keeps its final state.
    if (bands.length === 0 || typeof bands[0].animate !== "function") return;

    // Per-band delay derived from the band count, so the last one still lands
    // inside the budget instead of a fixed step stretching the show.
    const stagger =
      bands.length > 1
        ? Math.min(
            INTRO_STAGGER_MAX_MS,
            (INTRO_TOTAL_BUDGET_MS - INTRO_DURATION_MS) / (bands.length - 1),
          )
        : 0;

    // A restart inside the window re-arms the same elements, so drop the
    // previous batch first: one tracked batch, no two entrances stacked on one
    // band. Cancelling is invisible here — the replacement is armed in this same
    // synchronous block, before the browser paints.
    for (const animation of introAnimationsRef.current) animation.cancel();

    introAnimationsRef.current = bands.map((band, index) =>
      band.animate(
        [
          { opacity: 0, transform: `translateY(${INTRO_RISE_PX}px)` },
          { opacity: 1, transform: "translateY(0px)" },
        ],
        {
          duration: INTRO_DURATION_MS,
          delay: index * stagger,
          easing: INTRO_EASING,
          // `backwards` keeps a band invisible through its stagger delay; once
          // it finishes the element reverts to its own styles, so the group
          // opacity/transform are left untouched for the hover layer.
          fill: "backwards",
        },
      ),
    );
    // Deliberately no cleanup return here: a later resize or poll re-runs this
    // effect, and cancelling from cleanup would snap a mid-flight entrance —
    // outside the window that run stops at the gate and touches nothing.
    // Unmount cleanup lives in the mount-scoped effect below.
  }, [dimensions.width, scales, areaPaths.length]);

  // Cancel any in-flight entrance on unmount only.
  useEffect(
    () => () => {
      for (const animation of introAnimationsRef.current) animation.cancel();
      introAnimationsRef.current = [];
    },
    [],
  );

  // Handle hover effects
  const handleAreaMouseEnter = useCallback((seriesId: string) => {
    setHoveredSeriesId(seriesId);
  }, []);

  const handleAreaMouseLeave = useCallback(() => {
    setHoveredSeriesId(null);
  }, []);

  if (series.length === 0) {
    return (
      <div
        ref={containerRef}
        className="relative w-full"
        style={containerStyle}
      >
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full" style={containerStyle}>
      {dimensions.width > 0 && scales && (
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="overflow-visible"
        >
          {/* Marks render through React; only grid and axes go through D3. */}
          <g
            transform={`translate(${dimensions.marginLeft},${dimensions.marginTop})`}
          >
            {/* Bands live in their own group: the intro animates these only,
                never the hover rule or the mouse overlay below. */}
            <g ref={areasGroupRef} className="areas">
              {areaPaths.map(({ seriesId, pathD, color }) => (
                <g
                  key={seriesId}
                  data-series-id={seriesId}
                  onMouseEnter={() => handleAreaMouseEnter(seriesId)}
                  onMouseLeave={handleAreaMouseLeave}
                  style={{ cursor: "pointer" }}
                >
                  <AreaBand
                    pathD={pathD}
                    color={color}
                    isHovered={hoveredSeriesId === seriesId}
                    hasHover={hoveredSeriesId !== null}
                  />
                </g>
              ))}
            </g>

            {/* Vertical hover line. Always mounted and moved by ref — mounting
                it conditionally would put the crosshair back on React's render
                path, which is what this rewrite took it off. */}
            <line
              ref={hoverLineRef}
              x1={0}
              y1={0}
              x2={0}
              y2={dimensions.innerHeight}
              // Board ink rather than a baked white, so the crosshair darkens
              // on a light surface. Inline `style`, not the `stroke` attribute:
              // a var() is not substituted inside a presentation attribute.
              style={{ stroke: chartInk() }}
              strokeWidth={1}
              strokeOpacity={0.3}
              strokeDasharray="4,4"
              opacity={0}
            />

            {/* Invisible overlay for hover events */}
            <rect
              x={0}
              y={0}
              width={dimensions.innerWidth}
              height={dimensions.innerHeight}
              fill="transparent"
              style={{ cursor: "crosshair" }}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              onPointerCancel={handlePointerLeave}
            />
          </g>
        </svg>
      )}

      {/* The readout itself is the shared body-level tooltip (see
          handlePointerMove) — nothing to render here. */}
    </div>
  );
}

/**
 * Stacked Area Chart - A generic, implementation-agnostic D3-based stacked area visualization.
 *
 * Features:
 * - Generic data interface with minimal required fields
 * - Responsive sizing with ResizeObserver
 * - Built-in tooltip with hover interactions
 * - Smooth animations
 *
 * @example
 * ```tsx
 * <StackedAreaChart
 *   series={[
 *     { id: 'a', name: 'Series A', data: [{ date: '2024-01-01', value: 100 }] },
 *     { id: 'b', name: 'Series B', data: [{ date: '2024-01-01', value: 50 }] },
 *   ]}
 *   formatYAxis={(v) => `${(v * 100).toFixed(0)}%`}
 * />
 * ```
 */
const StackedAreaChart = StackedAreaChartInner as <T extends StackedAreaSeries>(
  props: StackedAreaChartProps<T>,
) => React.ReactElement;

// memo() erases the generic call signature, so cast it back to preserve
// callers' type inference.
const StackedAreaChartMemo = React.memo(
  StackedAreaChartInner,
) as typeof StackedAreaChart;

export default StackedAreaChartMemo;
