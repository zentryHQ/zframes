import * as d3 from "d3";
import { memo, useEffect, useId, useRef, useState } from "react";
import { attachChartTooltip, hideChartTooltip } from "./lib/chart-tooltip";
import { observeResize } from "./lib/observe-resize";
import { useChartIntro } from "./lib/use-chart-intro";
import { useReducedMotion } from "./lib/use-reduced-motion";

export interface BubbleNode {
  id: string;
  /** Short label drawn on the bubble (e.g. a ticker). */
  label: string;
  /** Relative weight — mapped to bubble area via sqrt. Must be > 0. */
  value: number;
  /** Optional image rendered clipped to the circle (logo, avatar). */
  imageUrl?: string;
  /** Fill when there is no image (or while it loads). */
  color?: string;
  /** Ring color (e.g. gain/loss tint). */
  borderColor?: string;
}

export interface BubbleChartProps {
  nodes: BubbleNode[];
  /** Fixed height in px; omit to fill the container height. */
  height?: number;
  /** Draw labels on bubbles large enough to fit them. Default true. */
  showLabels?: boolean;
  /** Fallback fill for image-less nodes. */
  color?: string;
  /**
   * The node's hover line — the tooltip shows `label` as its title and this
   * string as its single row. Omit and the row falls back to the raw `value`.
   */
  formatTitle?: (node: BubbleNode) => string;
}

interface SimNode extends d3.SimulationNodeDatum {
  node: BubbleNode;
  r: number;
}

const FONT_FAMILY = "'DM Sans', sans-serif";
const DEFAULT_COLOR = "var(--color-highlight, #8b8bff)";

/** First-draw entrance: each bubble scales up from nothing. */
const INTRO_DURATION_MS = 520;
/** Whatever the bubble count, the LAST one still finishes inside this budget. */
const INTRO_TOTAL_MS = 880;
/** Per-bubble stagger ceiling, so a handful of bubbles still arrive briskly. */
const INTRO_MAX_STAGGER_MS = 34;

/** Packing efficiency drops as bubble count grows (circle-packing geometry). */
function packingEfficiency(count: number): number {
  if (count <= 4) return 0.85;
  if (count <= 10) return 0.72;
  if (count <= 20) return 0.6;
  if (count <= 50) return 0.5;
  return 0.42;
}

/** Radii ∝ sqrt(value), uniformly scaled so total bubble area fits the box. */
function computeRadii(
  nodes: BubbleNode[],
  width: number,
  height: number,
): number[] {
  const maxValue = Math.max(...nodes.map((n) => n.value), 1e-9);
  const base = nodes.map((n) => Math.sqrt(Math.max(n.value, 0) / maxValue));
  const baseArea = base.reduce((sum, r) => sum + Math.PI * r * r, 0);
  const usable = width * height * packingEfficiency(nodes.length);
  const scale = Math.sqrt(usable / Math.max(baseArea, 1e-9));
  const maxR = Math.min(width, height) * 0.32;
  return base.map((r) => Math.max(6, Math.min(r * scale, maxR)));
}

/**
 * Force-directed bubble cloud — one circle per item, area by weight, optional
 * logo images, draggable. Ported from Zentry Nexus's bubble-graph (shared/
 * components/charts/bubble-graph). Pure presentation: data in via props,
 * size tracks the container.
 */
