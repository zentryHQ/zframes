import * as d3 from "d3";
import { memo, useEffect, useRef, useState } from "react";
import type { ChartTooltipContent } from "./lib/chart-tooltip";
import { attachChartTooltip, hideChartTooltip } from "./lib/chart-tooltip";
import { observeResize } from "./lib/observe-resize";
import { useChartIntro } from "./lib/use-chart-intro";

export interface BarDatum {
  /** Category label (or a date label for bar-over-time). */
  label: string;
  value: number;
  /** Per-bar color override; falls back to `color` / `negativeColor`. */
  color?: string;
}

export interface BarChartProps {
  data: BarDatum[];
  /** Bars grow up (vertical) or right (horizontal). Default vertical. */
  orientation?: "vertical" | "horizontal";
  /** Fill for bars (positive values when `negativeColor` is set). */
  color?: string;
  /** When set, bars with negative values use this fill (diverging chart). */
  negativeColor?: string;
  height?: number;
  /**
   * Size the chart to its CONTAINER's height instead of `height`.
   *
   * `height` pins the wrapper, so a card body shorter than it can't shrink the
   * chart and the plot spills out clipped. With `fill` the wrapper takes the
   * card's height and the plot is drawn to whatever that measures. Opt-in —
   * existing callers keep their fixed height and pixel-identical output.
   */
  fill?: boolean;
  formatValue?: (value: number) => string;
  /** Show the formatted value at the end of each bar. Default true. */
  showValues?: boolean;
  /**
   * Cap on category tick labels (vertical orientation) — labels are thinned
   * evenly when bars outnumber it, for dense bar-over-time series.
   */
  maxTickLabels?: number;
}

const FONT = "11px 'DM Sans', sans-serif";
const DEFAULT_COLOR = "var(--color-highlight, #8b8bff)";
/** Rough per-character width of {@link FONT}, used to size/fit label text. */
const CHAR_PX = 6.4;
/** Gap between a horizontal-bar's label text and the bar itself. */
const LABEL_GAP = 8;
/** Left gutter before label text so the leading glyph never clips at x=0. */
const LABEL_INSET = 4;
/**
 * Module-level so an omitted `formatValue` keeps one identity across renders —
 * it sits in the redraw effect's deps, and a fresh default rebuilt the chart on
 * every render of the card.
 */
const DEFAULT_FORMAT_VALUE = (v: number) => String(Math.round(v));

/** Intro grow-in duration per bar. */
const INTRO_MS = 400;
/**
 * Budget for the whole stagger: the LAST bar starts this late, so a dense
 * series still finishes inside ~640ms instead of turning into a slideshow.
 */
const INTRO_STAGGER_BUDGET_MS = 240;
/** Cap on the per-bar step, so a 2-bar chart doesn't wait 240ms for bar two. */
const INTRO_STAGGER_STEP_CAP_MS = 24;

/**
 * Truncate a label with a trailing ellipsis so its rendered width never
 * exceeds `maxPx` — keeps long category names from overflowing the label
 * gutter and clipping their leading characters at the SVG's left edge. The
 * full label is preserved in the row's hover tooltip.
 */
const fitLabel = (label: string, maxPx: number): string => {
  const maxChars = Math.floor(maxPx / CHAR_PX);
  if (label.length <= maxChars) return label;
  if (maxChars <= 1) return "…";
  return `${label.slice(0, maxChars - 1)}…`;
};

/**
 * Categorical bar chart (vertical or horizontal), diverging-aware: pass
 * `negativeColor` and a zero baseline splits gains from losses. Pure
 * presentation — data in via props, width tracks the container.
 */
