import * as d3 from "d3";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { attachChartTooltip, hideChartTooltip } from "../lib/chart-tooltip";
import { observeResize } from "../lib/observe-resize";
import { useChartIntro } from "../lib/use-chart-intro";
import {
  type BinOptions,
  type HistogramBin,
  binSample,
  normalCurve,
} from "./utils";

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
 * Module-level so omitted props keep one identity across renders — they sit in
 * the redraw effect's deps, and fresh defaults rebuilt the chart on every render
 * of the card.
 */
const DEFAULT_FORMAT = (v: number) => String(v);
const NO_MARKERS: HistogramMarker[] = [];
/** Hover width of a marker's 1px rule. */
const MARKER_HIT_W = 12;
/** What the « / » flags on the outermost tick labels mean. */
const TAIL_HINT = "the extreme tail is folded into this end bar";

/**
 * Intro (first-draw) timings. The bars grow from the axis with a short
 * left-to-right stagger, and the derived overlays (fitted normal, markers) fade
 * in over the tail of that growth. The stagger is a *total* budget divided by
 * the bin count rather than a fixed per-bar delay: a 60-bin distribution would
 * otherwise take seconds to finish arriving.
 */
const BAR_DURATION = 480;
const BAR_STAGGER_TOTAL = 220;
const BAR_STAGGER_MAX = 22;
const OVERLAY_DELAY = 200;
const OVERLAY_DURATION = 320;

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
  formatValue = DEFAULT_FORMAT,
  formatCount = DEFAULT_FORMAT,
  markers = NO_MARKERS,
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
  /**
   * The intro plays only inside a short window that opens at the first real
   * draw — so it survives the re-render burst around first paint, but a data
   * poll or resize minutes later never re-grows the card from zero.
   */
  const shouldIntro = useChartIntro();

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
    return observeResize(el, update);
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
    // Asked here, past the guards above: the first run of this effect usually
    // bails on a null width, and opening the window before that would spend it
    // on a draw that never happened.
    const animate = shouldIntro();

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

    // Every bin is the same width, so it is measured once off the domain start —
    // and shared with the hover targets below, which have to stay bar-aligned.
    // A 1px inset keeps adjacent bars legible as separate bins without a
    // padding ratio that would drift with bin count.
    const barW = Math.max(x(domain[0] + binWidth) - x(domain[0]) - 1, 1);

    const bars = g
      .selectAll("rect.bin")
      .data(bins)
      .enter()
      .append("rect")
      .attr("x", (b) => x(b.x0) + 0.5)
      .attr("width", barW)
      .attr("rx", 1)
      // `style`, not `attr`: a CSS var in a presentation attribute doesn't
      // resolve, so `var(--zf-up)` would silently fall back to black.
      .style("fill", (b) => fillOf(b.x0));

    const barY = (b: { count: number }) => y(b.count);
    const barH = (b: { count: number }) => innerHeight - y(b.count);
    if (!animate) {
      // Redraw, or reduced motion: paint the final bars with no transition
      // scheduled, so nothing re-grows and nothing is left mid-flight.
      bars.attr("y", barY).attr("height", barH);
    } else {
      // Grow out of the count axis — a bar rising from zero reads as "this many
      // observations landed here", where a fade or a slide would just decorate.
      bars.attr("y", innerHeight).attr("height", 0);
      const step =
        bins.length > 1
          ? Math.min(BAR_STAGGER_TOTAL / (bins.length - 1), BAR_STAGGER_MAX)
          : 0;
      bars
        // Named so a hover — the tooltip's hit columns sit over these rects, and
        // frames layer their own interactions on top — can't cancel the wrong
        // transition or leave a bar stranded at height 0.
        .transition("intro")
        .delay((_, i) => i * step)
        .duration(BAR_DURATION)
        .ease(d3.easeCubicOut)
        .attr("y", barY)
        .attr("height", barH);
    }

    // An open end bar covers everything past its edge, so it names one side of
    // its interval rather than pretending to be one bin wide.
    const rangeOf = (b: HistogramBin) =>
      b.openLow
        ? `< ${formatValue(b.x1)}`
        : b.openHigh
          ? `≥ ${formatValue(b.x0)}`
          : `${formatValue(b.x0)} … ${formatValue(b.x1)}`;
    const shareOf = (b: HistogramBin) => ((b.count / count) * 100).toFixed(1);
    bars.attr(
      "aria-label",
      (b) => `${rangeOf(b)}: ${formatCount(b.count)} (${shareOf(b)}%)`,
    );

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
      if (curve.length) {
        const path = g
          .append("path")
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
        // The fitted normal is computed from this very sample, so it belongs to
        // the intro rather than to the chrome — it fades in over the tail of the
        // bars' growth, once there is a shape for it to be read against. A
        // dash-offset draw-in is deliberately out: the curve is already dashed
        // for legibility, and measuring it needs `getTotalLength`, which jsdom
        // doesn't implement.
        if (animate)
          path
            .attr("opacity", 0)
            .transition("intro")
            .delay(OVERLAY_DELAY)
            .duration(OVERLAY_DURATION)
            .ease(d3.easeCubicOut)
            .attr("opacity", 1);
      }
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

    // A bar is only as tall as its count, so the rare bins — the tails, which
    // are the whole point of a distribution — are a few pixels of hover target.
    // The tooltip hangs off a full-height transparent column per bin instead.
    // Appended after the fitted curve and the zero rule so their strokes can't
    // take the pointer off a column mid-sweep and strobe the tooltip.
    const binHits = g
      .selectAll("rect.bin-hit")
      .data(bins)
      .enter()
      .append("rect")
      .attr("x", (b) => x(b.x0) + 0.5)
      .attr("width", barW)
      .attr("y", 0)
      .attr("height", innerHeight)
      .attr("fill", "transparent");
    attachChartTooltip(binHits, (b) => ({
      title: rangeOf(b),
      rows: [
        { label: "count", value: formatCount(b.count), color: fillOf(b.x0) },
      ],
      footer: `${shareOf(b)}% of ${formatCount(count)}`,
    }));

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
      line.attr("aria-label", `${marker.label}: ${formatValue(marker.value)}`);
      // The rule is a 1px dashed line, so the hover target is a band centred on
      // it. Last in the group, so the rule and its label can't take the pointer
      // off the band; transparent either way, so the group's intro fade below
      // shows nothing of it.
      const markerHit = line
        .append("rect")
        .attr("x", mx - MARKER_HIT_W / 2)
        .attr("width", MARKER_HIT_W)
        .attr("y", 0)
        .attr("height", innerHeight)
        .attr("fill", "transparent");
      attachChartTooltip(markerHit, () => ({
        title: marker.label,
        rows: [{ value: formatValue(marker.value), color: marker.color }],
      }));
      // Markers are readings off this sample (mean, ±σ, the latest observation),
      // not chrome like the zero rule or the gridlines — so they arrive with the
      // curve, on the group so the rule and its label fade as one.
      if (animate)
        line
          .attr("opacity", 0)
          .transition("intro")
          .delay(OVERLAY_DELAY)
          .duration(OVERLAY_DURATION)
          .ease(d3.easeCubicOut)
          .attr("opacity", 1);
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
    // The « / » flags need an explanation somewhere, and the label itself is the
    // only thing carrying them — so the end labels keep the affordance, as a
    // tooltip rather than a native title.
    const openTicks = tickLabels.filter((b) => b.open);
    openTicks.attr("aria-label", (b) => `${b.label}: ${TAIL_HINT}`);
    attachChartTooltip(openTicks, (b) => ({
      title: b.label,
      footer: TAIL_HINT,
    }));

    // The next run opens with `selectAll("*").remove()`, so a poll or an unmount
    // destroys the mark under the cursor — leaving a tooltip pointing at nothing.
    return hideChartTooltip;
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
    shouldIntro,
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
