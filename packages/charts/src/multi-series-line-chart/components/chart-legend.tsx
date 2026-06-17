import React from "react";

import { cn } from "../../lib/utils";
import { hexToRgba, getHoverOpacity } from "../utils";
import type { LegendItem } from "../types";
import { CHART_BREAKPOINTS } from "../constants";

interface ChartLegendProps {
  legendItems: LegendItem[];
  containerWidth?: number;
  hoveredSeriesId: string | null;
  onSeriesHover: (seriesId: string | null) => void;
  onLabelClick?: (seriesId: string) => void;
  unitPrefix?: string | React.ReactNode;
  unitSuffix?: string | React.ReactNode;
  legendRef: React.RefObject<HTMLDivElement | null>;
}

const ChartLegendComponent: React.FC<ChartLegendProps> = ({
  legendItems,
  containerWidth,
  hoveredSeriesId,
  onSeriesHover,
  onLabelClick,
  unitPrefix,
  unitSuffix,
  legendRef,
}) => {
  const isLargeScreen = containerWidth && containerWidth > CHART_BREAKPOINTS.sm;

  if (isLargeScreen) {
    return (
      <div
        className={cn(
          "pointer-events-none absolute left-0 top-0 w-full flex-wrap items-center gap-2 max-sm:overflow-hidden",
        )}
      >
        {legendItems.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto absolute flex h-[22px] w-fit cursor-pointer items-center justify-center gap-1 rounded-[11px] px-[5px] py-1 transition-opacity duration-200 ease-out",
            )}
            style={{
              left: `${item.left}px`,
              top: `${item.top}px`,
              backgroundColor: hexToRgba(item.color, 0.3),
              opacity: getHoverOpacity(item.id, hoveredSeriesId),
            }}
            onClick={() => onLabelClick?.(item.id)}
            onPointerEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();

              onSeriesHover(item.id);
            }}
            onPointerLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();

              onSeriesHover(null);
            }}
          >
            <div className="relative flex select-none items-center justify-center gap-1">
              {item.seriesData.iconImageUrl && (
                <div className="size-4 rounded-full">
                  <img
                    src={item.seriesData.iconImageUrl}
                    width={16}
                    height={16}
                    alt={item.seriesData.name}
                    className="size-4 rounded-full"
                    draggable={false}
                  />
                </div>
              )}
              <div className="text-normal relative flex items-center justify-center whitespace-nowrap text-[11px] font-semibold leading-4">
                <span
                  className={cn(
                    "mr-1 max-w-12 truncate",
                    item.seriesData.iconImageUrl ? "max-w-10" : "max-w-12",
                  )}
                >
                  {item.displayText}
                </span>
                {unitPrefix && (
                  <span className="mr-0.5 [&_svg]:!text-white/70">
                    {unitPrefix}
                  </span>
                )}
                <span>{item.value}</span>
                {unitSuffix && <span>{unitSuffix}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-none left-0 top-0 flex w-full flex-wrap items-center gap-1 max-sm:overflow-hidden",
      )}
      ref={legendRef}
    >
      {legendItems.map((item) => (
        <div
          key={item.id}
          className={cn(
            "pointer-events-auto flex h-[22px] w-fit min-w-[112px] cursor-pointer items-center gap-1 rounded-[11px] px-[5px] py-1 transition-opacity  duration-200 ease-out",
          )}
          style={{
            backgroundColor: hexToRgba(item.color, 0.3),
            opacity: getHoverOpacity(item.id, hoveredSeriesId),
          }}
          onClick={() => onLabelClick?.(item.id)}
          onPointerEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();

            onSeriesHover(item.id);
          }}
          onPointerLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();

            onSeriesHover(null);
          }}
        >
          <div className="relative flex select-none items-center gap-1">
            {item.seriesData.iconImageUrl && (
              <div className="size-4 rounded-full">
                <img
                  src={item.seriesData.iconImageUrl}
                  width={16}
                  height={16}
                  alt={item.seriesData.name}
                  className="size-4 rounded-full"
                  draggable={false}
                />
              </div>
            )}
            <div className="text-normal relative flex items-center whitespace-nowrap text-[11px] font-semibold leading-none">
              <span
                className={cn(
                  "mr-1 max-w-12 truncate",
                  item.seriesData.iconImageUrl ? "max-w-10" : "max-w-12",
                )}
              >
                {item.displayText}
              </span>

              <span data-legend-value={item.id}>{item.value}</span>
              {unitSuffix && <span>{unitSuffix}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const ChartLegend = ChartLegendComponent;