const BubbleChart = ({
  nodes,
  height,
  showLabels = true,
  color = DEFAULT_COLOR,
  formatTitle,
}: BubbleChartProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const clipPrefix = useId().replace(/[^a-zA-Z0-9]/g, "");
  const shouldIntro = useChartIntro();
  // Read live, and a dependency of the draw effect below: sampled once per draw
  // instead, turning the preference off left an already-mounted cloud static
  // and undraggable for the rest of the session (B-42).
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      // Keeping the previous object when the size hasn't really moved is what
      // stops a drag-resize from restarting the force simulation: `box` is a
      // dependency of the layout effect below.
      setBox((prev) =>
        prev &&
        Math.abs(prev.w - rect.width) < 0.5 &&
        Math.abs(prev.h - rect.height) < 0.5
          ? prev
          : { w: rect.width, h: rect.height },
      );
    };
    update();
    return observeResize(el, update);
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !box || box.w <= 0 || box.h <= 0 || !nodes.length) return;
    const { w: width, h: height } = box;

    d3.select(svgEl).selectAll("*").remove();
    const svg = d3.select(svgEl);
    const defs = svg.append("defs");
    const g = svg.append("g");

    const radii = computeRadii(nodes, width, height);
    const simNodes: SimNode[] = nodes.map((node, i) => ({
      node,
      r: radii[i],
      // Deterministic golden-angle spiral seed so layouts don't jump between
      // renders of the same data.
      x: width / 2 + Math.cos(i * 2.4) * (8 + i * 6),
      y: height / 2 + Math.sin(i * 2.4) * (8 + i * 6),
    }));

    const padding = 4;
    const clampToBox = (d: SimNode) => {
      d.x = Math.max(d.r + padding, Math.min(width - d.r - padding, d.x ?? 0));
      d.y = Math.max(d.r + padding, Math.min(height - d.r - padding, d.y ?? 0));
    };

    const simulation = d3
      .forceSimulation(simNodes)
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength((0.05 * width) / height))
      .force(
        "collide",
        d3
          .forceCollide<SimNode>()
          .radius((d) => d.r + 1.5)
          .strength(0.9)
          .iterations(3),
      )
      .force("charge", d3.forceManyBody().strength(2))
      .velocityDecay(0.35);

    const item = g
      .selectAll<SVGGElement, SimNode>("g.bubble")
      .data(simNodes)
      .enter()
      .append("g")
      .attr("class", "bubble")
      .attr("cursor", "grab");

    const animateIntro = shouldIntro();
    // Biggest bubbles land first and the small ones fill in behind them, which
    // reads as the cloud packing itself. The delay is derived from the count
    // (never a fixed `i * ms`), so a 60-bubble cloud finishes in the same budget
    // as a 6-bubble one instead of turning into a slideshow.
    const introRank = new Array<number>(simNodes.length).fill(0);
    simNodes
      .map((d, i) => ({ i, r: d.r }))
      .sort((a, b) => b.r - a.r)
      .forEach((entry, rank) => {
        introRank[entry.i] = rank;
      });
    const introStagger =
      simNodes.length > 1
        ? Math.min(
            INTRO_MAX_STAGGER_MS,
            (INTRO_TOTAL_MS - INTRO_DURATION_MS) / (simNodes.length - 1),
          )
        : 0;

    item.each(function (d, i) {
      const outer = d3.select(this);
      // The outer <g> carries the simulation's translate, rewritten on every
      // tick — so the intro scale gets its own child <g>, or the tick handler
      // would stomp the transition 60 times a second.
      const group = outer.append("g").attr("class", "bubble-scale");
      const fill = d.node.color ?? color;

      group
        .append("circle")
        .attr("r", d.r)
        .attr("fill", fill)
        .attr("fill-opacity", d.node.imageUrl ? 0.12 : 0.55);

      if (d.node.imageUrl) {
        defs
          .append("clipPath")
          .attr("id", `${clipPrefix}-${i}`)
          .append("circle")
          .attr("r", d.r);
        group
          .append("image")
          .attr("href", d.node.imageUrl)
          .attr("x", -d.r)
          .attr("y", -d.r)
          .attr("width", d.r * 2)
          .attr("height", d.r * 2)
          .attr("clip-path", `url(#${clipPrefix}-${i})`)
          .attr("preserveAspectRatio", "xMidYMid slice")
          .style("opacity", 0)
          .on("load", function () {
            d3.select(this).transition().duration(300).style("opacity", 0.9);
          });
      }

      group
        .append("circle")
        .attr("r", Math.max(d.r - 1, 1))
        .attr("fill", "none")
        .attr("stroke", d.node.borderColor ?? "currentColor")
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", d.node.borderColor ? 0.75 : 0.15);

      // Only label a bubble the text actually fits inside — a long ticker on a
      // medium bubble used to overflow past the rim (e.g. "MAYC"). Bubbles too
      // small to hold their label stay unlabeled; the name is in the tooltip.
      const fontSize = Math.max(9, Math.min(d.r * 0.42, 15));
      const textWidth = d.node.label.length * fontSize * 0.6;
      if (showLabels && d.r >= 14 && textWidth <= d.r * 2 - 6) {
        group
          .append("text")
          .attr("text-anchor", "middle")
          .attr("dy", "0.35em")
          .attr("fill", "currentColor")
          .attr("fill-opacity", 0.9)
          .attr("paint-order", "stroke")
          .attr("stroke", "rgba(0,0,0,0.55)")
          .attr("stroke-width", 2.5)
          .style("font", `600 ${fontSize}px ${FONT_FAMILY}`)
          .style("pointer-events", "none")
          .text(d.node.label);
      }

      // No <title>: it would surface the browser's own tooltip a second after
      // the custom one, saying the same thing twice. AT reads this instead.
      outer.attr(
        "aria-label",
        formatTitle ? formatTitle(d.node) : d.node.label,
      );

      if (animateIntro) {
        group
          .attr("transform", "scale(0)")
          .transition("intro")
          .delay(introRank[i] * introStagger)
          .duration(INTRO_DURATION_MS)
          .ease(d3.easeCubicOut)
          // attrTween, not a plain `.attr("transform", "scale(1)")`: d3
          // interpolates transform *strings* by parsing them through a live
          // SVGGraphicsElement, which jsdom does not implement. Emitting the
          // string ourselves keeps this a pure attribute write.
          .attrTween("transform", () => (t: number) => `scale(${t})`)
          .on("end", function () {
            // Land on exactly the DOM a redraw produces: no leftover transform.
            d3.select(this).attr("transform", null);
          });
      }
    });

    // Attached to the outer <g>, which has no geometry of its own but receives
    // pointerenter from its descendants — and the base circle covers the whole
    // bubble, so no separate hit target is needed.
    attachChartTooltip(item, (d) => ({
      title: d.node.label,
      rows: [
        {
          value: formatTitle ? formatTitle(d.node) : String(d.node.value),
          color: d.node.borderColor ?? d.node.color ?? color,
        },
      ],
    }));

    const position = () => {
      simNodes.forEach(clampToBox);
      item.attr("transform", (d) => `translate(${d.x},${d.y})`);
    };

    simulation.on("tick", position);

    /**
     * Advance the layout by hand and paint it, with the simulation's own timer
     * stopped. `simulation.tick()` dispatches no "tick" event, hence the
     * explicit `position()`.
     */
    const step = (ticks: number) => {
      for (let i = 0; i < ticks; i++) simulation.tick();
      position();
    };

    if (reducedMotion) {
      // The cloud arrives already settled: no self-propelled motion, ever.
      simulation.stop();
      step(200);
    }

    // Dragging is a FUNCTION, not an animation, so it is attached either way —
    // reduce used to remove it outright, leaving a cloud that could not be
    // rearranged at all. Under reduce the simulation stays stopped and each
    // pointer move advances it a single tick, so the only thing that moves is
    // what the finger is moving.
    item.call(
      d3
        .drag<SVGGElement, SimNode>()
        .on("start", (event) => {
          // The drag captures the pointer, so pointerleave never arrives —
          // and a tooltip riding the cursor through a drag is just noise.
          hideChartTooltip();
          if (!reducedMotion && !event.active) {
            simulation.alphaTarget(0.25).restart();
          }
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        })
        .on("drag", (event) => {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
          if (reducedMotion) step(1);
        })
        .on("end", (event) => {
          if (!reducedMotion && !event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
          // Released under reduce: settle to the rest state in one go rather
          // than letting a cool-down animate the neighbours back.
          if (reducedMotion) step(200);
        }),
    );

    return () => {
      simulation.stop();
      // A redraw wipes the SVG, so the hovered bubble stops existing — without
      // this the tooltip would hang over an empty chart.
      hideChartTooltip();
    };
  }, [
    nodes,
    box,
    showLabels,
    color,
    formatTitle,
    clipPrefix,
    shouldIntro,
    reducedMotion,
  ]);

  return (
    <div
      ref={wrapRef}
      className="h-full w-full"
      style={height ? { height } : undefined}
    >
      {box && box.w > 0 && box.h > 0 && (
        <svg ref={svgRef} width={box.w} height={box.h} />
      )}
    </div>
  );
};

export default memo(BubbleChart);
