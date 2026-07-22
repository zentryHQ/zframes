import { BarChart } from "@zframes/charts";
import { defineFrame, useMempoolState } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { feeRateColor } from "./btc-shared";
import { mempoolFeeCurveMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = mempoolFeeCurveMeta.schema;

function MempoolFeeCurve({ config }: { config: z.output<typeof schema> }) {
  const { state, isLoading } = useMempoolState();

  const data = useMemo(
    () =>
      (state?.projected ?? []).slice(0, config.projectedBlocks).map((b, i) => ({
        label: i === 0 ? "next" : `+${i}`,
        value: Math.round(b.medianFee),
        color: feeRateColor(b.medianFee),
      })),
    [state, config.projectedBlocks],
  );

  if (isLoading) return <FrameStatus loading>loading fee curve…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no mempool data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart data={data} height={180} />
      <div className="caption text-soft text-center">
        median fee (sat/vB) · next {data.length} projected blocks
      </div>
    </div>
  );
}

export const mempoolFeeCurveFrame = defineFrame({
  ...mempoolFeeCurveMeta,
  component: MempoolFeeCurve,
});
