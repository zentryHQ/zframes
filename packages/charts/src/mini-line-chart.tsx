"use client";
import React, { useEffect, useRef, useMemo, useId, memo } from "react";
import * as d3 from "d3";
import { cn } from "./lib/utils";

interface MiniLineChartProps {
  data: Array<{ date: string; value: number }>;
  width?: number;
  height?: number;
  color?: string;
  className?: string;
  variant?: "default" | "green" | "red" | "auto" | "blue";
}

const MiniLineChartComponent: React.FC<MiniLineChartProps> = ({
  data,
  width = 120,
  height = 40,
  color,
  className,
  variant = "default",
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const rawId = useId();
  const gradientId = `mini-chart-gradient-${rawId.replace(/:/g, "")}`;

  const { strokeColor, isPositive, variantType, customColor } = useMemo(() => {
    if (color) {
      return {
        strokeColor: color,
        isPositive: true,
        variantType: "custom" as const,
        customColor: color,
      };
    }

    if (variant === "auto" && data.length > 0) {
      const firstValue = data[0]?.value ?? 0;
      const lastValue = data[data.length - 1]?.value ?? 0;
      const positive = lastValue >= firstValue;
      return {
        strokeColor: positive
          ? "var(--color-green-500)"
          : "var(--color-red-500)",
        isPositive: positive,
        variantType: positive ? ("green" as const) : ("red" as const),
        customColor: undefined,
      };
    }

    switch (variant) {
      case "green":
        return {
          strokeColor: "var(--color-green-500)",
          isPositive: true,
          variantType: "green" as const,
          customColor: undefined,
        };
      case "red":
        return {
          strokeColor: "var(--color-red-500)",
          isPositive: false,
          variantType: "red" as const,
          customColor: undefined,
        };
      case "blue":
        return {
          strokeColor: "#75A3FF",
          isPositive: true,
          variantType: "blue" as const,
          customColor: undefined,
        };
      default:
        return {
          strokeColor: "var(--color-blue-600)",
          isPositive: true,
          variantType: "blue" as const,
          customColor: undefined,
        };
    }
  }, [color, variant, data]);

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const parsed = data.map((d) => ({
      ...d,
      date: new Date(d.date),
    }));

    const maxPoints = Math.max(30, Math.floor(width / 4));

    if (parsed.length <= maxPoints) {
      return parsed;
    }

    const step = Math.floor(parsed.length / maxPoints);
    const sampled: typeof parsed = [];

    for (let i = 0; i < parsed.length; i += step) {
      sampled.push(parsed[i]);
    }

    if (sampled[sampled.length - 1] !== parsed[parsed.length - 1]) {
      sampled.push(parsed[parsed.length - 1]);
    }

    return sampled;
  }, [data, width]);

  useEffect(() => {
    if (!svgRef.current || !processedData.length) return;

    const svg = d3.select(svgRef.current);
    const margin = { top: 2, right: 0, bottom: 2, left: 0 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg.selectAll("*").remove();

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(processedData, (d) => d.date) as [Date, Date])
      .range([0, innerWidth]);

    const [minValue, maxValue] = d3.extent(processedData, (d) => d.value) as [
      number,
      number,
    ];
    const yPadding = (maxValue - minValue) * 0.4;
    const yScale = d3
      .scaleLinear()
      .domain([minValue - yPadding, maxValue])
      .range([innerHeight, 0]);

    const line = d3
      .line<{ date: Date; value: number }>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add area fill
    const area = d3
      .area<{ date: Date; value: number }>()
      .x((d) => xScale(d.date))
      .y0(innerHeight)
      .y1((d) => yScale(d.value))
      .curve(d3.curveMonotoneX);

    const defs = svg.append("defs");
    const gradient = defs
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    const colorToRgba = (colorStr: string, alpha: number): string => {
      if (colorStr.startsWith("var(")) {
        if (colorStr.includes("blue")) {
          return `rgba(59, 130, 246, ${alpha})`;
        }

        if (colorStr.includes("green")) {
          return `rgba(37, 255, 205, ${alpha})`;
        }
        if (colorStr.includes("red")) {
          return `rgba(239, 68, 68, ${alpha})`;
        }
        return `rgba(59, 130, 246, ${alpha})`; // Default fallback
      }

      // Handle hex colors (#RRGGBB or #RGB)
      if (colorStr.startsWith("#")) {
        const hex = colorStr.slice(1);
        const r =
          hex.length === 3
            ? parseInt(hex[0] + hex[0], 16)
            : parseInt(hex.slice(0, 2), 16);
        const g =
          hex.length === 3
            ? parseInt(hex[1] + hex[1], 16)
            : parseInt(hex.slice(2, 4), 16);
        const b =
          hex.length === 3
            ? parseInt(hex[2] + hex[2], 16)
            : parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }

      if (colorStr.startsWith("rgb")) {
        const match = colorStr.match(/\d+/g);
        if (match && match.length >= 3) {
          return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${alpha})`;
        }
      }

      return `rgba(59, 130, 246, ${alpha})`;
    };

    if (variantType === "custom" && customColor) {
      gradient
        .append("stop")
        .attr("offset", "45.9%")
        .attr("stop-color", colorToRgba(customColor, 0.16));
      gradient
        .append("stop")
        .attr("offset", "96.67%")
        .attr("stop-color", colorToRgba(customColor, 0));
    } else if (variantType === "blue") {
      gradient
        .append("stop")
        .attr("offset", "45.9%")
        .attr("stop-color", "rgba(7, 77, 215, 0.3)");
      gradient
        .append("stop")
        .attr("offset", "96.67%")
        .attr("stop-color", "rgba(7, 77, 215, 0.3)");
    } else if (
      variantType === "green" ||
      (isPositive && variantType !== "red")
    ) {
      gradient
        .append("stop")
        .attr("offset", "45.9%")
        .attr("stop-color", "rgba(63, 194, 167, 0.1)");
      gradient
        .append("stop")
        .attr("offset", "96.67%")
        .attr("stop-color", "rgba(63, 194, 167, 0)");
    } else {
      gradient

        .append("stop")
        .attr("offset", "0%")
        .attr("stop-color", "rgba(255, 93, 127, 0.1)");
      gradient
        .append("stop")
        .attr("offset", "91.8%")
        .attr("stop-color", "rgba(255, 63, 105, 0)");
    }

    g.append("path")
      .datum(processedData)
      .attr("fill", `url(#${gradientId})`)
      .attr("d", area);

    g.append("path")
      .datum(processedData)
      .attr("fill", "none")
      .attr("stroke", strokeColor)
      .attr("stroke-width", 1)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("d", line);
  }, [
    processedData,
    width,
    height,
    strokeColor,
    isPositive,
    variantType,
    customColor,
  ]);

  if (!data || data.length === 0) {
    return <></>;
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-auto max-w-full", className)}
      style={{ width, height: "auto" }}
    />
  );
};

export const MiniLineChart = memo(MiniLineChartComponent);
