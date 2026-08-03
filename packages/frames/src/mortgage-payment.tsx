import {
  defineFrame,
  useHomeValueIndex,
  useMortgageRates,
  useMoney,
} from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { MetricRow } from "./metric-row";
import { mortgagePaymentMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = mortgagePaymentMeta.schema;

const MONTHS_PER_YEAR = 12;

/**
 * Standard amortising monthly payment (principal + interest):
 *   M = L · r / (1 − (1+r)^−n)
 * with `r` the monthly rate and `n` the number of payments. The zero-rate branch
 * is not hypothetical padding — it's the limit of that formula, which divides by
 * zero at r = 0, and a rate series can legitimately print 0 in a stub or a mock.
 *
 * Deliberately principal-and-interest ONLY: taxes, insurance and HOA vary by
 * county and are not in either source, so including a guess would make the
 * number look more authoritative than it is.
 */
export function monthlyPayment(
  loan: number,
  annualRatePct: number,
  termYears: number,
): number {
  const n = termYears * MONTHS_PER_YEAR;
  if (n <= 0) return 0;
  const r = annualRatePct / 100 / MONTHS_PER_YEAR;
  if (r <= 0) return loan / n;
  return (loan * r) / (1 - Math.pow(1 + r, -n));
}

function MortgagePayment({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  // Stable identity across renders; the hook keys its poll on the contents.
  const regions = useMemo(() => [config.region], [config.region]);
  const { index, isLoading: valueLoading } = useHomeValueIndex(regions);
  const { series: rate, isLoading: rateLoading } = useMortgageRates();

  const entry = index?.entries[0];

  if ((valueLoading && !index) || (rateLoading && !rate))
    return <FrameStatus loading>loading home value and rate…</FrameStatus>;
  // Both halves are required — a payment needs a price AND a rate, so a partial
  // answer would be a wrong answer rather than a smaller one.
  if (!entry || !rate)
    return <FrameStatus>no home-value or rate data yet</FrameStatus>;

  const loan = entry.value * (1 - config.downPaymentPct / 100);
  const payment = monthlyPayment(loan, rate.latest, config.termYears);

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div>
        <div className="caption text-soft truncate uppercase">
          {entry.region} · monthly P&amp;I
        </div>
        <div className="metric-xl text-strong leading-none tabular-nums">
          {money.price(payment)}
        </div>
      </div>
      <div>
        <MetricRow
          label="Typical home value"
          value={money.price(entry.value)}
        />
        <MetricRow
          label="Loan amount"
          meta={`${config.downPaymentPct}% down`}
          value={money.price(loan)}
        />
        <MetricRow
          label={rate.label}
          meta={rate.date}
          value={formatPct(rate.latest)}
        />
        <MetricRow label="Term" value={`${config.termYears}y`} />
      </div>
      <div className="caption text-soft text-center">
        principal &amp; interest only — no taxes, insurance or HOA
      </div>
    </div>
  );
}

export const mortgagePaymentFrame = defineFrame({
  ...mortgagePaymentMeta,
  component: MortgagePayment,
});
