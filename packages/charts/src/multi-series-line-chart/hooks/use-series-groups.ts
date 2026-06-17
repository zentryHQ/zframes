import { useState, useEffect, useMemo } from "react";
import type { MultiSeriesData } from "../types";

export const useSeriesGroups = (series: MultiSeriesData[]) => {
  const seriesGroups = useMemo(() => {
    const groups = new Set<string>();
    series.forEach((s) => {
      if (s.seriesGroup) {
        groups.add(s.seriesGroup);
      }
    });
    return Array.from(groups);
  }, [series]);

  const [visibleGroups, setVisibleGroups] = useState<Set<string>>(() => {
    return new Set(seriesGroups);
  });

  useEffect(() => {
    setVisibleGroups((prev) => {
      const newGroups = new Set(prev);
      seriesGroups.forEach((group) => {
        if (!newGroups.has(group)) {
          newGroups.add(group);
        }
      });
      return newGroups;
    });
  }, [seriesGroups]);

  const filteredSeries = useMemo(() => {
    return series.filter((s) => {
      if (!s.seriesGroup) return true;
      return visibleGroups.has(s.seriesGroup);
    });
  }, [series, visibleGroups]);

  const toggleGroup = (group: string) => {
    setVisibleGroups((prev) => {
      const newGroups = new Set(prev);
      if (newGroups.has(group)) {
        newGroups.delete(group);
      } else {
        newGroups.add(group);
      }
      return newGroups;
    });
  };

  return {
    seriesGroups,
    visibleGroups,
    filteredSeries,
    toggleGroup,
  };
};
