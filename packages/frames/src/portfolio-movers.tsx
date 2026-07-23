import { BarChart } from "@zframes/charts";
import { defineFrame, type Portfolio } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { DOWN_COLOR, UP_COLOR, formatChangePct } from "./format";
import { PortfolioGate, PortfolioLabel } from "./portfolio-common";
import { portfolioMoversMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = portfolioMoversMeta.schema;

function MoversChart({
  portfolio,
  config,
}: {
  portfolio: Portfolio;
  config: z.output<typeof schema>;
}) {
  const data = useMemo(
    () =>
      [...portfolio.holdings]
        .filter((h) => Number.isFinite(h.changePct24h))
        .sort((a, b) => Math.abs(b.changePct24h!) - Math.abs(a.changePct24h!))
        .slice(0, config.limit)
        .sort((a, b) => b.changePct24h! - a.changePct24h!)
        .map((h) => ({ label: tickerOf(h.symbol), value: h.changePct24h! })),
    [portfolio.holdings, config.limit],
  );

  if (data.length === 0)
    return <FrameStatus>no 24h change reported for these holdings</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <PortfolioLabel
        portfolio={portfolio}
        config={config}
        className="caption text-soft"
      />
      <BarChart
        data={data}
        orientation="horizontal"
        color={UP_COLOR}
        negativeColor={DOWN_COLOR}
        height={Math.max(data.length * 22, 96)}
        formatValue={formatChangePct}
      />
    </div>
  );
}

function PortfolioMovers({ config }: { config: z.output<typeof schema> }) {
  return (
    <PortfolioGate config={config} loadingLabel="loading holdings…">
      {(portfolio) => <MoversChart portfolio={portfolio} config={config} />}
    </PortfolioGate>
  );
}

export const portfolioMoversFrame = defineFrame({
  ...portfolioMoversMeta,
  component: PortfolioMovers,
});
