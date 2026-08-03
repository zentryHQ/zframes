import * as d3 from "d3";
import { memo, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/utils";
import {
  type CalendarDatum,
  type WeekStart,
  buildCalendarGrid,
  levelScale,
  monthLabels,
  weekdayLabels,
} from "./utils";

export type { CalendarDatum, CalendarDay, WeekStart } from "./utils";

export interface CalendarHeatmapProps {
  data: CalendarDatum[];
  /**
   * Fixed height in px. Omit to fill the container instead — the grid is
   * square-celled, so letting it take the card's real height is usually what
   * you want.
   */
  height?: number;
  /**
   * Fill for cells. Applied as a `style`, not an attribute, so a CSS variable
   * (`var(--zf-up, #3fd08f)`) resolves and the grid follows the board's theme.
   */
  color?: string;
  /**
   * Set for a **diverging** grid: values below zero take this fill and are
   * ranked among themselves, so an outflow day is as legible as an inflow one.
   * Omit for a sequential grid ranked across the whole sample.
   */
  negativeColor?: string;
  /** Discrete intensity bands per sign. Default 4 (GitHub uses 4 plus empty). */
  levels?: number;
  weekStart?: WeekStart;
  /** Gap between cells in px. Default 2. */
  gap?: number;
  /** Window override; defaults to the series' own first/last day. */
  from?: number | string;
  to?: number | string;
  formatValue?: (value: number) => string;
  showMonthLabels?: boolean;
  showWeekdayLabels?: boolean;
  /** Draw the faint→strong swatch key. Default true. */
  showLegend?: boolean;
  /** Label the legend's low and high ends. Default "less" / "more". */
  legendLowLabel?: string;
  legendHighLabel?: string;
}

const FONT = "10px 'DM Sans', sans-serif";
const DEFAULT_COLOR = "var(--color-highlight, #8b8bff)";
const WEEKDAY_GUTTER = 26;
const MONTH_LABEL_HEIGHT = 14;
const LEGEND_HEIGHT = 16;
const LEGEND_SWATCH = 8;
/** Below this a cell can't read as a square, so the grid stops shrinking. */
const MIN_CELL = 2;
/**
 * Ceiling on cell size. A short window in a large card would otherwise inflate
 * the squares until the grid reads as a matrix heatmap rather than a calendar —
 * a 6-week view was drawing 60px tiles. Capping keeps the calendar's identity
 * and leaves the slack as margin, which the centring below absorbs.
 */
const MAX_CELL = 26;
/** Weakest and strongest band opacity — level 1 must still be visible. */
const MIN_FILL_OPACITY = 0.24;
const MAX_FILL_OPACITY = 1;
/** Weekday rows are labelled every other row; all seven never fit. */
const WEEKDAY_LABEL_STEP = 2;

/**
 * Calendar heatmap — one square per calendar day, weeks running left to right
 * and weekdays top to bottom (the GitHub-contribution layout).
 *
 * Answers what a line chart of the same series can't: *when* the activity fell.
 * Seasonality, day-of-week rhythm, and the gaps — weekends, market holidays, a
 * source that stopped printing — are all shape rather than a squiggle, and it
 * survives being shrunk into a small card in a way a 250-point line does not.
 *
 * Pure presentation: data in via props, the grid tracks its container.
 */
const CalendarHeatmap = ({
  data,
  height,
  color = DEFAULT_COLOR,
  negativeColor,
  levels = 4,
  weekStart = "sunday",
  gap = 2,
  from,
  to,
  formatValue = (v) => String(v),
  showMonthLabels = true,
  showWeekdayLabels = true,
  showLegend = true,
  legendLowLabel = "less",
  legendHighLabel = "more",
}: CalendarHeatmapProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(
    null,
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setBox((prev) =>
        prev &&
        Math.abs(prev.width - w) < 0.5 &&
        Math.abs(prev.height - h) < 0.5
          ? prev
          : { width: w, height: h },
      );
    };
    update();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);

  const width = box?.width ?? 0;
  const svgHeight = height ?? box?.height ?? 0;

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || width <= 0 || svgHeight <= 0 || !data.length) return;

    const { days, weeks } = buildCalendarGrid(data, { weekStart, from, to });
    d3.select(svgEl).selectAll("*").remove();
    if (!weeks) return;
    const svg = d3.select(svgEl);

    const marginLeft = showWeekdayLabels ? WEEKDAY_GUTTER : 0;
    const marginTop = showMonthLabels ? MONTH_LABEL_HEIGHT : 0;
    const marginBottom = showLegend ? LEGEND_HEIGHT : 0;
    const innerWidth = Math.max(width - marginLeft, 10);
    const innerHeight = Math.max(svgHeight - marginTop - marginBottom, 10);

    // Square cells: whichever axis runs out of room first sets the size, then
    // MAX_CELL keeps a short window from inflating into a matrix heatmap.
    const cell = Math.max(
      MIN_CELL,
      Math.min(
        MAX_CELL,
        Math.floor(
          Math.min(
            (innerWidth - gap * (weeks - 1)) / weeks,
            (innerHeight - gap * 6) / 7,
          ),
        ),
      ),
    );
    const gridWidth = cell * weeks + gap * (weeks - 1);
    const gridHeight = cell * 7 + gap * 6;
    // Centre the slack rather than leaving it all on one side — a 3-month grid
    // in a wide card otherwise hugs the weekday labels with a void beside it.
    const offsetX = marginLeft + Math.max(0, (innerWidth - gridWidth) / 2);
    const offsetY = marginTop + Math.max(0, (innerHeight - gridHeight) / 2);

    const cellX = (week: number) => offsetX + week * (cell + gap);
    const cellY = (weekday: number) => offsetY + weekday * (cell + gap);

    // Diverging grids rank each sign among its own kind so a mostly-positive
    // series still distinguishes its handful of negative days; a sequential
    // grid ranks the raw value across the whole sample.
    const filled = days.filter(
      (d): d is typeof d & { value: number } => d.value !== null,
    );
    const diverging = negativeColor !== undefined;
    const upScale = levelScale(
      diverging
        ? filled.filter((d) => d.value >= 0).map((d) => d.value)
        : filled.map((d) => d.value),
      levels,
    );
    const downScale = levelScale(
      filled.filter((d) => d.value < 0).map((d) => -d.value),
      levels,
    );
    const bandOpacity = (level: number) =>
      MIN_FILL_OPACITY +
      ((level - 1) / Math.max(1, levels - 1)) *
        (MAX_FILL_OPACITY - MIN_FILL_OPACITY);
    const fillOf = (value: number) =>
      diverging && value < 0 ? negativeColor : color;
    const opacityOf = (value: number) =>
      bandOpacity(diverging && value < 0 ? downScale(-value) : upScale(value));
    // The two kinds of blank square read differently on purpose: a hole inside
    // the window (weekend, market holiday, dropped print) is part of the
    // series' shape and stays visible, while the week padding at the grid's
    // ends is outside the frame and fades toward nothing.
    const blankOpacity = (day: { inWindow: boolean }) =>
      day.inWindow ? 0.07 : 0.03;

    const radius = cell >= 8 ? 2 : cell >= 4 ? 1 : 0;
    const animate = !prefersReducedMotion();

    const cells = svg
      .selectAll("rect.day")
      .data(days)
      .enter()
      .append("rect")
      .attr("x", (d) => cellX(d.week))
      .attr("y", (d) => cellY(d.weekday))
      .attr("width", cell)
      .attr("height", cell)
      .attr("rx", radius)
      // `style`, not `attr`: a CSS var in a presentation attribute doesn't
      // resolve, so `var(--zf-up)` would silently fall back to black.
      .style("fill", (d) =>
        d.value === null ? "currentColor" : fillOf(d.value),
      )
      .style("fill-opacity", (d) =>
        d.value === null ? blankOpacity(d) : animate ? 0 : opacityOf(d.value),
      );

    if (animate)
      cells
        .transition()
        .duration(320)
        .delay((d) => (d.week / Math.max(1, weeks)) * 220)
        .style("fill-opacity", (d) =>
          d.value === null ? blankOpacity(d) : opacityOf(d.value),
        );

    // Only in-window squares get a tooltip — the week padding is scaffolding,
    // and "Dec 28: no data" on it invites the reader to ask what happened.
    cells
      .filter((d) => d.inWindow)
      .append("title")
      .text((d) => {
        const date = new Date(d.time).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        return d.value === null
          ? `${date}: no data`
          : `${date}: ${formatValue(d.value)}`;
      });

    if (showWeekdayLabels && cell >= 6) {
      const labels = weekdayLabels(weekStart);
      // Every other row, phased so the labelled rows are always Mon/Wed/Fri
      // whatever the week starts on. Labelling by raw row index instead put a
      // Monday-anchored grid on Tue/Thu/Sat, which reads as an off-by-one.
      const phase = weekStart === "monday" ? 0 : 1;
      svg
        .selectAll("text.weekday")
        .data(
          labels
            .map((label, weekday) => ({ label, weekday }))
            .filter((l) => l.weekday % WEEKDAY_LABEL_STEP === phase),
        )
        .enter()
        .append("text")
        .attr("x", offsetX - 6)
        .attr("y", (l) => cellY(l.weekday) + cell / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "central")
        .attr("fill", "currentColor")
        .attr("fill-opacity", 0.5)
        .style("font", FONT)
        .text((l) => l.label);
    }

    if (showMonthLabels) {
      // Two cells per label at minimum; below that the words collide.
      const minGapWeeks = Math.max(3, Math.ceil(24 / (cell + gap)));
      svg
        .selectAll("text.month")
        .data(monthLabels(days, minGapWeeks))
        .enter()
        .append("text")
        .attr("x", (m) => cellX(m.week))
        .attr("y", offsetY - 4)
        .attr("text-anchor", "start")
        .attr("fill", "currentColor")
        .attr("fill-opacity", 0.5)
        .style("font", FONT)
        .text((m) => m.label);
    }

    if (showLegend) {
      // Diverging keys read strong-negative → strong-positive through a zero
      // notch; sequential keys read faint → strong in one hue.
      const swatches = diverging
        ? [
            ...Array.from({ length: levels }, (_, i) => ({
              fill: negativeColor,
              opacity: bandOpacity(levels - i),
            })),
            ...Array.from({ length: levels }, (_, i) => ({
              fill: color,
              opacity: bandOpacity(i + 1),
            })),
          ]
        : Array.from({ length: levels }, (_, i) => ({
            fill: color,
            opacity: bandOpacity(i + 1),
          }));

      const keyWidth = swatches.length * (LEGEND_SWATCH + 2) - 2;
      const lowWidth = legendLowLabel.length * 5.5 + 6;
      const legendY = offsetY + gridHeight + 6;
      const startX = Math.max(
        marginLeft,
        offsetX + gridWidth - keyWidth - legendHighLabel.length * 5.5 - 6,
      );

      const legend = svg
        .append("g")
        .attr("transform", `translate(${startX},${legendY})`);
      legend
        .append("text")
        .attr("x", -6)
        .attr("y", LEGEND_SWATCH / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "central")
        .attr("fill", "currentColor")
        .attr("fill-opacity", 0.45)
        .style("font", FONT)
        .text(legendLowLabel);
      legend
        .selectAll("rect.key")
        .data(swatches)
        .enter()
        .append("rect")
        .attr("x", (_, i) => i * (LEGEND_SWATCH + 2))
        .attr("y", 0)
        .attr("width", LEGEND_SWATCH)
        .attr("height", LEGEND_SWATCH)
        .attr("rx", 1)
        .style("fill", (s) => s.fill)
        .style("fill-opacity", (s) => s.opacity);
      legend
        .append("text")
        .attr("x", keyWidth + 6)
        .attr("y", LEGEND_SWATCH / 2)
        .attr("dominant-baseline", "central")
        .attr("fill", "currentColor")
        .attr("fill-opacity", 0.45)
        .style("font", FONT)
        .text(legendHighLabel);
      // Keep the low label from sliding under the weekday gutter.
      if (startX - lowWidth < 0)
        legend.attr("transform", `translate(${lowWidth},${legendY})`);
    }
  }, [
    data,
    width,
    svgHeight,
    color,
    negativeColor,
    levels,
    weekStart,
    gap,
    from,
    to,
    formatValue,
    showMonthLabels,
    showWeekdayLabels,
    showLegend,
    legendLowLabel,
    legendHighLabel,
  ]);

  return (
    <div
      ref={wrapRef}
      className={height === undefined ? "h-full w-full" : "w-full"}
      style={height === undefined ? undefined : { height }}
    >
      {width > 0 && svgHeight > 0 && (
        <svg ref={svgRef} width={width} height={svgHeight} />
      )}
    </div>
  );
};

export default memo(CalendarHeatmap);
