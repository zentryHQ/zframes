import React, { useEffect } from "react";

import type { MultiSeriesData } from "../types";
import { CHART_BREAKPOINTS } from "../constants";
import { ensureChartTooltipStyle } from "../../lib/chart-tooltip";

interface ChartTooltipProps {
  containerWidth: number | null;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  series: MultiSeriesData[];
  seriesColors: { [seriesId: string]: string };
  unitPrefix?: string | React.ReactNode;
  unitSuffix?: string | React.ReactNode;
}

/**
 * The multi-series crosshair tooltip.
 *
 * Unlike every other chart in this package, this one is NOT driven by the shared
 * `attachChartTooltip` helper: it is a crosshair readout for N series at one
 * shared x, wired to a hover line and per-series knobs, and its cells are
 * written by `createInteractions` straight into the `data-tooltip-*` slots below
 * (no React render per pointer move — already the fast path).
 *
 * What it DOES share is the surface: the same `.zfc-tt*` classes the shared
 * tooltip injects, so a board that shows a line chart next to a bar chart gets
 * one tooltip design rather than two. Only the layout is local — the shared
 * primitive builds its rows imperatively, this one declares them in JSX because
 * the series set is known at render time.
 *
 * Positioning stays local too (`createInteractions` writes a transform relative
 * to the chart container), because this tooltip is anchored to the crosshair's
 * data point rather than to the cursor.
 */
const ChartTooltipComponent: React.FC<ChartTooltipProps> = ({
  containerWidth,
  tooltipRef,
  series,
  seriesColors,
  unitPrefix,
  unitSuffix,
}) => {
  // The stylesheet normally lands when the shared tooltip first shows; this
  // tooltip never calls into it, so it has to ask for the styles itself or it
  // renders unstyled until some other chart on the board is hovered. In an
  // effect, not in the render body: this component also renders on the server.
  useEffect(() => {
    ensureChartTooltipStyle();
  }, []);

  const isLargeScreen = containerWidth && containerWidth > CHART_BREAKPOINTS.sm;

  if (isLargeScreen) {
    return (
      <div
        ref={tooltipRef}
        // `absolute` + `opacity-0`, not the shared node's `fixed`: this one is
        // positioned inside the chart container, against the crosshair.
        className="zfc-tt zfc-tt--inline pointer-events-none absolute left-0 top-0 z-50 opacity-0"
      >
        <div className="zfc-tt-title" data-tooltip-date></div>
        <div className="zfc-tt-rows" data-bare="0">
          {series.map((seriesData) => (
            <React.Fragment key={seriesData.id}>
              <span className="zfc-tt-label">
                <span
                  className="zfc-tt-sw"
                  style={{ background: seriesColors[seriesData.id] }}
                />
                {seriesData.iconImageUrl && (
                  <img
                    src={seriesData.iconImageUrl}
                    width={14}
                    height={14}
                    alt=""
                    className="shrink-0 rounded-full"
                  />
                )}
                <span className="capitalize">{seriesData.name}</span>
              </span>

              <div className="zfc-tt-val">
                {unitPrefix}
                <span data-tooltip-value={seriesData.id}></span>
                {unitSuffix}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }
  // Narrow cards have no room for the series column — the date rides the
  // crosshair and the values are written into the legend instead (see
  // `updateMobileLegendContent`).
  return (
    <div
      ref={tooltipRef}
      className="zfc-tt zfc-tt--inline pointer-events-none absolute left-0 top-0 z-50 min-w-[130px] text-center opacity-0"
    >
      <div className="zfc-tt-title" data-tooltip-date></div>
    </div>
  );
};

export const ChartTooltip = ChartTooltipComponent;
