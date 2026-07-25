import { defineFrame, useEtfFlows, useMoney, type Money } from "@zframes/core";
import type { z } from "zod";
import { changeColor } from "./format";
import { MetricRow } from "./metric-row";
import { etfFlowsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = etfFlowsMeta.schema;

/** Signed compact money in the card's display currency: "+$120.0M", "-฿84.9M". */
const signedMoney = (v: number, money: Money) =>
  v >= 0 ? `+${money.compact(v)}` : money.compact(v);

function EtfFlows({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const { flows, isLoading } = useEtfFlows(config.asset);

  if (isLoading) return <FrameStatus loading>loading ETF flows…</FrameStatus>;
  if (!flows) return <FrameStatus>ETF flows unavailable</FrameStatus>;

  const issuers = flows.issuers.slice(0, config.limit);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div>
        <div className="caption text-soft">
          {config.asset.toUpperCase()} spot ETF · net flow
          {flows.date ? ` · ${flows.date}` : ""}
        </div>
        <div
          className="metric-lg leading-none"
          style={{ color: changeColor(flows.dailyTotalNetInflow) }}
        >
          {signedMoney(flows.dailyTotalNetInflow, money)}
        </div>
      </div>
      <div className={`${scrollAreaClass} flex flex-col`}>
        {issuers.map((is) => (
          <MetricRow
            key={is.ticker}
            label={is.ticker}
            meta={is.institute}
            value={
              <span style={{ color: changeColor(is.dailyNetInflow) }}>
                {signedMoney(is.dailyNetInflow, money)}
              </span>
            }
          />
        ))}
      </div>
    </div>
  );
}

export const etfFlowsFrame = defineFrame({
  ...etfFlowsMeta,
  component: EtfFlows,
});
