import * as d3 from "d3";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/utils";
import { type BinOptions, binSample, normalCurve } from "./utils";

// The binning helpers are re-exported by the package barrel (`@zframes/charts`)
// rather than here, so there is exactly one public path to them.

/** A labelled reference line drawn across the distribution. */
export interface HistogramMarker {
  value: number;
  /** Short label drawn at the top of the line, e.g. "mean" or "today". */
  label: string;
  color?: string;
}

export interface HistogramChartProps extends BinOptions {
  /** Raw observations — the chart owns the binning. */
  values: number[];
  height?: number;
  /**
   * Fill for bars. Applied as a `style`, not an attribute, so a CSS variable
   * (`var(--zf-up, #3fd08f)`) resolves and the bars follow the board's theme.
   */
  color?: string;
  /** When set, bins below zero take this fill — the diverging return split. */
  negativeColor?: string;
  /** x-axis tick + tooltip formatter. */
  formatValue?: (value: number) => string;
  /** y-axis tick + tooltip formatter for observation counts. */
  formatCount?: (count: number) => string;
  /** Reference lines (mean, ±σ, the latest observation…). */
  markers?: HistogramMarker[];
  /** Overlay the normal curve implied by the sample's own mean and σ. */
  showNormalCurve?: boolean;
  /** Draw the count axis and its gridlines. Default true. */
  showYAxis?: boolean;
  maxTickLabels?: number;
}

const FONT = "10px 'DM Sans', sans-serif";
const DEFAULT_COLOR = "var(--color-highlight, #8b8bff)";
/** Room above the bars for marker labels. */
const TOP_PAD = 13;
const BOTTOM_PAD = 20;
const Y_AXIS_WIDTH = 30;
/** Room for the right half of the last x-axis label. */
const MARGIN_RIGHT = 10;
/** Rough per-character width of {@link FONT}, used to fit axis labels. */
const CHAR_PX = 5.6;
/** Clear space required between two x-axis labels. */
const MIN_LABEL_GAP = 8;

/**
 * Distribution histogram — how a sample is *shaped*, rather than where it sits
 * or how it moved.
 *
 * Every level and change chart answers "what is it now"; this answers "how
 * often, and how extreme" — the question behind position sizing and stop
 * placement. Pair it with `showNormalCurve` and the gap between the bars and
 * the curve is the fat tail a normal model would underprice.
 *
 * The chart owns its binning (see {@link binSample}) so every histogram in the
 * app bins the same way: round bin widths, edges anchored at zero, and the
 * extreme tails folded into the end bars instead of flattening the middle.
 *
 * Pure presentation: values in via props, width tracks the container.
 */
