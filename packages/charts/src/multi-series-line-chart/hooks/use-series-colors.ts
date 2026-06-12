import { useMemo } from "react";
import type { MultiSeriesData } from "../types";

/**
 * zTerminal extracts series colors from token logos via node-vibrant; here
 * series declare their color explicitly, keeping the package dependency-light.
 * Return shape is kept identical so ported call sites don't change.
 */
export const useSeriesColors = (series: MultiSeriesData[]) => {
  const seriesColors = useMemo(() => {
    return series.reduce(
      (acc, seriesData) => {
        acc[seriesData.id] = seriesData.color;
        return acc;
      },
      {} as { [seriesId: string]: string },
    );
  }, [series]);

  return {
    seriesColors,
    isColorLoading: false,
  };
};
