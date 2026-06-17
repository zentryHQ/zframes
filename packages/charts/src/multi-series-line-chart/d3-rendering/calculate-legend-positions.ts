import { parseMarketData } from "../../lib/format";
import { LEGEND } from "../constants";
import type { MultiSeriesData, LegendItem, ChartScales } from "../types";

interface PositionItem {
  id: string;
  top: number;
  bottom: number;
  left: number;
}

export const calculateLegendPositions = (
  filteredSeries: MultiSeriesData[],
  seriesColors: { [seriesId: string]: string },
  { xScale, yScale }: ChartScales,
  dynamicLeftMargin: number,
  marginTop: number,
  formatValue?: (value: number) => string,
): LegendItem[] => {
  const rectHeight = LEGEND.rectHeight;
  const paddingX = LEGEND.paddingX;

  const usedPositions: PositionItem[] = [];

  filteredSeries.forEach((seriesData) => {
    const processedData = seriesData.data.map((d) => ({
      date: new Date(d.date),
      value: d.value,
    }));

    if (processedData.length > 0) {
      const lastPoint = processedData[processedData.length - 1];
      const legendX = xScale(lastPoint.date) + 8;
      const legendY = yScale(lastPoint.value);

      const rectX = legendX - paddingX;
      let rectY = legendY - rectHeight / 2;

      const collisionWithOtherSeries = usedPositions.findLast(
        (position) =>
          rectY + rectHeight >= position.top && rectY <= position.bottom,
      );

      if (collisionWithOtherSeries) {
        rectY = collisionWithOtherSeries.top + rectHeight;
      }

      usedPositions.push({
        top: rectY,
        bottom: rectY + rectHeight,
        id: seriesData.id,
        left: rectX,
      });
    }
  });

  usedPositions
    .reverse()
    .reduce((tempUsedPosition: PositionItem[], usedPosition) => {
      const collisionWithOtherSeries = tempUsedPosition.find(
        (position) =>
          usedPosition.top + rectHeight >= position.top &&
          usedPosition.top <= position.bottom &&
          position.id !== usedPosition.id,
      );

      if (collisionWithOtherSeries) {
        usedPosition.top = collisionWithOtherSeries.top - rectHeight;
      }

      return [usedPosition, ...tempUsedPosition];
    }, []);

  const legendItems: LegendItem[] = usedPositions
    .map((position) => {
      const seriesData = filteredSeries.find((s) => s.id === position.id);
      if (!seriesData) return null;

      const seriesColor = seriesColors[position.id];

      const value = formatValue
        ? formatValue(seriesData.data.at(-1)?.value ?? 0)
        : parseMarketData(seriesData.data.at(-1)?.value ?? 0);

      return {
        id: position.id,
        left: position.left + dynamicLeftMargin,
        top: position.top + marginTop,
        seriesData,
        color: seriesColor,
        value,
        displayText: seriesData.name,
      };
    })
    .filter(Boolean) as LegendItem[];

  return legendItems;
};
