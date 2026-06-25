import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useFinancialStress } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { financialStressMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = financialStressMeta.schema;

/** Higher index = more stress, so positive reads "bad" (down/red), negative
 *  "calm" (up/green) — note the inversion vs a price delta. */
function stressColor(value: number): string {
  return value > 0 ? DOWN_COLOR : UP_COLOR;
}

function classifyStress(value: number): string {
  if (value >= 2.5) return "high stress";
  if (value >= 1) return "elevated";
  if (value > -1) return "near average";
  return "below average";
}

function FinancialStress({ config }: { config: z.output<typeof schema> }) {
  const { stress, isLoading } = useFinancialStress();

  const sparkline = useMemo(
    () =>
      (stress?.trend ?? []).slice(-config.trendDays).map((point) => ({
        date: new Date(point.time).toISOString(),
        value: point.value,
      })),
    [config.trendDays, stress?.trend],
  );

  if (isLoading)
    return <FrameStatus loading>loading stress index…</FrameStatus>;
  if (!stress) return <FrameStatus>no stress-index data yet</FrameStatus>;

  const color = stressColor(stress.value);

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">OFR FSI</div>
          <div className="body-sm text-normal">{stress.date}</div>
        </div>
        <div className="caption text-soft text-right">daily</div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div
            className="metric-xl leading-none"
            style={{ color, textShadow: `0 0 24px ${color}44` }}
          >
            {stress.value > 0 ? "+" : ""}
            {stress.value.toFixed(2)}
          </div>
          <div className="caption text-soft mt-1">
            {classifyStress(stress.value)}
          </div>
        </div>
        <div className="caption text-soft max-w-[46%] text-right leading-snug">
          0 = long-run average
          <br />
          higher = more stress
        </div>
      </div>

      <MiniLineChart data={sparkline} width={210} height={42} color={color} />

      {config.showCategories && stress.categories.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 border-t border-white/[0.08] pt-2">
          {stress.categories.map((category) => (
            <div
              key={category.label}
              className="flex items-center justify-between gap-2"
            >
              <span className="caption text-soft truncate">
                {category.label}
              </span>
              <span
                className="body-sm font-bold tabular-nums"
                style={{ color: stressColor(category.value) }}
              >
                {category.value > 0 ? "+" : ""}
                {category.value.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const financialStressFrame = defineFrame({
  ...financialStressMeta,
  component: FinancialStress,
});
