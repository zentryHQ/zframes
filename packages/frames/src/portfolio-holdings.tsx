import { defineFrame, useMoney, type Portfolio } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { AssetLogo, tickerOf } from "./asset-logo";
import { changeColor, formatChangePct, formatPct } from "./format";
import {
  PortfolioGate,
  PortfolioLabel,
  usePricedHoldings,
} from "./portfolio-common";
import { portfolioHoldingsMeta } from "./schemas";
import { scrollAreaClass } from "./ui";

const schema = portfolioHoldingsMeta.schema;

function formatAmount(amount: number): string {
  if (amount >= 1000)
    return amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (amount >= 1) return amount.toFixed(4).replace(/\.?0+$/, "");
  return amount.toPrecision(4);
}

function HoldingsTable({
  portfolio,
  config,
}: {
  portfolio: Portfolio;
  config: z.output<typeof schema>;
}) {
  const money = useMoney();
  const { priced, total } = usePricedHoldings(portfolio.holdings);
  const rows = useMemo(
    () => [...priced].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    [priced],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between border-b border-white/[0.06] pb-1.5">
        <PortfolioLabel
          portfolio={portfolio}
          config={config}
          className="caption text-soft"
        />
        <span className="metric-sm text-strong">{money.compact(total)}</span>
      </div>
      <div className={scrollAreaClass}>
        {/* A real table with NO header row: the five columns were unlabelled,
            so a screen reader announced five numbers per holding with nothing
            saying which was the value and which the weight. The head is
            visually hidden (the card's columns are legible by position) and
            each row names its asset with a `scope="row"` header, so every cell
            is announced with both of its labels. */}
        <table className="w-full text-xs">
          <thead className="sr-only">
            <tr>
              <th scope="col">Asset</th>
              <th scope="col">Amount held</th>
              <th scope="col">Value</th>
              <th scope="col">Weight</th>
              <th scope="col">24h change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const pct = total > 0 ? ((h.value ?? 0) / total) * 100 : 0;
              return (
                <tr key={h.symbol} className="border-b border-white/[0.04]">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    <div className="flex items-center gap-1.5">
                      <AssetLogo symbol={h.symbol} size={16} />
                      <span className="text-normal font-semibold">
                        {tickerOf(h.symbol)}
                      </span>
                    </div>
                  </th>
                  <td className="text-soft py-1.5 text-right tabular-nums">
                    {formatAmount(h.amount)}
                  </td>
                  <td
                    className={`py-1.5 text-right font-semibold tabular-nums ${
                      h.value !== undefined ? "text-normal" : "text-disabled"
                    }`}
                  >
                    {h.value !== undefined ? money.compact(h.value) : "—"}
                  </td>
                  <td className="text-soft py-1.5 text-right tabular-nums">
                    {formatPct(pct, 1)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {h.changePct24h !== undefined ? (
                      <span style={{ color: changeColor(h.changePct24h) }}>
                        {formatChangePct(h.changePct24h)}
                      </span>
                    ) : (
                      <span className="text-soft">·</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PortfolioHoldings({ config }: { config: z.output<typeof schema> }) {
  return (
    <PortfolioGate config={config} loadingLabel="loading holdings…">
      {(portfolio) => <HoldingsTable portfolio={portfolio} config={config} />}
    </PortfolioGate>
  );
}

export const portfolioHoldingsFrame = defineFrame({
  ...portfolioHoldingsMeta,
  component: PortfolioHoldings,
});
