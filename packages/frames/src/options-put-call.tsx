import { defineFrame, useOptionsSummary } from "@zframes/core";
import type { z } from "zod";
import { optionsPutCallMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = optionsPutCallMeta.schema;

const CALL = "#3fd08f";
const PUT = "#ff6b81";

// PCR > 1 = puts outweigh calls (defensive) → reddish; < 1 = call-heavy → green.
function ratioColor(r: number): string {
  return r > 1 ? PUT : CALL;
}

function OptionsPutCall({ config }: { config: z.output<typeof schema> }) {
  const { summary, isLoading } = useOptionsSummary(config.currency);

  if (isLoading) return <FrameStatus loading>loading options…</FrameStatus>;
  if (!summary) return <FrameStatus>no options data</FrameStatus>;

  const primary =
    config.basis === "oi"
      ? summary.putCallRatioOi
      : summary.putCallRatioVolume;
  const secondary =
    config.basis === "oi"
      ? summary.putCallRatioVolume
      : summary.putCallRatioOi;
  const totalOi = summary.callOi + summary.putOi;
  const callPct = totalOi > 0 ? (summary.callOi / totalOi) * 100 : 50;
  const putPct = 100 - callPct;
  const color = ratioColor(primary);

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">
            {config.currency} put/call · {config.basis === "oi" ? "OI" : "vol"}
          </div>
          <div
            className="font-dmsans text-5xl font-bold leading-none tabular-nums"
            style={{ color }}
          >
            {primary.toFixed(2)}
          </div>
        </div>
        <div className="text-right">
          <div className="body-md text-normal font-bold tabular-nums">
            {secondary.toFixed(2)}
          </div>
          <div className="caption text-soft">
            by {config.basis === "oi" ? "volume" : "OI"}
          </div>
        </div>
      </div>

      <div>
        <div className="flex h-3 w-full gap-1 overflow-hidden rounded-full">
          <div
            className="h-full rounded-l-full"
            style={{ width: `${callPct}%`, background: CALL }}
          />
          <div
            className="h-full rounded-r-full"
            style={{ width: `${putPct}%`, background: PUT }}
          />
        </div>
        <div className="caption text-soft mt-1 flex justify-between tabular-nums">
          <span>
            <span style={{ color: CALL }}>calls</span> {callPct.toFixed(0)}%
          </span>
          <span>
            {putPct.toFixed(0)}% <span style={{ color: PUT }}>puts</span>
          </span>
        </div>
      </div>

      <div className="caption text-soft">
        avg implied vol {summary.avgIv.toFixed(1)}%
      </div>
    </div>
  );
}

export const optionsPutCallFrame = defineFrame({
  ...optionsPutCallMeta,
  component: OptionsPutCall,
});
