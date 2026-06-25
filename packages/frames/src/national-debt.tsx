import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useNationalDebt } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { nationalDebtMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = nationalDebtMeta.schema;

function NationalDebt({ config }: { config: z.output<typeof schema> }) {
  const { debt, isLoading } = useNationalDebt(config.trendDays);

  const sparkline = useMemo(
    () =>
      (debt?.trend ?? []).map((point) => ({
        date: new Date(point.time).toISOString(),
        value: point.total,
      })),
    [debt?.trend],
  );

  if (isLoading)
    return <FrameStatus loading>loading national debt…</FrameStatus>;
  if (!debt) return <FrameStatus>no debt data yet</FrameStatus>;

  const first = debt.trend[0];
  const change = first ? debt.total - first.total : null;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">total public debt</div>
          <div className="body-sm text-normal">as of {debt.date}</div>
        </div>
        <div className="caption text-soft text-right">daily</div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="metric-xl text-strong leading-none">
          {formatCompactUsd(debt.total)}
        </div>
        {change !== null && first && (
          <div className="text-right">
            <div className="body-md text-normal font-bold tabular-nums">
              {change >= 0 ? "+" : ""}
              {formatCompactUsd(change)}
            </div>
            <div className="caption text-soft">since {first.date}</div>
          </div>
        )}
      </div>

      <MiniLineChart
        data={sparkline}
        width={210}
        height={42}
        color="hsl(var(--zf-accent-hue, 242) 85% 72%)"
      />

      {config.showSplit && (
        <div className="grid grid-cols-2 gap-1.5 border-t border-white/[0.08] pt-2">
          <div className="rounded bg-white/[0.04] px-2 py-1.5">
            <div className="caption text-soft truncate">Held by public</div>
            <div className="body-sm text-strong font-bold tabular-nums">
              {formatCompactUsd(debt.heldByPublic)}
            </div>
          </div>
          <div className="rounded bg-white/[0.04] px-2 py-1.5">
            <div className="caption text-soft truncate">Intragovernmental</div>
            <div className="body-sm text-strong font-bold tabular-nums">
              {formatCompactUsd(debt.intragovernmental)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const nationalDebtFrame = defineFrame({
  ...nationalDebtMeta,
  component: NationalDebt,
});
