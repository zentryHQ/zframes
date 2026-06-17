import { useMemo } from "react";
import type { MultiSeriesData } from "../types";

/**
 * Series declare their color explicitly (rather than deriving it from logos),
 * which keeps the package dependency-light. The hook's return shape is stable
 * so call sites don't need to change.
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
