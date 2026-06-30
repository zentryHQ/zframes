import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useFxRates } from "@zframes/core";
import type { z } from "zod";
import { changeColor, formatChangePct, formatRate } from "./format";
import { fxBoardMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = fxBoardMeta.schema;

function FxBoard({ config }: { config: z.output<typeof schema> }) {
  const { rates, isLoading } = useFxRates(config.base, config.symbols);

  if (isLoading) return <FrameStatus loading>loading FX rates…</FrameStatus>;
  if (!rates.length) return <FrameStatus>no FX data yet</FrameStatus>;

  const asOf = rates[0]?.history.at(-1)?.time;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">FX rates</div>
          <div className="body-sm text-normal">
            1 {config.base.toUpperCase()} buys
          </div>
        </div>
        <div className="caption text-soft text-right">
          {asOf
            ? new Date(asOf).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : "ECB daily"}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {rates.map((fx) => {
          const color = changeColor(fx.changePct);
          const spark = fx.history.map((point) => ({
            date: new Date(point.time).toISOString(),
            value: point.value,
          }));
          return (
            <div
              key={fx.symbol}
              className="flex items-center gap-3 border-b border-white/[0.06] py-1.5 last:border-b-0"
            >
              <span className="body-sm w-9 font-bold text-strong">
                {fx.symbol}
              </span>
              <div className="flex-1" />
              {config.showSparkline && spark.length > 1 && (
                <MiniLineChart data={spark} width={72} height={20} color={color} />
              )}
              <span className="whitespace-nowrap text-right tabular-nums">
                <span className="body-sm text-strong">
                  {formatRate(fx.rate)}
                </span>
                <span
                  className="caption ml-2 font-bold"
                  style={{ color }}
                >
                  {formatChangePct(fx.changePct)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const fxBoardFrame = defineFrame({
  ...fxBoardMeta,
  component: FxBoard,
});