const BarChart = ({
  data,
  orientation = "vertical",
  color = DEFAULT_COLOR,
  negativeColor,
  height = 200,
  fill = false,
  formatValue = DEFAULT_FORMAT_VALUE,
  showValues = true,
  maxTickLabels = 8,
}: BarChartProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  /**
   * The intro belongs to the chart's arrival only. This redraw also runs on
   * every data poll, resize, theme change and prop change, and re-growing the
   * bars from the baseline each time would make a 15-minute poll look like a
   * reload — so the grace window closes shortly after the first real draw.
   */
  const shouldIntro = useChartIntro();

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

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !width || width <= 0 || !data.length) return;

    d3.select(svgEl).selectAll("*").remove();
    const svg = d3.select(svgEl);
    const barFill = (d: BarDatum) =>
      d.color ?? (negativeColor && d.value < 0 ? negativeColor : color);
    // The swatch carries the bar's own fill — on a diverging chart that is what
    // tells a gain bar from a loss bar. `d.label` is the FULL label, which the
    // horizontal branch truncates when it draws it.
    const tooltipFor = (d: BarDatum): ChartTooltipContent => ({
      title: d.label,
      rows: [{ value: formatValue(d.value), color: barFill(d) }],
    });
    const ariaFor = (d: BarDatum) => `${d.label}: ${formatValue(d.value)}`;
    // Computed once, up front, so the horizontal and vertical branches below
    // can never disagree about whether this draw is an intro.
    const animate = shouldIntro();
    // Short positional stagger so the bars read as arriving in order; the step
    // shrinks with the bar count and the last bar starts inside the budget.
    const introStep = animate
      ? Math.min(
          INTRO_STAGGER_BUDGET_MS / Math.max(data.length - 1, 1),
          INTRO_STAGGER_STEP_CAP_MS,
        )
      : 0;
    const introDelay = (_d: BarDatum, i: number) => i * introStep;

    if (orientation === "horizontal") {
      const labelWidth = Math.min(
        Math.max(...data.map((d) => d.label.length)) * CHAR_PX +
          LABEL_GAP +
          LABEL_INSET,
        width * 0.35,
      );
      // Reserve the gutter the WIDEST formatted value actually needs. A fixed
      // pad clipped anything longer than ~7 glyphs ("+249.24%" lost its "%"),
      // and the longest bar is by definition the one that runs into it.
      const valuePad = showValues
        ? Math.min(
            Math.max(
              52,
              Math.max(...data.map((d) => formatValue(d.value).length)) *
                CHAR_PX +
                LABEL_GAP +
                LABEL_INSET,
            ),
            width * 0.3,
          )
        : 8;
      const innerWidth = Math.max(width - labelWidth - valuePad, 10);
      const rowHeight = plotHeight / data.length;
      const barHeight = Math.min(Math.max(rowHeight * 0.55, 3), 18);

      const hasNeg =
        negativeColor !== undefined && data.some((d) => d.value < 0);
      const maxAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1e-9);
      const x = hasNeg
        ? d3.scaleLinear().domain([-maxAbs, maxAbs]).range([0, innerWidth])
        : d3
            .scaleLinear()
            .domain([Math.min(0, ...data.map((d) => d.value)), maxAbs])
            .range([0, innerWidth]);
      const zeroX = x(0);

      const g = svg.append("g").attr("transform", `translate(${labelWidth},0)`);

      if (hasNeg)
        g.append("line")
          .attr("x1", zeroX)
          .attr("x2", zeroX)
          .attr("y1", 0)
          .attr("y2", plotHeight)
          .attr("stroke", "currentColor")
          .attr("stroke-opacity", 0.18);

      const rows = g
        .selectAll("g.bar-row")
        .data(data)
        .enter()
        .append("g")
        .attr(
          "transform",
          (_, i) => `translate(0,${i * rowHeight + rowHeight / 2})`,
        );

      const bars = rows
        .append("rect")
        .attr("y", -barHeight / 2)
        .attr("height", barHeight)
        .attr("rx", Math.min(3, barHeight / 2))
        .attr("fill", barFill)
        .attr("x", zeroX)
        .attr("width", 0);
      const barX = (d: BarDatum) => Math.min(zeroX, x(d.value));
      const barW = (d: BarDatum) => Math.abs(x(d.value) - zeroX);
      if (animate) {
        // Named so a hover/update transition on the same rect can never cancel
        // the intro and leave a bar stuck at width 0.
        bars
          .transition("intro")
          .delay(introDelay)
          .duration(INTRO_MS)
          .ease(d3.easeCubicOut)
          .attr("x", barX)
          .attr("width", barW);
      } else {
        bars.attr("x", barX).attr("width", barW);
      }

      svg
        .selectAll("text.bar-label")
        .data(data)
        .enter()
        .append("text")
        .attr("x", labelWidth - LABEL_GAP)
        .attr("y", (_, i) => i * rowHeight + rowHeight / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "central")
        .attr("fill", "currentColor")
        .attr("fill-opacity", 0.65)
        .style("font", FONT)
        // Painted above the row's hit rect, so a glyph would otherwise swallow
        // the pointer and blank the tooltip mid-label.
        .style("pointer-events", "none")
        .text((d) => fitLabel(d.label, labelWidth - LABEL_GAP - LABEL_INSET));

      // Value labels sit on the empty side of the row: positive bars grow
      // right, so the label rides the bar tip; negative bars grow left toward
      // the category-label column, so their label goes just right of zero.
      if (showValues) {
        const valueLabels = rows
          .append("text")
          .attr("x", (d) => (d.value >= 0 ? x(d.value) + 6 : zeroX + 6))
          .attr("text-anchor", "start")
          .attr("dominant-baseline", "central")
          .attr("fill", barFill)
          .style("font", FONT)
          .style("font-weight", "600")
          .text((d) => formatValue(d.value));
        // The value sits at the bar's TIP, so on the intro it would otherwise
        // hang in empty space ahead of a bar still at zero — fade it in with
        // the bar instead of moving it (a moving number is unreadable).
        if (animate)
          valueLabels
            .attr("fill-opacity", 0)
            .transition("intro")
            .delay(introDelay)
            .duration(INTRO_MS)
            .ease(d3.easeCubicOut)
            .attr("fill-opacity", 1);
      }

      rows.attr("aria-label", ariaFor);
      // The visible bar is only 3–18px of a much taller row and the category
      // label sits outside it in the left gutter, so the hover target is the
      // whole row: back across the label column (x starts at -labelWidth, since
      // the rows live inside a g translated by it) and on through the value
      // gutter. Appended last so it sits above the bar and its value label.
      const rowHits = rows
        .append("rect")
        .attr("x", -labelWidth)
        .attr("width", width)
        .attr("y", -rowHeight / 2)
        .attr("height", rowHeight)
        .attr("fill", "transparent");
      attachChartTooltip(rowHits, tooltipFor);
      return hideChartTooltip;
    }

    // vertical
    const bottomPad = 18;
    const topPad = showValues ? 16 : 6;
    const innerHeight = Math.max(plotHeight - bottomPad - topPad, 10);
    const min = Math.min(0, ...data.map((d) => d.value));
    const max = Math.max(0, ...data.map((d) => d.value), 1e-9);
    const y = d3
      .scaleLinear()
      .domain([min, max])
      .range([innerHeight, 0])
      .nice();
    const band = d3
      .scaleBand<number>()
      .domain(data.map((_, i) => i))
      .range([0, width])
      .paddingInner(0.25)
      .paddingOuter(0.05);
    const zeroY = y(0);

    const g = svg.append("g").attr("transform", `translate(0,${topPad})`);

    g.append("line")
      .attr("x1", 0)
      .attr("x2", width)
      .attr("y1", zeroY)
      .attr("y2", zeroY)
      .attr("stroke", "currentColor")
      .attr("stroke-opacity", 0.18);

    const bars = g
      .selectAll("rect.bar")
      .data(data)
      .enter()
      .append("rect")
      .attr("x", (_, i) => band(i) ?? 0)
      .attr("width", band.bandwidth())
      .attr("rx", Math.min(2, band.bandwidth() / 2))
      .attr("fill", barFill)
      .attr("y", zeroY)
      .attr("height", 0);
    const barY = (d: BarDatum) => Math.min(zeroY, y(d.value));
    const barH = (d: BarDatum) => Math.abs(y(d.value) - zeroY);
    if (animate) {
      // Named so a hover/update transition on the same rect can never cancel
      // the intro and leave a bar stuck at height 0.
      bars
        .transition("intro")
        .delay(introDelay)
        .duration(INTRO_MS)
        .ease(d3.easeCubicOut)
        .attr("y", barY)
        .attr("height", barH);
    } else {
      bars.attr("y", barY).attr("height", barH);
    }

    const barHits = g
      .selectAll("rect.bar-hit")
      .data(data)
      .enter()
      .append("rect")
      .attr("x", (_, i) => band(i) ?? 0)
      .attr("width", band.bandwidth())
      .attr("y", 0)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .attr("aria-label", ariaFor);
    attachChartTooltip(barHits, tooltipFor);

    if (showValues && band.bandwidth() >= 26) {
      const valueLabels = g
        .selectAll("text.bar-value")
        .data(data)
        .enter()
        .append("text")
        .attr("x", (_, i) => (band(i) ?? 0) + band.bandwidth() / 2)
        .attr("y", (d) => (d.value >= 0 ? y(d.value) - 4 : y(d.value) + 12))
        .attr("text-anchor", "middle")
        .attr("fill", barFill)
        .style("font", FONT)
        .style("font-weight", "600")
        // Drawn over the column's hit rect; without this a glyph swallows the
        // pointer and the tooltip blinks out right at the bar's tip.
        .style("pointer-events", "none")
        .text((d) => formatValue(d.value));
      // Sits above the bar's tip, so it fades in with the bar rather than
      // floating over a bar that hasn't grown there yet.
      if (animate)
        valueLabels
          .attr("fill-opacity", 0)
          .transition("intro")
          .delay(introDelay)
          .duration(INTRO_MS)
          .ease(d3.easeCubicOut)
          .attr("fill-opacity", 1);
    }

    // Thin category labels when bars outnumber the cap.
    const step = Math.max(1, Math.ceil(data.length / maxTickLabels));
    svg
      .selectAll("text.tick-label")
      .data(data.filter((_, i) => i % step === 0))
      .enter()
      .append("text")
      .attr("x", (d) => {
        const i = data.indexOf(d);
        const cx = (band(i) ?? 0) + band.bandwidth() / 2;
        // Clamp so edge labels don't clip outside the svg.
        return Math.min(Math.max(cx, 16), width - 16);
      })
      .attr("y", plotHeight - 4)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("fill-opacity", 0.55)
      .style("font", FONT)
      .text((d) => d.label);

    // This effect opens by wiping the SVG, so a poll or an unmount destroys the
    // mark under the cursor — without this the tooltip would hang there
    // describing a bar that no longer exists.
    return hideChartTooltip;
  }, [
    data,
    width,
    plotHeight,
    orientation,
    color,
    negativeColor,
    formatValue,
    showValues,
    maxTickLabels,
    shouldIntro,
  ]);

  return (
    <div
      ref={wrapRef}
      className="w-full"
      style={fill ? { height: "100%", minHeight: 0 } : { height }}
    >
      {width !== null && width > 0 && (
        <svg ref={svgRef} width={width} height={plotHeight} />
      )}
    </div>
  );
};

export default memo(BarChart);
