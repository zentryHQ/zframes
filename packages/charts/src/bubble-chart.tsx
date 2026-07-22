import * as d3 from "d3";
import { memo, useEffect, useId, useRef, useState } from "react";
import { prefersReducedMotion } from "./lib/utils";

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
  /** Extra tooltip line per node (label is always shown). */
  formatTitle?: (node: BubbleNode) => string;
}

interface SimNode extends d3.SimulationNodeDatum {
  node: BubbleNode;
  r: number;
}

const FONT_FAMILY = "'DM Sans', sans-serif";
const DEFAULT_COLOR = "var(--color-highlight, #8b8bff)";

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

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setBox((prev) =>
        prev &&
        Math.abs(prev.w - rect.width) < 0.5 &&
        Math.abs(prev.h - rect.height) < 0.5
          ? prev
          : { w: rect.width, h: rect.height },
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

    item.each(function (d, i) {
      const group = d3.select(this);
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
      // small to hold their label stay unlabeled; the name is in the <title>.
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

      group
        .append("title")
        .text(formatTitle ? formatTitle(d.node) : d.node.label);
    });

    const position = () => {
      simNodes.forEach(clampToBox);
      item.attr("transform", (d) => `translate(${d.x},${d.y})`);
    };

    if (prefersReducedMotion()) {
      simulation.stop();
      for (let i = 0; i < 200; i++) simulation.tick();
      position();
    } else {
      simulation.on("tick", position);
      item.call(
        d3
          .drag<SVGGElement, SimNode>()
          .on("start", (event) => {
            if (!event.active) simulation.alphaTarget(0.25).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
          })
          .on("drag", (event) => {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
          })
          .on("end", (event) => {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
          }),
      );
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, box, showLabels, color, formatTitle, clipPrefix]);

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