const HistogramChart = ({
  values,
  height = 200,
  color = DEFAULT_COLOR,
  negativeColor,
  formatValue = (v) => String(v),
  formatCount = (n) => String(n),
  markers = [],
  showNormalCurve = false,
  showYAxis = true,
  maxTickLabels = 7,
  targetBins,
  maxBins,
  tailTrim,
  anchorZero,
}: HistogramChartProps) => {
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

  const binned = useMemo(
    () => binSample(values, { targetBins, maxBins, tailTrim, anchorZero }),
    [values, targetBins, maxBins, tailTrim, anchorZero],
  );

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !width || width <= 0 || !binned) return;

    d3.select(svgEl).selectAll("*").remove();
    const svg = d3.select(svgEl);
    const { bins, width: binWidth, count, mean, stdev } = binned;

    const marginLeft = showYAxis ? Y_AXIS_WIDTH : 4;
    const innerWidth = Math.max(width - marginLeft - MARGIN_RIGHT, 10);
    const innerHeight = Math.max(height - TOP_PAD - BOTTOM_PAD, 10);

    const domain: [number, number] = [bins[0].x0, bins[bins.length - 1].x1];
    const x = d3.scaleLinear().domain(domain).range([0, innerWidth]);
    const maxCount = Math.max(...bins.map((b) => b.count), 1);
    const y = d3
      .scaleLinear()
      .domain([0, maxCount])
      .range([innerHeight, 0])
      .nice();

    const g = svg
      .append("g")
      .attr("transform", `translate(${marginLeft},${TOP_PAD})`);

    if (showYAxis) {
      const yTicks = y.ticks(Math.max(2, Math.floor(innerHeight / 40)));
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
        .attr("x", -6)
        .attr("y", (t) => y(t))
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "central")
        .attr("fill", "currentColor")
        .attr("fill-opacity", 0.5)
        .style("font", FONT)
        .text((t) => formatCount(t));
    }

    const fillOf = (x0: number) =>
      negativeColor !== undefined && x0 < 0 ? negativeColor : color;

    const bars = g
      .selectAll("rect.bin")
      .data(bins)
      .enter()
      .append("rect")
      // A 1px inset keeps adjacent bars legible as separate bins without a
      // padding ratio that would drift with bin count.
      .attr("x", (b) => x(b.x0) + 0.5)
      .attr("width", () =>
        Math.max(x(domain[0] + binWidth) - x(domain[0]) - 1, 1),
      )
      .attr("rx", 1)
      // `style`, not `attr`: a CSS var in a presentation attribute doesn't
      // resolve, so `var(--zf-up)` would silently fall back to black.
      .style("fill", (b) => fillOf(b.x0))
      .attr("y", innerHeight)
      .attr("height", 0);

    const barY = (b: { count: number }) => y(b.count);
    const barH = (b: { count: number }) => innerHeight - y(b.count);
    if (prefersReducedMotion()) bars.attr("y", barY).attr("height", barH);
    else bars.transition().duration(400).attr("y", barY).attr("height", barH);

    bars.append("title").text((b) => {
      const range = b.openLow
        ? `< ${formatValue(b.x1)}`
        : b.openHigh
          ? `≥ ${formatValue(b.x0)}`
          : `${formatValue(b.x0)} … ${formatValue(b.x1)}`;
      const share = ((b.count / count) * 100).toFixed(1);
      return `${range}: ${formatCount(b.count)} (${share}%)`;
    });

    // The fitted normal, in the same units as bar height — the visual reference
    // the fat tails are read against.
    if (showNormalCurve) {
      const curve = normalCurve(
        mean,
        stdev,
        binWidth,
        count,
        domain[0],
        domain[1],
      );
      if (curve.length)
        g.append("path")
          .attr(
            "d",
            d3
              .line<{ x: number; y: number }>()
              .x((p) => x(p.x))
              // A curve peak taller than the tallest bar would run off the top;
              // the bars are the data, so the reference yields to them.
              .y((p) => y(Math.min(p.y, y.domain()[1])))
              .curve(d3.curveMonotoneX)(curve),
          )
          .attr("fill", "none")
          .style("stroke", "currentColor")
          .attr("stroke-opacity", 0.45)
          .attr("stroke-width", 1.25)
          .attr("stroke-dasharray", "4,3");
    }

    // Zero rule, when the sample straddles it: the reference the sign split is
    // drawn against, so it reads stronger than a gridline.
    if (domain[0] < 0 && domain[1] > 0)
      g.append("line")
        .attr("x1", x(0))
        .attr("x2", x(0))
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", 0.28);

    // Markers are placed left to right with their labels nudged apart. Two
    // markers often land close together — a symbol whose latest move is near its
    // own mean, say — and centring each label on its own line printed "BTC" and
    // "median" straight through each other. The dashed line stays exactly on the
    // value; only the label shifts, and each keeps its own colour and tooltip.
    let labelCursor = Number.NEGATIVE_INFINITY;
    const ordered = markers
      .filter((m) => Number.isFinite(m.value))
      // Clamped into the axis: a marker for an observation out past the folded
      // tail still belongs on screen, at the edge it fell beyond.
      .map((m) => ({
        m,
        mx: x(Math.min(Math.max(m.value, domain[0]), domain[1])),
      }))
      .sort((a, b) => a.mx - b.mx);

    for (const { m: marker, mx } of ordered) {
      const labelWidth = marker.label.length * CHAR_PX;
      let tx = mx;
      if (tx - labelWidth / 2 < labelCursor) tx = labelCursor + labelWidth / 2;
      tx = Math.min(
        Math.max(tx, labelWidth / 2),
        Math.max(innerWidth - labelWidth / 2, labelWidth / 2),
      );
      labelCursor = tx + labelWidth / 2 + MIN_LABEL_GAP;

      const line = g.append("g");
      line
        .append("line")
        .attr("x1", mx)
        .attr("x2", mx)
        .attr("y1", -2)
        .attr("y2", innerHeight)
        .style("stroke", marker.color ?? "currentColor")
        .attr("stroke-opacity", 0.8)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2,2");
      line
        .append("text")
        .attr("x", tx)
        .attr("y", -4)
        .attr("text-anchor", "middle")
        .style("fill", marker.color ?? "currentColor")
        .attr("fill-opacity", 0.85)
        .style("font", FONT)
        .style("font-weight", "600")
        .text(marker.label);
      line
        .append("title")
        .text(`${marker.label}: ${formatValue(marker.value)}`);
    }

    // Round ticks off the linear axis rather than one label per bin edge: bin
    // edges are an implementation detail, and thinning them produced axes that
    // read "-4% -2% 0% 2%" with two of the four elided. Tick count is derived
    // from the width a label actually needs, so a narrow card thins the axis
    // instead of overlapping "+0.80%" into "+1.00%".
    // The folded tails are flagged on the outermost labels themselves («, »)
    // rather than as separate glyphs: a standalone chevron at the domain edge
    // lands on the same pixel as the edge tick label, and "«" overprinting the
    // minus of "−6.00%" reads as "+6.00%" — the sign inverted on screen.
    const openLow = bins[0].openLow === true;
    const openHigh = bins[bins.length - 1].openHigh === true;
    const labelPx =
      (Math.max(...[domain[0], domain[1]].map((v) => formatValue(v).length)) +
        (openLow || openHigh ? 2 : 0)) *
        CHAR_PX +
      10;
    const xTicks = x.ticks(
      Math.max(2, Math.min(maxTickLabels, Math.floor(innerWidth / labelPx))),
    );
    const lastTick = xTicks.length - 1;

    // Lay the labels out as boxes and drop the ones that would collide.
    // The end labels anchor inward so the outermost can't have its "%" clipped
    // by the SVG edge — which shifts it off its tick and into its neighbour, so
    // the overlap has to be resolved rather than assumed away by tick count.
    const placed = xTicks
      .map((t, i) => {
        const open =
          (i === 0 && openLow) || (i === lastTick && openHigh) ? true : false;
        const label = `${i === 0 && openLow ? "« " : ""}${formatValue(t)}${
          i === lastTick && openHigh ? " »" : ""
        }`;
        const px = x(t);
        const w = label.length * CHAR_PX;
        const anchor =
          px < w / 2 ? "start" : px > innerWidth - w / 2 ? "end" : "middle";
        const x1 =
          anchor === "start" ? px : anchor === "end" ? px - w : px - w / 2;
        return {
          label,
          px,
          anchor,
          x1,
          x2: x1 + w,
          open,
          isLast: i === lastTick,
        };
      })
      .reduce<
        {
          label: string;
          px: number;
          anchor: string;
          x1: number;
          x2: number;
          open: boolean;
          isLast: boolean;
        }[]
      >((kept, box) => {
        const prev = kept[kept.length - 1];
        if (prev && box.x1 < prev.x2 + MIN_LABEL_GAP) {
          // The axis ends carry the range, so the outermost label wins the
          // collision and its inward neighbour is the one that goes.
          if (box.isLast) kept.pop();
          else return kept;
        }
        kept.push(box);
        return kept;
      }, []);

    const tickLabels = g
      .selectAll("text.tick-x")
      .data(placed)
      .enter()
      .append("text")
      .attr("x", (b) => b.px)
      .attr("y", innerHeight + 14)
      .attr("text-anchor", (b) => b.anchor)
      .attr("fill", "currentColor")
      .attr("fill-opacity", 0.55)
      .style("font", FONT)
      .text((b) => b.label);
    tickLabels
      .filter((b) => b.open)
      .append("title")
      .text("the extreme tail is folded into this end bar");
  }, [
    binned,
    width,
    height,
    color,
    negativeColor,
    formatValue,
    formatCount,
    markers,
    showNormalCurve,
    showYAxis,
    maxTickLabels,
  ]);

  return (
    <div ref={wrapRef} className="w-full" style={{ height }}>
      {width !== null && width > 0 && binned && (
        <svg ref={svgRef} width={width} height={height} />
      )}
    </div>
  );
};

export default memo(HistogramChart);
