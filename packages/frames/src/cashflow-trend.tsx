import { BarChart, type BarDatum } from "@zframes/charts";
import { defineFrame, useEquityFinancials } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { DOWN_COLOR_HEX, formatCompactUsd, UP_COLOR_HEX } from "./format";
import { cashflowTrendMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = cashflowTrendMeta.schema;

/** Fiscal years shown. Three bars each, so more than this stops fitting a card
 *  and the oldest years are the least interesting anyway. */
const MAX_YEARS = 4;

/** Compare published labels on letters and digits alone: the operating line
 *  ships as "Net Cash Flow-Operating", and whether that hyphen has spaces
 *  around it shouldn't decide if the card renders. Pre-normalised below. */
const norm = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const OPERATING_LABELS = [
  "net cash flow operating",
  "operating cash flow",
  "cash flow from operating activities",
  "net cash provided by operating activities",
  "net cash provided by used in operating activities",
];

const CAPEX_LABELS = [
  "capital expenditures",
  "capital expenditure",
  "capex",
  "purchase of property and equipment",
];

/** A blank published cell is `null` and must stay a gap — a zero-cash year is
 *  a real and dramatic event, so never invent one out of a missing print. */
const finite = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** "1/25/2026" → "FY26". Statements are discussed in fiscal years; the
 *  exchange publishes the period-end date instead. An unparseable label is
 *  passed through rather than guessed at (BarChart truncates it and keeps the
 *  full text in the row's hover title). */
function fiscalYear(period: string): string {
  const parsed = Date.parse(period);
  if (Number.isFinite(parsed))
    return `FY${String(new Date(parsed).getFullYear()).slice(-2)}`;
  const year = /(?:19|20)\d{2}/.exec(period);
  return year ? `FY${year[0].slice(-2)}` : period;
}

function CashflowTrend({ config }: { config: z.output<typeof schema> }) {
  const ticker = tickerOf(config.symbol);
  const { data, isLoading } = useEquityFinancials(ticker, "annual");

  const built = useMemo(() => {
    const rows = data?.cashFlow ?? [];
    const operatingRow = rows.find((r) =>
      OPERATING_LABELS.includes(norm(r.label)),
    );
    const capexRow = rows.find((r) => CAPEX_LABELS.includes(norm(r.label)));
    const bars: BarDatum[] = [];
    let years = 0;

    // Periods are newest-first: take the most recent few, then flip so the
    // card reads oldest→newest like every other trend on the board.
    const indices = (data?.periods ?? [])
      .map((_, i) => i)
      .slice(0, MAX_YEARS)
      .reverse();

    for (const i of indices) {
      const label = fiscalYear(data?.periods[i] ?? "");
      const operating = finite(operatingRow?.values[i]);
      const capexRaw = finite(capexRow?.values[i]);
      // Capex is published as cash OUT, i.e. already negative. Free cash flow
      // is therefore operating PLUS that negative — subtracting the published
      // value would add the outflow back and inflate FCF by twice the capex.
      // Normalising to a magnitude makes the arithmetic hold whichever sign
      // the filer used, and lets the bar read as the outflow it is.
      const capexOut = capexRaw === null ? null : Math.abs(capexRaw);
      if (operating === null && capexOut === null) continue;
      years += 1;

      if (operating !== null)
        bars.push({
          label: `${label} Operating`,
          value: operating,
          color: operating >= 0 ? UP_COLOR_HEX : DOWN_COLOR_HEX,
        });
      // Capex keeps the chart's default accent: spending is neither a gain nor
      // a loss, and tinting it red would read as a warning it isn't.
      if (capexOut !== null)
        bars.push({ label: `${label} Capex (out)`, value: capexOut });
      if (operating !== null && capexOut !== null) {
        const fcf = operating - capexOut;
        bars.push({
          label: `${label} Free cash`,
          value: fcf,
          color: fcf >= 0 ? UP_COLOR_HEX : DOWN_COLOR_HEX,
        });
      }
    }

    return {
      bars,
      years,
      hasOperating: operatingRow !== undefined,
      hasCapex: capexRow !== undefined,
    };
  }, [data]);

  if (isLoading && !data)
    return <FrameStatus loading>loading cash-flow statement…</FrameStatus>;
  if (!data)
    return <FrameStatus>no published financials for “{ticker}”</FrameStatus>;
  if (built.bars.length === 0)
    return (
      <FrameStatus>
        no operating cash-flow or capital-expenditure rows for “{ticker}”
      </FrameStatus>
    );

  // Name the gap rather than quietly drawing two thirds of the chart: without
  // both legs there is no free cash flow to derive.
  const gap = !built.hasOperating
    ? "no published operating-cash-flow row — free cash flow unavailable"
    : !built.hasCapex
      ? "no published capital-expenditure row — free cash flow unavailable"
      : "free cash = operating − capex";

  return (
    <div className="flex h-full min-h-0 flex-col gap-1 text-normal">
      <div className={scrollAreaClass}>
        <BarChart
          data={built.bars}
          orientation="horizontal"
          height={Math.max(built.bars.length * 22, 96)}
          formatValue={formatCompactUsd}
        />
      </div>
      <div className="caption text-soft text-center">
        {ticker} · last {built.years} fiscal{" "}
        {built.years === 1 ? "year" : "years"}, oldest first · capex shown as an
        outflow magnitude · {gap}
      </div>
    </div>
  );
}

export const cashflowTrendFrame = defineFrame({
  ...cashflowTrendMeta,
  component: CashflowTrend,
});
