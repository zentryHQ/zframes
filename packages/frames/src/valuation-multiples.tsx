import {
  defineFrame,
  useEquityFinancials,
  useEquityProfile,
  useMoney,
} from "@zframes/core";
import type { FinancialStatementRow } from "@zframes/core";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { formatPct } from "./format";
import { MetricRow } from "./metric-row";
import { valuationMultiplesMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = valuationMultiplesMeta.schema;

/**
 * Published line labels we accept per input, most specific first. Filers word
 * their statements differently ("Total Revenue", "Total Net Revenues", "Net
 * Sales") and the row ORDER is not a contract, so every lookup is by label —
 * indexing by position would silently read a different line the year a filer
 * inserts a row.
 *
 * Written pre-normalised (see {@link normaliseLabel}): lower case, punctuation
 * already reduced to spaces.
 */
const REVENUE_LABELS = [
  "total revenue",
  "total net revenue",
  "net revenue",
  "total net sales",
  "net sales",
  "revenues",
];

/** Diluted first: it counts the shares options and converts will become, so it
 *  is the conservative earnings-per-share and the one a P/E should quote. */
const EPS_LABELS = [
  "diluted eps",
  "diluted earnings per share",
  "eps diluted",
  "earnings per share diluted",
  "eps earnings per share",
  "earnings per share",
  "basic eps",
];

/**
 * The P/E fallback denominator. "Net Income Applicable to Common Shareholders"
 * comes FIRST: it strips preferred dividends and minority interest, so it is
 * the earnings the common shareholder buying this P/E actually owns. Plain
 * "Net Income" is the same figure for a company with neither, which is most of
 * them, and is the fallback rather than the preference for the ones where it
 * isn't. "Net Income-Cont. Operations" is last — excluding discontinued
 * operations flatters a company that just shed a loss-making arm.
 */
const NET_INCOME_LABELS = [
  "net income applicable to common shareholders",
  "net income",
  "net income cont operations",
];

const EQUITY_LABELS = [
  "total shareholders equity",
  "total stockholders equity",
  "total shareholder equity",
  "total stockholder equity",
  "shareholders equity",
  "stockholders equity",
  "total equity",
];

/** "Shareholders' Equity" and "EPS - Earnings Per Share" reduced to something
 *  the label lists above can be compared against. */
function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The first row matching an accepted label — exact match first, then a PREFIX
 * match so "Diluted EPS - Earnings Per Share" still resolves. Prefix and never
 * substring: "Cost of Revenue" *contains* "revenue" and would otherwise be read
 * as the top line, which is the kind of wrong that still looks like a number.
 */
function findRow(
  rows: FinancialStatementRow[],
  accepted: string[],
): FinancialStatementRow | null {
  const normalised = rows.map(
    (row) => [normaliseLabel(row.label), row] as const,
  );
  for (const want of accepted) {
    const exact = normalised.find(([label]) => label === want);
    if (exact) return exact[1];
    const prefixed = normalised.find(([label]) => label.startsWith(want));
    if (prefixed) return prefixed[1];
  }
  return null;
}

/** One statement figure with the label and fiscal period it was published under. */
interface LineItem {
  label: string;
  value: number;
  period: string;
}

/**
 * The newest published figure of a line item. `periods` is newest-first and
 * `values` is aligned index-for-index with it, so this walks forward from index
 * 0 to the first cell the publisher actually filled — a blank latest column
 * means the figure is one period older, not that it is zero, and the period
 * travels with the value so a stale input is visible in the caption.
 */
function latestLineItem(
  rows: FinancialStatementRow[],
  accepted: string[],
  periods: string[],
): LineItem | null {
  const row = findRow(rows, accepted);
  if (!row) return null;
  for (let i = 0; i < row.values.length; i++) {
    const value = row.values[i];
    if (value === null || !Number.isFinite(value)) continue;
    return {
      label: row.label,
      value,
      period: i < periods.length ? periods[i] : "period unknown",
    };
  }
  return null;
}

/** A derived multiple, or the reason there isn't one to show. */
type Derived =
  { value: number; reason?: undefined } | { value: null; reason: string };

/**
 * numerator ÷ denominator, refusing every division that would print a number
 * nobody should read. The one that matters is a zero or NEGATIVE denominator: a
 * loss-making company has no P/E, and "-14.2×" makes it look cheaper than a
 * profitable peer — exactly backwards. Missing legs get their own reason so the
 * card says which input it is waiting on.
 */
function derive(
  numerator: number | undefined,
  denominator: number | undefined,
  reasons: { numerator: string; denominator: string; nonPositive: string },
): Derived {
  if (numerator === undefined || !Number.isFinite(numerator))
    return { value: null, reason: reasons.numerator };
  if (denominator === undefined || !Number.isFinite(denominator))
    return { value: null, reason: reasons.denominator };
  if (denominator <= 0) return { value: null, reason: reasons.nonPositive };
  const value = numerator / denominator;
  return Number.isFinite(value)
    ? { value }
    : { value: null, reason: "not computable" };
}

/** A multiple reads as "28.4×". Past 100× the tenth is noise — a four-figure
 *  P/E is a fact about the denominator, not a precision. */
function formatMultiple(value: number): string {
  return value >= 100
    ? `${Math.round(value).toLocaleString("en-US")}×`
    : `${value.toFixed(1)}×`;
}

/** The value cell of a multiple that can't be shown: never a number, always the
 *  reason, so "n/a" is answerable instead of merely blank. */
function Unavailable({ reason }: { reason: string }) {
  return (
    <span className="text-disabled">
      n/a <span className="caption">· {reason}</span>
    </span>
  );
}

function ValuationMultiples({ config }: { config: z.output<typeof schema> }) {
  // A HIP-3 market name ("xyz:NVDA") never reaches the exchange — it only knows
  // the listed ticker. Stripping is idempotent, so a provider that also strips
  // is unaffected.
  const ticker = tickerOf(config.symbol);
  const { data: profile, isLoading: profileLoading } = useEquityProfile(ticker);
  const { data: financials, isLoading: financialsLoading } =
    useEquityFinancials(ticker, "annual");
  const money = useMoney();

  // Both halves feed the same rows, so the card waits only until the first of
  // them lands — a profile with pending statements still has a market cap worth
  // showing.
  if (!profile && !financials) {
    if (profileLoading || financialsLoading)
      return <FrameStatus loading>loading valuation inputs…</FrameStatus>;
    return <FrameStatus>no valuation data for “{ticker}”</FrameStatus>;
  }

  const periods = financials?.periods ?? [];
  const revenue = financials
    ? latestLineItem(financials.incomeStatement, REVENUE_LABELS, periods)
    : null;
  const eps = financials
    ? latestLineItem(financials.incomeStatement, EPS_LABELS, periods)
    : null;
  // Confirmed live against NVDA: the exchange's income statement runs Total
  // Revenue → Net Income with NO per-share row at all, so the price ÷ EPS path
  // resolves to "not reported" for the multiple people actually came for.
  // Market cap ÷ net income is the same ratio — both are (price × shares) ÷
  // (earnings × shares) — and needs no share count, so it is a fallback rather
  // than a different number. EPS stays preferred: when a filer does publish the
  // per-share line it is the figure they stand behind, already diluted.
  const netIncome = financials
    ? latestLineItem(financials.incomeStatement, NET_INCOME_LABELS, periods)
    : null;
  const equity = financials
    ? latestLineItem(financials.balanceSheet, EQUITY_LABELS, periods)
    : null;

  // While the statements are still in flight the denominator is pending, not
  // absent. "not reported" on a card that is merely fetching is a lie the
  // reader can't tell apart from the real thing.
  const denominatorPending =
    !financials && financialsLoading ? "loading" : "not reported";
  const marketCapPending =
    !profile && profileLoading ? "loading" : "no market cap";

  const pe = eps
    ? derive(profile?.price, eps.value, {
        numerator: !profile && profileLoading ? "loading" : "no price",
        denominator: denominatorPending,
        nonPositive: "no profit",
      })
    : derive(profile?.marketCap, netIncome?.value, {
        numerator: marketCapPending,
        denominator: denominatorPending,
        nonPositive: "no profit",
      });
  const peBasis = eps
    ? `price ÷ ${eps.label} · ${eps.period}`
    : netIncome
      ? `market cap ÷ ${netIncome.label} · ${netIncome.period}`
      : "price ÷ diluted EPS · no earnings row published";
  const ps = derive(profile?.marketCap, revenue?.value, {
    numerator: marketCapPending,
    denominator: denominatorPending,
    nonPositive: "no sales",
  });
  const pb = derive(profile?.marketCap, equity?.value, {
    numerator: marketCapPending,
    denominator: denominatorPending,
    nonPositive: "negative book",
  });
  const dividendYield = profile?.dividendYield;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="body-sm text-strong truncate font-semibold">
            {profile?.companyName || ticker}
          </div>
          <div className="caption text-soft truncate">
            {financials
              ? `${financials.frequency} statements · latest ${periods.length > 0 ? periods[0] : "period unknown"}`
              : "statements pending"}
          </div>
        </div>
        {profile?.price !== undefined && (
          <div className="caption text-soft shrink-0 tabular-nums">
            {money.price(profile.price)}
          </div>
        )}
      </div>

      <div className={`mt-2 ${scrollAreaClass}`}>
        <MetricRow
          label="Market cap"
          meta="exchange snapshot · moves with the price"
          value={
            profile?.marketCap === undefined ? (
              <Unavailable
                reason={profileLoading ? "loading" : "not published"}
              />
            ) : (
              money.compact(profile.marketCap)
            )
          }
        />
        <MetricRow
          label="Trailing P/E"
          meta={peBasis}
          value={
            pe.value === null ? (
              <Unavailable reason={pe.reason} />
            ) : (
              formatMultiple(pe.value)
            )
          }
        />
        <MetricRow
          label="P/S"
          meta={
            revenue
              ? `market cap ÷ ${revenue.label} · ${revenue.period}`
              : "market cap ÷ revenue · no revenue row published"
          }
          value={
            ps.value === null ? (
              <Unavailable reason={ps.reason} />
            ) : (
              formatMultiple(ps.value)
            )
          }
        />
        <MetricRow
          label="P/B"
          meta={
            equity
              ? `market cap ÷ ${equity.label} · ${equity.period}`
              : "market cap ÷ shareholders' equity · no equity row published"
          }
          value={
            pb.value === null ? (
              <Unavailable reason={pb.reason} />
            ) : (
              formatMultiple(pb.value)
            )
          }
        />
        <MetricRow
          label="Dividend yield"
          meta="indicated annual dividend ÷ last sale · exchange"
          value={
            dividendYield !== undefined && dividendYield > 0 ? (
              formatPct(dividendYield)
            ) : (
              <Unavailable
                reason={!profile && profileLoading ? "loading" : "no dividend"}
              />
            )
          }
        />
      </div>

      <div className="caption text-soft mt-1.5 shrink-0">
        derived here from published statements — trailing, never forward
      </div>
    </div>
  );
}

export const valuationMultiplesFrame = defineFrame({
  ...valuationMultiplesMeta,
  component: ValuationMultiples,
});
