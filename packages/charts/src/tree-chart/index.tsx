"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import * as d3 from "d3-hierarchy";
import { cn } from "../lib/utils";

export interface LeafComponentProps<T> {
  width: number;
  height: number;
  data: T;
  columnIndex?: number;
}
export interface TreeNode {
  id: string;
  value: number;
  children?: TreeNode[];
}

export type TileMode = "squarify" | "vertical-rectangle";

const BORDER_RADIUS = "4px";
const CORNER_BORDER_RADIUS = "4px";

const TARGET_ASPECT_RATIO = 2.5;

const treemapVerticalSquarify = <T,>(
  parent: d3.HierarchyRectangularNode<T>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) => {
  const nodes = parent.children;
  if (!nodes || nodes.length === 0) return;

  const worst = (
    column: d3.HierarchyRectangularNode<T>[],
    columnSum: number,
    areaHeight: number,
    remainingValue: number,
    remainingWidth: number,
  ) => {
    if (remainingValue === 0) return Infinity;

    const columnWidth = (columnSum / remainingValue) * remainingWidth;
    if (columnWidth === 0) return Infinity;

    let worstDistance = 0;
    for (const node of column) {
      const nodeValue = node.value || 0;
      const tileHeight = (nodeValue / columnSum) * areaHeight;

      const currentRatio = columnWidth / tileHeight;

      const distance = Math.abs(currentRatio - TARGET_ASPECT_RATIO);

      worstDistance = Math.max(worstDistance, distance);
    }
    return worstDistance;
  };

  const layoutColumn = (
    column: d3.HierarchyRectangularNode<T>[],
    columnSum: number,
    remainingValue: number,
    areaHeight: number,
    remainingWidth: number,
    areaX: number,
    areaY: number,
  ) => {
    const columnWidth = (columnSum / remainingValue) * remainingWidth;
    let currentY = areaY;

    for (const node of column) {
      const nodeValue = node.value || 0;
      const tileHeight = (nodeValue / columnSum) * areaHeight;

      node.x0 = areaX;
      node.y0 = currentY;
      node.x1 = areaX + columnWidth;
      node.y1 = currentY + tileHeight;

      currentY += tileHeight;
    }

    return columnWidth;
  };

  const width = x1 - x0;
  const height = y1 - y0;
  const totalValue = nodes.reduce((sum, n) => sum + (n.value || 0), 0);

  if (totalValue === 0) return;

  let remainingNodes = [...nodes];
  let currentX = x0;
  let remainingWidth = width;
  let remainingValue = totalValue;

  while (remainingNodes.length > 0) {
    let column: d3.HierarchyRectangularNode<T>[] = [];
    let columnSum = 0;

    for (let i = 0; i < remainingNodes.length; i++) {
      const node = remainingNodes[i];
      const nodeValue = node.value || 0;
      const newColumn = [...column, node];
      const newColumnSum = columnSum + nodeValue;

      if (column.length === 0) {
        column = newColumn;
        columnSum = newColumnSum;
      } else {
        const currentWorst = worst(
          column,
          columnSum,
          height,
          remainingValue,
          remainingWidth,
        );
        const newWorst = worst(
          newColumn,
          newColumnSum,
          height,
          remainingValue,
          remainingWidth,
        );

        if (newWorst <= currentWorst) {
          column = newColumn;
          columnSum = newColumnSum;
        } else {
          break;
        }
      }
    }

    const columnWidth = layoutColumn(
      column,
      columnSum,
      remainingValue,
      height,
      remainingWidth,
      currentX,
      y0,
    );

    remainingNodes = remainingNodes.slice(column.length);
    currentX += columnWidth;
    remainingWidth -= columnWidth;
    remainingValue -= columnSum;
  }
};

