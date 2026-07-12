import { useState, useRef, useCallback, useEffect } from "react";

export interface UseHeatmapTooltipOptions {
  verticalOffset?: number;
  delay?: number;
}

/**
 * Hook for managing heatmap tooltip positioning and visibility.
 * Follows the same pattern as useTreemapTooltip for consistency.
 *
 * @example
 * ```tsx
 * const {
 *   hoveredData,
 *   containerRef,
 *   wrapperRef,
 *   tooltipRef,
 *   handleMouseMove,
 *   handleMouseEnter,
 *   handleContainerMouseLeave,
 * } = useHeatmapTooltip<MyHeatmapCell>();
 *
 * return (
 *   <div ref={containerRef} onMouseLeave={handleContainerMouseLeave}>
 *     <HeatmapChart
 *       data={data}
 *       CellComponent={({ data }) => (
 *         <div
 *           onMouseEnter={(e) => handleMouseEnter(e, data)}
 *           onMouseMove={handleMouseMove}
 *         >
 *           ...
 *         </div>
 *       )}
 *     />
 *     <div ref={tooltipRef}>
 *       <div ref={wrapperRef}>
 *         {hoveredData && <TooltipContent data={hoveredData} />}
 *       </div>
 *     </div>
 *   </div>
 * );
 * ```
 */
export function useHeatmapTooltip<T>(options: UseHeatmapTooltipOptions = {}) {
  const { verticalOffset = 10, delay = 100 } = options;

  const [hoveredData, setHoveredData] = useState<T | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const currentMousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const [isActive, setIsActive] = useState<boolean>(false);
  const isTooltipVisibleRef = useRef<boolean>(false);

  const updateTooltipPositionFromCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (containerRef.current && tooltipRef.current && wrapperRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const containerWidth = rect.width;
        const tooltipWidth = wrapperRef.current.offsetWidth;

        let tooltipLeft = clientX - rect.left - tooltipWidth / 2;

        tooltipLeft = Math.max(
          0,
          Math.min(tooltipLeft, containerWidth - tooltipWidth),
        );

        const tooltipTop =
          clientY - rect.top - wrapperRef.current.offsetHeight - verticalOffset;

        tooltipRef.current.style.transition = "none";
        tooltipRef.current.style.transitionProperty = "none";
        tooltipRef.current.style.transitionDuration = "0s";
        tooltipRef.current.style.transform = `translate(${tooltipLeft}px, ${tooltipTop}px)`;
      }
    },
    [verticalOffset],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      currentMousePositionRef.current = { x: e.clientX, y: e.clientY };

      if (containerRef.current && tooltipRef.current && wrapperRef.current) {
        updateTooltipPositionFromCoords(e.clientX, e.clientY);
      }
    },
    [updateTooltipPositionFromCoords],
  );

  useEffect(() => {
    if (currentMousePositionRef.current && hoveredData && isActive) {
      if (tooltipRef.current && containerRef.current && wrapperRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const containerWidth = rect.width;
        const tooltipWidth = wrapperRef.current.offsetWidth;

        let tooltipLeft =
          currentMousePositionRef.current.x - rect.left - tooltipWidth / 2;

        tooltipLeft = Math.max(
          0,
          Math.min(tooltipLeft, containerWidth - tooltipWidth),
        );

        const tooltipTop =
          currentMousePositionRef.current.y -
          rect.top -
          wrapperRef.current.offsetHeight -
          verticalOffset;

        tooltipRef.current.style.transition = "none";
        tooltipRef.current.style.transitionProperty = "none";
        tooltipRef.current.style.transitionDuration = "0s";
        tooltipRef.current.style.transform = `translate(${tooltipLeft}px, ${tooltipTop}px)`;

        if (!isTooltipVisibleRef.current) {
          wrapperRef.current.style.transition = "none";
          wrapperRef.current.style.opacity = "0";
          wrapperRef.current.style.transform = "scale(0.94)";

          requestAnimationFrame(() => {
            if (wrapperRef.current) {
              wrapperRef.current.style.transitionProperty =
                "opacity, transform";
              wrapperRef.current.style.transitionDuration = "0.15s";
              wrapperRef.current.style.transitionDelay = `${delay}ms`;
              wrapperRef.current.style.transitionTimingFunction =
                "var(--ease-out-quart)";
              wrapperRef.current.style.opacity = "1";
              wrapperRef.current.style.transform = "scale(1.0)";
            }
          });
          isTooltipVisibleRef.current = true;
        } else {
          wrapperRef.current.style.opacity = "1";
          wrapperRef.current.style.transform = "scale(1.0)";
        }
      }
    }
  }, [verticalOffset, hoveredData, isActive, delay]);

  const handleMouseEnter = useCallback((e: React.MouseEvent, data: T) => {
    currentMousePositionRef.current = { x: e.clientX, y: e.clientY };
    setHoveredData(data);
    setIsActive(true);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent, data: T) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      setHoveredData(data);
      currentMousePositionRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
      setIsActive(true);
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        updateTooltipPositionFromCoords(touch.clientX, touch.clientY);
      }
    },
    [updateTooltipPositionFromCoords],
  );

  const handleContainerMouseLeave = useCallback(() => {
    if (wrapperRef.current && tooltipRef.current) {
      wrapperRef.current.style.transitionProperty = "opacity, transform";
      wrapperRef.current.style.transitionDuration = "0.15s";
      wrapperRef.current.style.transitionDelay = "0s";
      wrapperRef.current.style.transitionTimingFunction =
        "var(--ease-out-quad)";
      wrapperRef.current.style.opacity = "0";
      wrapperRef.current.style.transform = "scale(0.6)";
      setIsActive(false);
      isTooltipVisibleRef.current = false;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (wrapperRef.current && tooltipRef.current) {
      wrapperRef.current.style.transitionProperty = "opacity, transform";
      wrapperRef.current.style.transitionDuration = "0.15s";
      wrapperRef.current.style.transitionDelay = "0s";
      wrapperRef.current.style.transitionTimingFunction =
        "var(--ease-out-quad)";
      wrapperRef.current.style.opacity = "0";
      wrapperRef.current.style.transform = "scale(0.6)";
      setIsActive(false);
      isTooltipVisibleRef.current = false;
    }
  }, []);

  return {
    hoveredData,
    containerRef,
    wrapperRef,
    tooltipRef,
    handleMouseMove,
    handleMouseEnter,
    handleContainerMouseLeave,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
