import { HeatmapChart, type HeatmapCell } from "@zframes/charts";
import { defineFrame, useFxRates } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct, formatRate } from "./format";
import { fxCrossHeatmapMeta } from "./schemas";
import { FrameStatus, heatmapCellLabel } from "./ui";

const schema = fxCrossHeatmapMeta.schema;

interface FxCrossCell extends HeatmapCell {
  /** 1 unit of the row currency, in units of the column currency. */
  rate: number;
}

const Cell = heatmapCellLabel<FxCrossCell>((d) => formatChangePct(d.value), 40);

function FxCrossHeatmap({ config }: { config: z.output<typeof schema> }) {
  // Every cross is derived from each currency's own rate vs a common pivot
  // (USD); the pivot never needs to appear in the matrix itself, so it's
  // fetched separately from the axis list and re-injected as an identity.
  const pivotSymbols = useMemo(
    () => config.symbols.filter((s) => s !== "USD"),
    [config.symbols],
  );
  const { rates, isLoading } = useFxRates("USD", pivotSymbols);

  const cells: FxCrossCell[] = useMemo(() => {
    const lookup = new Map<string, { rate: number; changePct: number }>([
      ["USD", { rate: 1, changePct: 0 }],
    ]);
    for (const fx of rates) lookup.set(fx.symbol, fx);

    const out: FxCrossCell[] = [];
    for (const rowCcy of config.symbols) {
      const row = lookup.get(rowCcy);
      if (!row) continue;
      for (const colCcy of config.symbols) {
        if (rowCcy === colCcy) continue;
        const col = lookup.get(colCcy);
        if (!col) continue;
        // Cross rate i→j = rate_j / rate_i (both vs the same pivot); the
        // day change compounds the same way from each leg's own changePct.
        const changePct =
          ((1 + col.changePct / 100) / (1 + row.changePct / 100) - 1) * 100;
        out.push({
          id: `${rowCcy}-${colCcy}`,
          row: rowCcy,
          column: colCcy,
          value: changePct,
          rate: col.rate / row.rate,
        });
      }
    }
    return out;
  }, [rates, config.symbols]);

  if (isLoading) return <FrameStatus loading>loading FX crosses…</FrameStatus>;
  if (cells.length === 0) return <FrameStatus>no FX data yet</FrameStatus>;

  return (
    <HeatmapChart<FxCrossCell>
      data={cells}
      CellComponent={Cell}
      gap={3}
      showLabels
      rowLabelWidth={40}
      columnLabelHeight={20}
      formatTooltip={(cell) => ({
        title: `${cell.row} → ${cell.column}`,
        rows: [
          { label: "rate", value: formatRate(cell.rate) },
          {
            label: "24h",
            value: formatChangePct(cell.value),
            color: changeColor(cell.value),
          },
        ],
        // The cross is quoted row-in-column units; the reciprocal is the same
        // pair as the mirrored cell across the diagonal, so naming it keeps the
        // matrix readable in one hover instead of two.
        footer: `1 ${cell.column} = ${formatRate(1 / cell.rate)} ${cell.row}`,
      })}
    />
  );
}

export const fxCrossHeatmapFrame = defineFrame({
  ...fxCrossHeatmapMeta,
  component: FxCrossHeatmap,
});
