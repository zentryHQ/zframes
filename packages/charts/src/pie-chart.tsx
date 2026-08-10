import * as d3 from "d3";
import { useEffect, useRef, memo } from "react";
import { attachChartTooltip, hideChartTooltip } from "./lib/chart-tooltip";
import { useChartIntro } from "./lib/use-chart-intro";
import { prefersReducedMotion } from "./lib/utils";

const COLORS = ["#FF1F5F", "#81FE90"];
/** Module-level so it keeps one identity across renders (it is a dep below). */
const DEFAULT_FORMAT_VALUE = (v: number) => String(v);

interface PieChartData {
  name: string;
  value: number;
}

interface PieChartProps {
  data: PieChartData[];
  width?: number;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  /** Slice colors, applied in order. Defaults to the built-in 2-color set. */
  colors?: string[];
  /** Renders a slice's value in the hover tooltip. */
  formatValue?: (value: number) => string;
  children?: React.ReactNode;
}

const PieChart = ({
  data,
  width = 270,
  height = 270,
  innerRadius = 90,
  outerRadius = 100,
  colors = COLORS,
  formatValue = DEFAULT_FORMAT_VALUE,
  children,
}: PieChartProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const shouldIntro = useChartIntro();

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current);
    const centerX = width / 2;
    const centerY = height / 2;

    const defs = svg.append("defs");

    defs
      .append("filter")
      .attr("id", "glow")
      .append("feGaussianBlur")
      .attr("stdDeviation", "3")
      .attr("result", "coloredBlur");

    defs
      .select("#glow")
      .append("feMerge")
      .selectAll("feMergeNode")
      .data(["coloredBlur", "SourceGraphic"])
      .enter()
      .append("feMergeNode")
      .attr("in", (d) => d);

    defs
      .append("filter")
      .attr("id", "glow-layer")
      .append("feGaussianBlur")
      .attr("stdDeviation", "6")
      .attr("result", "glowBlur");

    defs
      .select("#glow-layer")
      .append("feColorMatrix")
      .attr("type", "matrix")
      .attr("values", "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0")
      .attr("result", "glowColor");

    const pie = d3
      .pie<PieChartData>()
      .value((d) => d.value)
      .padAngle(0.02); // padding between slices

    const arc = d3
      .arc<d3.PieArcDatum<PieChartData>>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(100);

    const glowArc = d3
      .arc<d3.PieArcDatum<PieChartData>>()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius)
      .cornerRadius(100);

    const colorScale = d3
      .scaleOrdinal()
      .domain(data.map((_, i) => i.toString()))
      .range(colors);

    const pieGroup = svg
      .append("g")
      .attr("transform", `translate(${centerX}, ${centerY})`);

    const arcs = pie(data);

    // The paths take their fill from the SELECTION index, and `PieArcDatum.index`
    // is the *sort* position (d3.pie sorts by descending value by default), so
    // the two disagree on any unsorted data — look the colour up per arc.
    const sliceColor = new Map(
      arcs.map((d, i) => [d, colorScale(i.toString()) as string]),
    );
    // A donut is read as parts of a whole, so the share of total — not the raw
    // value — is the number the reader is actually after.
    const total = d3.sum(arcs, (d) => d.data.value);
    const shareOf = (d: d3.PieArcDatum<PieChartData>) =>
      total > 0 ? `${((d.data.value / total) * 100).toFixed(1)}% of total` : "";

    const sliceGroups = pieGroup
      .selectAll("g")
      .data(arcs)
      .enter()
      .append("g");

    // True only inside the grace window that opens at the first real draw, so
    // the sweep survives the re-render burst after first paint (every caller but
    // one passes a fresh `colors` array, which is in the dep array below) while
    // a later redraw — data poll, resize, prop or theme change — paints the
    // finished ring instantly.
    const animate = shouldIntro();
    const sweepFrom = d3.min(arcs, (d) => d.startAngle) ?? 0;
    const sweepTo = d3.max(arcs, (d) => d.endAngle) ?? 2 * Math.PI;

    /**
     * Paints a slice-path selection — instantly at its final geometry, or swept
     * open by one leading edge travelling around the ring, so the donut reads as
     * a single arc drawing itself rather than N slices inflating at once. Only
     * the arc generator's math is touched (no rendered-geometry measurement),
     * so it is safe under jsdom.
     */
    const paintSlices = <PElement extends d3.BaseType, PDatum>(
      selection: d3.Selection<
        SVGPathElement,
        d3.PieArcDatum<PieChartData>,
        PElement,
        PDatum
      >,
      shape: typeof arc,
    ) => {
      if (!animate) {
        selection.attr("d", (d) => shape(d) ?? "");
        return;
      }
      selection
        .attr("d", (d) => shape({ ...d, endAngle: d.startAngle }) ?? "")
        // Named, so a hover landing mid-intro (which transitions the glow
        // layer) cannot cancel the sweep and strand a slice collapsed.
        .transition("intro")
        .duration(700)
        .ease(d3.easeCubicInOut)
        .attrTween("d", (d) => {
          const edge = d3.interpolate(sweepFrom, sweepTo);
          return (t) =>
            shape({
              ...d,
              endAngle: Math.min(Math.max(edge(t), d.startAngle), d.endAngle),
            }) ?? "";
        });
    };

    paintSlices(
      sliceGroups
        .append("path")
        .attr("class", "glow-layer")
        .attr("fill", (_, i) => colorScale(i.toString()) as string)
        .attr("filter", "url(#glow-layer)")
        .style("opacity", 0)
        .style("pointer-events", "none"),
      glowArc,
    );

    paintSlices(
      sliceGroups
        .append("path")
        .attr("class", "main-slice")
        .attr("fill", (_, i) => colorScale(i.toString()) as string)
        .attr("stroke", "none")
        // The visible mark carries the reading assistive tech gets; the hover
        // tooltip is aria-hidden.
        .attr("aria-label", (d) => {
          const share = shareOf(d);
          const value = formatValue(d.data.value);
          return share
            ? `${d.data.name}: ${value} (${share})`
            : `${d.data.name}: ${value}`;
        }),
      arc,
    );

    sliceGroups
      .on("mouseenter", function () {
        d3.select(this)
          .select(".glow-layer")
          .transition()
          .duration(prefersReducedMotion() ? 0 : 300)
          .style("opacity", 1);
      })
      .on("mouseleave", function () {
        d3.select(this)
          .select(".glow-layer")
          .transition()
          .duration(prefersReducedMotion() ? 0 : 300)
          .style("opacity", 0);
      });

    // The group is the hit target: the glow layer ignores pointer events and the
    // main slice fills the ring, so there is nothing thin to miss.
    attachChartTooltip(sliceGroups, (d) => {
      const share = shareOf(d);
      return {
        title: d.data.name,
        rows: [{ value: formatValue(d.data.value), color: sliceColor.get(d) }],
        footer: share || undefined,
      };
    });

    // This effect opens by wiping the SVG, so a poll or unmount destroys the
    // slice under the cursor — without this the tooltip would hang there.
    return hideChartTooltip;
  }, [
    data,
    width,
    height,
    innerRadius,
    outerRadius,
    colors,
    formatValue,
    shouldIntro,
  ]);

  return (
    <div
      className="relative flex flex-col items-center justify-center rounded-full"
      style={{
        background:
          "linear-gradient(0deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 100%)",
      }}
    >
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="relative z-10"
      />

      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            "linear-gradient(0deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0) 100%)",
          maskImage:
            "radial-gradient(farthest-side, transparent calc(100% - 1px),#fff 0)",
          WebkitMaskComposite: "destination-out",
          maskComposite: "exclude",
        }}
      />
      <div
        className="pointer-events-none absolute inset-[10%] rounded-full"
        style={{
          background:
            "linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0) 100%)",
          maskImage:
            "radial-gradient(farthest-side, transparent calc(100% - 1px),#fff 0)",
          WebkitMaskComposite: "destination-out",
          maskComposite: "exclude",
        }}
      />
    </div>
  );
};

export default memo(PieChart);