function TreeChartInner<T extends TreeNode>({
  data,
  className,
  LeafComponent,
  getColorValue,
  tileMode = "squarify",
}: {
  data: T[];
  className?: string;
  LeafComponent: (props: LeafComponentProps<T>) => React.ReactNode;
  getColorValue?: (data: T) => number;
  tileMode?: TileMode;
}) {
  const outerContainerRef = useRef<HTMLDivElement | null>(null);
  const innerContainerRef = useRef<HTMLDivElement | null>(null);
  const topLeftChildRef = useRef<HTMLDivElement | null>(null);
  const bottomLeftChildRef = useRef<HTMLDivElement | null>(null);
  const topRightChildRef = useRef<HTMLDivElement | null>(null);
  const bottomRightChildRef = useRef<HTMLDivElement | null>(null);
  const [, startTransition] = useTransition();
  const [dimension, setDimension] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  useEffect(() => {
    const container = outerContainerRef.current;
    if (container) {
      const observer = new ResizeObserver(() => {
        startTransition(() => {
          setDimension({
            width: container.offsetWidth,
            height: container.offsetHeight,
          });
        });
      });
      observer.observe(container);
      return () => {
        observer.disconnect();
      };
    }
  }, []);

  useEffect(() => {
    const container = innerContainerRef.current;
    if (container) {
      const childrens = container.children;
      let topLeftChild = childrens[0] as HTMLDivElement;
      let bottomLeftChild = childrens[0] as HTMLDivElement;
      let topRightChild = childrens[0] as HTMLDivElement;
      let bottomRightChild = childrens[0] as HTMLDivElement;
      for (let i = 0; i < childrens.length; i++) {
        const child = childrens[i] as HTMLDivElement;
        const { x, y } = child.getBoundingClientRect();
        const topLeftChildPosition = topLeftChild.getBoundingClientRect();
        const bottomLeftChildPosition = bottomLeftChild.getBoundingClientRect();
        const topRightChildPosition = topRightChild.getBoundingClientRect();
        const bottomRightChildPosition =
          bottomRightChild.getBoundingClientRect();
        if (x <= topLeftChildPosition.x && y <= topLeftChildPosition.y) {
          topLeftChild = child;
        }
        if (x <= bottomLeftChildPosition.x && y >= bottomLeftChildPosition.y) {
          bottomLeftChild = child;
        }
        if (x >= topRightChildPosition.x && y <= topRightChildPosition.y) {
          topRightChild = child;
        }
        if (
          x >= bottomRightChildPosition.x &&
          y >= bottomRightChildPosition.y
        ) {
          bottomRightChild = child;
        }
      }
      if (topLeftChildRef.current) {
        topLeftChildRef.current.style.borderTopLeftRadius = BORDER_RADIUS;
      }
      topLeftChildRef.current = topLeftChild;
      topLeftChildRef.current.style.borderTopLeftRadius = CORNER_BORDER_RADIUS;

      if (bottomLeftChildRef.current) {
        bottomLeftChildRef.current.style.borderBottomLeftRadius = BORDER_RADIUS;
      }
      bottomLeftChildRef.current = bottomLeftChild;
      bottomLeftChildRef.current.style.borderBottomLeftRadius =
        CORNER_BORDER_RADIUS;

      if (topRightChildRef.current) {
        topRightChildRef.current.style.borderTopRightRadius = BORDER_RADIUS;
      }
      topRightChildRef.current = topRightChild;
      topRightChildRef.current.style.borderTopRightRadius =
        CORNER_BORDER_RADIUS;

      if (bottomRightChildRef.current) {
        bottomRightChildRef.current.style.borderBottomRightRadius =
          BORDER_RADIUS;
      }
      bottomRightChildRef.current = bottomRightChild;
      bottomRightChildRef.current.style.borderBottomRightRadius =
        CORNER_BORDER_RADIUS;
    }
  }, [dimension]);

  const tileFunction = useMemo(() => {
    switch (tileMode) {
      case "vertical-rectangle":
        return treemapVerticalSquarify;
      case "squarify":
      default:
        return d3.treemapSquarify;
    }
  }, [tileMode]);

  const root = useMemo(() => {
    return d3
      .treemap<T>()
      .size([dimension.width, dimension.height])
      .tile(tileFunction)
      .paddingInner(4)(
      d3
        .hierarchy({
          id: "root",
          value: 0,
          children: data,
        } as unknown as T)
        .sum((d) => d.value)
        .sort((a, b) => b.data.value - a.data.value),
    );
  }, [data, dimension.width, dimension.height, tileFunction]);

  const memoizedLeaves = useMemo(() => {
    const leaves = root.leaves();

    const colorValues = leaves.map((leaf) =>
      getColorValue ? getColorValue(leaf.data) : leaf.data.value,
    );

    const positiveValues = colorValues.filter((c) => c >= 0);
    const negativeValues = colorValues.filter((c) => c < 0);

    const positiveMin =
      positiveValues.length > 0 ? Math.min(...positiveValues) : 0;
    const positiveMax =
      positiveValues.length > 0 ? Math.max(...positiveValues) : 0;
    const negativeMin =
      negativeValues.length > 0 ? Math.min(...negativeValues) : 0;
    const negativeMax =
      negativeValues.length > 0 ? Math.max(...negativeValues) : 0;

    const getColorIntensity = (colorValue: number) => {
      if (colorValue < 0) {
        if (negativeMax === negativeMin) return 1;
        return (colorValue - negativeMax) / (negativeMin - negativeMax);
      } else {
        if (positiveMax === positiveMin) return 1;
        return (colorValue - positiveMin) / (positiveMax - positiveMin);
      }
    };

    // Diverging up/down ramp, tuned for a dark indigo ground. Hues are picked
    // so the dimmest tiles still read as red/green instead of muddy: orange-reds
    // (hue ~4) turn brown at low lightness, so down uses a crimson hue that stays
    // red even when dark; up uses a calm emerald rather than neon mint. Each side
    // gets its own lightness/saturation curve, floored well above black so the
    // smallest movers are legible without the brightest ones going garish.
    const getColor = (intensity: number, colorValue: number): string => {
      if (colorValue >= 0) {
        const l = Math.round(34 + intensity * 16); // 34% → 50%
        const s = Math.round(42 + intensity * 20); // 42% → 62%
        return `hsl(152 ${s}% ${l}%)`;
      }
      const l = Math.round(36 + intensity * 15); // 36% → 51%
      const s = Math.round(48 + intensity * 22); // 48% → 70%
      return `hsl(350 ${s}% ${l}%)`;
    };

    const uniqueX0Values = [...new Set(leaves.map((leaf) => leaf.x0))].sort(
      (a, b) => a - b,
    );
    const x0ToColumnIndex = new Map(
      uniqueX0Values.map((x0, index) => [x0, index]),
    );

    return leaves.map((leaf) => {
      const width = leaf.x1 - leaf.x0;
      const height = leaf.y1 - leaf.y0;
      const colorValue = getColorValue
        ? getColorValue(leaf.data)
        : leaf.data.value;
      const intensity = getColorIntensity(colorValue);
      const columnIndex = x0ToColumnIndex.get(leaf.x0) ?? 0;

      const baseColor = getColor(intensity, colorValue);

      return (
        <div
          className="group absolute cursor-pointer rounded-sm border border-transparent hover:bg-[radial-gradient(146.13%_118.42%_at_50%_-15.5%,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0)_99.59%)] hover:bg-gradient-to-t"
          key={`${leaf.data.id}-box`}
          style={{
            left: leaf.x0,
            top: leaf.y0,
            width,
            height,
            borderRadius: BORDER_RADIUS,
            backgroundColor: baseColor,
          }}
        >
          <LeafComponent
            width={width}
            height={height}
            data={leaf.data}
            columnIndex={columnIndex}
          />
        </div>
      );
    });
  }, [root, LeafComponent, getColorValue]);

  return (
    <div className={cn("h-full w-full", className)} ref={outerContainerRef}>
      <div
        className="relative overflow-hidden rounded-lg"
        style={{ height: dimension.height, width: dimension.width }}
        ref={innerContainerRef}
      >
        {memoizedLeaves}
      </div>
    </div>
  );
}

const TreeChart = TreeChartInner as <T extends TreeNode>(props: {
  data: T[];
  className?: string;
  LeafComponent: (props: LeafComponentProps<T>) => React.ReactNode;
  getColorValue?: (data: T) => number;
  tileMode?: TileMode;
}) => React.ReactElement;

export default TreeChart;
