import { defineFrame, useEquityProfile, useMoney } from "@zframes/core";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { CardHeader } from "./card-header";
import {
  changeColor,
  formatChangePct,
  formatCompact,
  formatPct,
} from "./format";
import { companyProfileMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = companyProfileMeta.schema;

/**
 * Where `price` sits inside the published 52-week band — 0 at the low, 1 at the
 * high. `null` when an endpoint is missing or the band has no width (a fresh
 * listing whose high still equals its low), which would divide by zero.
 *
 * Clamped on purpose: the published band lags the tape, so a stock making a new
 * high sits *outside* its own 52-week range for a session. A marker hanging off
 * the end of its track reads as a broken widget rather than as news.
 */
function rangePosition(
  price: number | undefined,
  low: number | undefined,
  high: number | undefined,
): number | null {
  if (price === undefined || low === undefined || high === undefined)
    return null;
  const span = high - low;
  if (span <= 0) return null;
  return Math.min(1, Math.max(0, (price - low) / span));
}

function CompanyProfile({ config }: { config: z.output<typeof schema> }) {
  // A HIP-3 market name ("xyz:NVDA") never reaches the exchange — it only knows
  // the listed ticker. Stripping is idempotent, so a provider that also strips
  // is unaffected.
  const ticker = tickerOf(config.symbol);
  const { data, isLoading } = useEquityProfile(ticker);
  const money = useMoney();

  if (isLoading)
    return <FrameStatus loading>loading company profile…</FrameStatus>;
  if (!data)
    return <FrameStatus>no company profile for “{ticker}”</FrameStatus>;

  const listing = [data.exchange, data.sector, data.industry]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  // Both legs or neither: a delta measured against a missing previous close is
  // just the price again, wearing a plus sign.
  const { price, previousClose } = data;
  const change =
    price !== undefined && previousClose !== undefined && previousClose > 0
      ? {
          delta: price - previousClose,
          pct: ((price - previousClose) / previousClose) * 100,
        }
      : null;

  const position = rangePosition(
    price,
    data.fiftyTwoWeekLow,
    data.fiftyTwoWeekHigh,
  );

  // Most listed companies pay nothing, and an empty dividend row is noise on
  // every one of them — drop the block rather than print a dash.
  const dividendParts = [
    data.annualisedDividend !== undefined && data.annualisedDividend > 0
      ? `${money.price(data.annualisedDividend)}/share`
      : null,
    data.dividendYield !== undefined && data.dividendYield > 0
      ? `${formatPct(data.dividendYield)} yield`
      : null,
  ].filter((part): part is string => part !== null);

  return (
    <div className={`flex h-full flex-col gap-3 ${scrollAreaClass}`}>
      <CardHeader align="start">
        <CardHeader.Main>
          {/* An identity block, not a figure: the two lines name the filer
              rather than reading out a number, so they keep their own type
              (`body-sm` semibold over a `caption`) instead of
              `CardHeader.Eyebrow`/`Value`. */}
          <div className="body-sm text-strong truncate font-semibold">
            {data.companyName || ticker}
          </div>
          {listing && (
            <div className="caption text-soft truncate">{listing}</div>
          )}
        </CardHeader.Main>
        <CardHeader.Aside>
          <CardHeader.Sub>{ticker}</CardHeader.Sub>
        </CardHeader.Aside>
      </CardHeader>

      {price !== undefined && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="metric-md text-strong tabular-nums">
            {money.price(price)}
          </span>
          {change !== null && (
            <span
              className="body-sm font-semibold tabular-nums"
              style={{ color: changeColor(change.pct) }}
            >
              {change.delta >= 0 ? "+" : "-"}
              {money.price(Math.abs(change.delta))} (
              {formatChangePct(change.pct)})
            </span>
          )}
          <span className="caption text-soft">last sale</span>
        </div>
      )}

      {data.fiftyTwoWeekLow !== undefined &&
        data.fiftyTwoWeekHigh !== undefined && (
          <div>
            <div className="caption text-soft flex items-baseline justify-between gap-2">
              <span>52-week range</span>
              {position !== null && (
                <span className="tabular-nums">
                  {Math.round(position * 100)}% of range
                </span>
              )}
            </div>
            <div className="relative mt-1.5 h-1.5 w-full rounded-full bg-white/[0.08]">
              {position !== null && (
                <>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${position * 100}%`,
                      background: "var(--color-accent-line)",
                    }}
                  />
                  <div
                    className="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      left: `${position * 100}%`,
                      background: "var(--color-strong)",
                      boxShadow:
                        "0 0 8px hsl(var(--zf-accent-hue, 242) 85% 72% / 0.6)",
                    }}
                  />
                </>
              )}
            </div>
            <div className="caption text-soft mt-1 flex justify-between tabular-nums">
              <span>{money.price(data.fiftyTwoWeekLow)}</span>
              <span>{money.price(data.fiftyTwoWeekHigh)}</span>
            </div>
          </div>
        )}

      <div className="mt-auto grid grid-cols-2 gap-2">
        {data.marketCap !== undefined && (
          <div className="rounded bg-white/[0.04] px-3 py-2">
            <div className="caption text-soft">Market cap</div>
            <div className="metric-sm text-strong tabular-nums">
              {money.compact(data.marketCap)}
            </div>
          </div>
        )}
        {data.averageVolume !== undefined && (
          <div className="rounded bg-white/[0.04] px-3 py-2">
            <div className="caption text-soft">Avg volume</div>
            <div className="metric-sm text-strong tabular-nums">
              {formatCompact(data.averageVolume)}
              <span className="caption text-soft ml-1">shares</span>
            </div>
          </div>
        )}
        {dividendParts.length > 0 && (
          <div className="col-span-2 rounded bg-white/[0.04] px-3 py-2">
            <div className="caption text-soft">Dividend (annualised)</div>
            <div className="metric-sm text-strong tabular-nums">
              {dividendParts.join(" · ")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const companyProfileFrame = defineFrame({
  ...companyProfileMeta,
  component: CompanyProfile,
});
