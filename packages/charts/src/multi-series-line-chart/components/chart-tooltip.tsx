import React from "react";

import type { MultiSeriesData } from "../types";
import { CHART_BREAKPOINTS } from "../constants";

interface ChartTooltipProps {
  containerWidth: number | null;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  series: MultiSeriesData[];
  seriesColors: { [seriesId: string]: string };
  unitPrefix?: string | React.ReactNode;
  unitSuffix?: string | React.ReactNode;
}

const ChartTooltipComponent: React.FC<ChartTooltipProps> = ({
  containerWidth,
  tooltipRef,
  series,
  seriesColors,
  unitPrefix,
  unitSuffix,
}) => {
  const isLargeScreen = containerWidth && containerWidth > CHART_BREAKPOINTS.sm;

  if (isLargeScreen) {
    return (
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute left-0 top-0 z-50 rounded-md bg-slate-700 px-6 py-3 text-xs text-white opacity-0 transition-opacity duration-300"
      >
        <div className="flex flex-col gap-3">
          <div
            className="body-md font-semibold text-white/50"
            data-tooltip-date
          ></div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            {series.map((seriesData) => (
              <React.Fragment key={seriesData.id}>
                <span className="text-soft flex max-w-[126px] items-center gap-1">
                  <div
                    className="h-full w-0.5 rounded-full"
                    style={{
                      backgroundColor: seriesColors[seriesData.id],
                    }}
                  />
                  {seriesData.iconImageUrl && (
                    <img
                      src={seriesData.iconImageUrl}
                      width={20}
                      height={20}
                      alt={seriesData.name}
                      className="rounded-full"
                    />
                  )}
                  <span className="text-normal body-sm font-bold capitalize">
                    {seriesData.name}
                  </span>
                </span>

                <div className="font-dmsans text-normal flex flex-row items-center font-bold">
                  <div className="mr-1">{unitPrefix}</div>
                  <span
                    className="text-normal text-right text-xs font-bold"
                    data-tooltip-value={seriesData.id}
                  ></span>
                  {unitSuffix}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      ref={tooltipRef}
      className="pointer-events-none absolute left-0 top-0 z-50 min-w-[130px] rounded-md bg-slate-700 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-300 ease-out"
    >
      <div className="flex flex-col items-center justify-center gap-3">
        <div
          className="caption font-semibold text-white/50"
          data-tooltip-date
        ></div>
      </div>
    </div>
  );
};

export const ChartTooltip = ChartTooltipComponent;
