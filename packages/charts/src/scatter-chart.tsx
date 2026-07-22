import * as d3 from "d3";
import { memo, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./lib/utils";

export interface ScatterDatum {
  id: string;
  /** Short label drawn beside the dot (e.g. a ticker). */
  label: string;
  x: number;
  y: number;
  /** Relative bubble weight — mapped to area via sqrt. Default 1. */
  weight?: number;
  color?: string;
}

export interface ScatterChartProps {
  data: ScatterDatum[];
  height?: number;
  /** "log" needs strictly positive y values. Default linear. */
  yScale?: "linear" | "log";
  color?: string;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  /** Draw a dashed reference line at x = 0. Default false. */
  zeroXLine?: boolean;
  /** Bubble radius range in px. Default [3, 14]. */
  radiusRange?: [number, number];
  /** Label the N heaviest bubbles. Default 12. */
  maxLabels?: number;
}

const FONT = "10px 'DM Sans', sans-serif";
const DEFAULT_COLOR = "var(--color-highlight, #8b8bff)";

/**
 * X/Y bubble scatter — correlation / distribution views (e.g. market cap vs
 * 24h change). Pure presentation: data in via props, width tracks the
 * container, weights map to bubble area.
 */
const ScatterChart = ({
  data,
  height = 220,
  yScale = "linear",
  color = DEFAULT_COLOR,
  formatX = (v) => String(v),
  formatY = (v) => String(v),
  zeroXLine = false,
  radiusRange = [3, 14],
  maxLabels = 12,
}: ScatterChartProps) => {
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

    const margin = { top: 10, right: 16, bottom: 22, left: 46 };
    const innerWidth = Math.max(width - margin.left - margin.right, 10);
    const innerHeight = Math.max(height - margin.top - margin.bottom, 10);

    const xExtent = d3.extent(data, (d) => d.x) as [number, number];
    const xPad = (xExtent[1] - xExtent[0] || 1) * 0.08;
    const x = d3
      .scaleLinear()
      .domain([
        Math.min(xExtent[0] - xPad, zeroXLine ? 0 : Infinity),
        Math.max(xExtent[1] + xPad, zeroXLine ? 0 : -Infinity),
      ])
      .range([0, innerWidth])
      .nice();

    const yValues = data.map((d) => d.y);
    const y =
      yScale === "log"
        ? d3
            .scaleLog()
            .domain([
              Math.min(...yValues) * 0.7,
              Math.max(...yValues) * 1.4,
            ])
            .range([innerHeight, 0])
        : d3
            .scaleLinear()
            .domain(d3.extent(yValues) as [number, number])
            .range([innerHeight, 0])
            .nice();

    const r = d3
      .scaleSqrt()
      .domain([0, Math.max(...data.map((d) => d.weight ?? 1), 1e-9)])
      .range([radiusRange[0], radiusRange[1]]);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // grid + axes
    const xTicks = x.ticks(Math.max(2, Math.floor(innerWidth / 90)));
    // A log scale's default ticks label every mantissa step (200, 300, … 900)
    // and collide; keep powers of 10 only, falling back when the domain spans
    // less than one decade.
    const rawYTicks = y.ticks(4);
    const decadeTicks = rawYTicks.filter((t) => {
      const exp = Math.log10(t);
      return Math.abs(exp - Math.round(exp)) < 1e-9;
    });
    const yTicks =
      yScale === "log" && decadeTicks.length >= 2 ? decadeTicks : rawYTicks;
    g.selectAll("line.grid-y")
      .data(yTicks)
      .enter()
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", (t) => y(t))
      .attr("y2", (t) => y(t))
      .attr("stroke", "currentColor")
      .attr("stroke-opacity", 0.08);
    g.selectAll("text.tick-y")
      .data(yTicks)
      .enter()
      .append("text")
      .attr("x", -8)
      .attr("y", (t) => y(t))
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "central")
      .attr("fill", "currentColor")
      .attr("fill-opacity", 0.5)
      .style("font", FONT)
      .text((t) => formatY(t));
    g.selectAll("text.tick-x")
      .data(xTicks)
      .enter()
      .append("text")
      .attr("x", (t) => x(t))
      .attr("y", innerHeight + 15)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("fill-opacity", 0.5)
      .style("font", FONT)
      .text((t) => formatX(t));

    if (zeroXLine)
      g.append("line")
        .attr("x1", x(0))
        .attr("x2", x(0))
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", 0.22)
        .attr("stroke-dasharray", "3,3");

    const dots = g
      .selectAll("circle.dot")
      .data(data)
      .enter()
      .append("circle")
      .attr("cx", (d) => x(d.x))
      .attr("cy", (d) => y(d.y))
      .attr("fill", (d) => d.color ?? color)
      .attr("fill-opacity", 0.55)
      .attr("stroke", (d) => d.color ?? color)
      .attr("stroke-opacity", 0.9)
      .attr("r", 0);
    const radius = (d: ScatterDatum) => r(d.weight ?? 1);
    if (prefersReducedMotion()) dots.attr("r", radius);
    else dots.transition().duration(400).attr("r", radius);

    dots
      .append("title")
      .text(
        (d) => `${d.label} · x ${formatX(d.x)} · y ${formatY(d.y)}`,
      );

    // Label the heaviest points first, but keep it legible: greedily drop any
    // label whose box would overlap one already placed (dense clusters would
    // otherwise pile 12 tickers on top of each other). Labels near an edge
    // switch to start/end anchoring so a wide label at the extreme x never
    // clips past the plot. Every point still carries a hover <title>.
    const LABEL_CHAR_PX = 6;
    const LABEL_H = 11;
    type LabelBox = { x1: number; x2: number; y1: number; y2: number };
    const placed: LabelBox[] = [];
    const labeled = [...data]
      .sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))
      .slice(0, maxLabels)
      .map((d) => {
        const fullW = d.label.length * LABEL_CHAR_PX + 4;
        const px = x(d.x);
        const cy = y(d.y) - radius(d) - 3;
        // Anchor & box, kept inside [0, innerWidth].
        let anchor: "start" | "middle" | "end";
        let tx: number;
        let x1: number;
        if (px - fullW / 2 < 0) {
          anchor = "start";
          tx = 0;
          x1 = 0;
        } else if (px + fullW / 2 > innerWidth) {
          anchor = "end";
          tx = innerWidth;
          x1 = innerWidth - fullW;
        } else {
          anchor = "middle";
          tx = px;
          x1 = px - fullW / 2;
        }
        return { d, anchor, tx, cy, x1, x2: x1 + fullW };
      })
      .filter((c) => {
        const overlaps = placed.some(
          (p) =>
            c.x1 < p.x2 &&
            c.x2 > p.x1 &&
            c.cy - LABEL_H < p.y2 &&
            c.cy + 2 > p.y1,
        );
        if (overlaps) return false;
        placed.push({ x1: c.x1, x2: c.x2, y1: c.cy - LABEL_H, y2: c.cy + 2 });
        return true;
      });
    g.selectAll("text.dot-label")
      .data(labeled)
      .enter()
      .append("text")
      .attr("x", (c) => c.tx)
      .attr("y", (c) => c.cy)
      .attr("text-anchor", (c) => c.anchor)
      .attr("fill", "currentColor")
      .attr("fill-opacity", 0.75)
      .style("font", FONT)
      .style("font-weight", "600")
      .style("pointer-events", "none")
      .text((c) => c.d.label);
  }, [
    data,
    width,
    height,
    yScale,
    color,
    formatX,
    formatY,
    zeroXLine,
    radiusRange,
    maxLabels,
  ]);

  return (
    <div ref={wrapRef} className="w-full" style={{ height }}>
      {width !== null && width > 0 && (
        <svg ref={svgRef} width={width} height={height} />
      )}
    </div>
  );
};

export default memo(ScatterChart);
