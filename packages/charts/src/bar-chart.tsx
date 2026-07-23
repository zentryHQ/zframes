import * as d3 from "d3";
import { memo, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./lib/utils";

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
 * Truncate a label with a trailing ellipsis so its rendered width never
 * exceeds `maxPx` — keeps long category names from overflowing the label
 * gutter and clipping their leading characters at the SVG's left edge. The
 * full label is preserved in the row's hover `<title>`.
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
  formatValue = (v) => String(Math.round(v)),
  showValues = true,
  maxTickLabels = 8,
}: BarChartProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      setWidth((prev) =>
        prev !== null && Math.abs(prev - w) < 0.5 ? prev : w,
      );
    };
    update();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !width || width <= 0 || !data.length) return;

    d3.select(svgEl).selectAll("*").remove();
    const svg = d3.select(svgEl);
    const barFill = (d: BarDatum) =>
      d.color ?? (negativeColor && d.value < 0 ? negativeColor : color);
    const animate = !prefersReducedMotion();

    if (orientation === "horizontal") {
      const labelWidth = Math.min(
        Math.max(...data.map((d) => d.label.length)) * CHAR_PX +
          LABEL_GAP +
          LABEL_INSET,
        width * 0.35,
      );
      const valuePad = showValues ? 52 : 8;
      const innerWidth = Math.max(width - labelWidth - valuePad, 10);
      const rowHeight = height / data.length;
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
          .attr("y2", height)
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
      if (animate)
        bars.transition().duration(400).attr("x", barX).attr("width", barW);
      else bars.attr("x", barX).attr("width", barW);

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
        .text((d) => fitLabel(d.label, labelWidth - LABEL_GAP - LABEL_INSET));

      // Value labels sit on the empty side of the row: positive bars grow
      // right, so the label rides the bar tip; negative bars grow left toward
      // the category-label column, so their label goes just right of zero.
      if (showValues)
        rows
          .append("text")
          .attr("x", (d) => (d.value >= 0 ? x(d.value) + 6 : zeroX + 6))
          .attr("text-anchor", "start")
          .attr("dominant-baseline", "central")
          .attr("fill", barFill)
          .style("font", FONT)
          .style("font-weight", "600")
          .text((d) => formatValue(d.value));

      rows.append("title").text((d) => `${d.label}: ${formatValue(d.value)}`);
      return;
    }

    // vertical
    const bottomPad = 18;
    const topPad = showValues ? 16 : 6;
    const innerHeight = Math.max(height - bottomPad - topPad, 10);
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
    if (animate)
      bars.transition().duration(400).attr("y", barY).attr("height", barH);
    else bars.attr("y", barY).attr("height", barH);

    g.selectAll("rect.bar-hit")
      .data(data)
      .enter()
      .append("rect")
      .attr("x", (_, i) => band(i) ?? 0)
      .attr("width", band.bandwidth())
      .attr("y", 0)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .append("title")
      .text((d) => `${d.label}: ${formatValue(d.value)}`);

    if (showValues && band.bandwidth() >= 26)
      g.selectAll("text.bar-value")
        .data(data)
        .enter()
        .append("text")
        .attr("x", (_, i) => (band(i) ?? 0) + band.bandwidth() / 2)
        .attr("y", (d) => (d.value >= 0 ? y(d.value) - 4 : y(d.value) + 12))
        .attr("text-anchor", "middle")
        .attr("fill", barFill)
        .style("font", FONT)
        .style("font-weight", "600")
        .text((d) => formatValue(d.value));

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
      .attr("y", height - 4)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("fill-opacity", 0.55)
      .style("font", FONT)
      .text((d) => d.label);
  }, [
    data,
    width,
    height,
    orientation,
    color,
    negativeColor,
    formatValue,
    showValues,
    maxTickLabels,
  ]);

  return (
    <div ref={wrapRef} className="w-full" style={{ height }}>
      {width !== null && width > 0 && (
        <svg ref={svgRef} width={width} height={height} />
      )}
    </div>
  );
};

export default memo(BarChart);
