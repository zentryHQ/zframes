import { defineFrame, useEarningsHistory } from "@zframes/core";
import type { EarningsResult } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import {
  DOWN_COLOR,
  UP_COLOR,
  changeColor,
  formatChangePct,
  formatPrice,
} from "./format";
import { earningsSurpriseMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = earningsSurpriseMeta.schema;

/** "Apr 2026" → "Apr '26" — twelve columns of a four-digit year don't fit. Only
 *  a trailing year is shortened, so an unexpected label shape passes through. */
function shortPeriod(label: string): string {
  return label.replace(/\b\d{2}(\d{2})$/, "'$1");
}

/** An EPS with its sign outside the symbol: "-$0.30", not "$-0.3000". The price
 *  path assumes a positive magnitude and a per-share figure is routinely
 *  negative, so format the magnitude through {@link formatPrice} — which keeps
 *  owning the rounding — and lead with the minus, as `formatMoneyCompact` does. */
function formatEps(value: number): string {
  return value < 0 ? `-${formatPrice(-value)}` : formatPrice(value);
}

/** A quarter's bar pair, already resolved against the window's shared scale. */
interface Column {
  key: string;
  label: string;
  eps: number;
  consensusEps?: number;
  /** Published surprise, or one derived from the pair; null when unknowable. */
  surprisePct: number | null;
}

/**
 * Use the publisher's own surprise when it ships one. Otherwise derive it from
 * the pair that is right there — a column showing both bars but no percentage
 * reads as broken. Dividing by |consensus| keeps "beat = positive" honest when
 * the estimate itself is a loss, and a zero consensus has no percentage at all
 * (that division is Infinity, which must never reach the DOM).
 */
function surpriseOf(r: EarningsResult): number | null {
  if (r.surprisePct != null && Number.isFinite(r.surprisePct))
    return r.surprisePct;
  if (r.consensusEps == null || r.consensusEps === 0) return null;
  const pct = ((r.eps - r.consensusEps) / Math.abs(r.consensusEps)) * 100;
  return Number.isFinite(pct) ? pct : null;
}

/**
 * One bar of a quarter's pair. Split into an above-zero and a below-zero region
 * so a loss-making quarter grows downward from the shared baseline instead of
 * clipping at it; both regions are laid out for every bar, which is what keeps
 * the pair (and every other column) on one axis.
 */
function Bar({
  up,
  down,
  posPct,
  fill,
  title,
}: {
  up: number;
  down: number;
  posPct: number;
  fill?: string;
  title: string;
}) {
  const neutral = fill ? "" : " bg-white/[0.16]";
  return (
    <div
      className="flex h-full min-w-0 max-w-[14px] flex-1 flex-col"
      title={title}
    >
      <div
        className="flex flex-col justify-end"
        style={{ height: `${posPct}%` }}
      >
        <div
          className={`w-full rounded-t-[2px]${neutral}`}
          style={{ height: `${up * 100}%`, background: fill }}
        />
      </div>
      <div
        className="flex flex-col justify-start"
        style={{ height: `${100 - posPct}%` }}
      >
        <div
          className={`w-full rounded-b-[2px]${neutral}`}
          style={{ height: `${down * 100}%`, background: fill }}
        />
      </div>
    </div>
  );
}

function EarningsSurprise({ config }: { config: z.output<typeof schema> }) {
  const { data, isLoading } = useEarningsHistory(config.symbol);

  const view = useMemo(() => {
    const results = data?.results ?? [];
    // Results arrive newest first; reverse the window so the card reads
    // left-to-right in time like every other trend on the board.
    const recent = results.slice(0, config.count).reverse();
    const columns: Column[] = recent.map((r, i) => ({
      // dateReported is the natural key but is not guaranteed unique across
      // restatements, so the index disambiguates.
      key: `${r.dateReported}-${i}`,
      label: r.fiscalQuarterEnd,
      eps: r.eps,
      consensusEps:
        r.consensusEps != null && Number.isFinite(r.consensusEps)
          ? r.consensusEps
          : undefined,
      surprisePct: surpriseOf(r),
    }));

    // Both series share one scale — comparing the pair is the whole point.
    const values = columns.flatMap((c) =>
      c.consensusEps == null ? [c.eps] : [c.eps, c.consensusEps],
    );
    const maxPos = Math.max(0, ...values);
    const minNeg = Math.min(0, ...values);
    const span = maxPos - minNeg || 1;
    const posPct = (maxPos / span) * 100;

    const compared = columns.filter((c) => c.surprisePct != null);
    const avgSurprise = compared.length
      ? compared.reduce((sum, c) => sum + (c.surprisePct as number), 0) /
        compared.length
      : null;

    return {
      columns,
      maxPos,
      minNeg,
      posPct,
      avgSurprise,
      comparedCount: compared.length,
      beatCount: compared.filter((c) => (c.surprisePct as number) > 0).length,
    };
  }, [data, config.count]);

  if (isLoading)
    return <FrameStatus loading>loading earnings history…</FrameStatus>;
  if (view.columns.length === 0)
    return (
      <FrameStatus>
        no reported earnings for “{tickerOf(config.symbol)}”
      </FrameStatus>
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="body-sm text-strong truncate font-semibold">
            {tickerOf(config.symbol)}
          </div>
          <div className="caption text-soft truncate">
            reported EPS vs consensus
          </div>
        </div>
        <div className="shrink-0 text-right">
          {view.avgSurprise === null ? (
            <>
              <div className="metric-sm text-disabled">—</div>
              <div className="caption text-soft">no consensus published</div>
            </>
          ) : (
            <>
              <div
                className="metric-sm"
                style={{ color: changeColor(view.avgSurprise) }}
              >
                {formatChangePct(view.avgSurprise)}
              </div>
              <div className="caption text-soft">
                beat {view.beatCount} of {view.comparedCount}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch gap-2">
        {view.columns.map((c) => {
          const surpriseColor =
            c.surprisePct === null ? undefined : changeColor(c.surprisePct);
          const bar = (value: number, fill?: string, kind = "reported") => ({
            up: view.maxPos > 0 && value > 0 ? value / view.maxPos : 0,
            down: view.minNeg < 0 && value < 0 ? value / view.minNeg : 0,
            posPct: view.posPct,
            fill,
            title: `${c.label} · ${kind} ${formatEps(value)}`,
          });
          return (
            <div key={c.key} className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="relative flex min-h-0 flex-1 items-stretch justify-center gap-[3px]">
                {/* Zero baseline, bled across the column gap so the axis reads
                    as one line rather than a dashed row of stubs. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute -inset-x-1 border-t border-white/10"
                  style={{ top: `${view.posPct}%` }}
                />
                {/* A quarter with no consensus still reported a real EPS: its
                    bar stays, uncoloured, and only the comparison is dropped. */}
                <Bar {...bar(c.eps, surpriseColor)} />
                {c.consensusEps != null && (
                  <Bar {...bar(c.consensusEps, undefined, "consensus")} />
                )}
              </div>
              <div className="caption text-soft truncate text-center">
                {shortPeriod(c.label)}
              </div>
              <div
                className="caption truncate text-center font-bold tabular-nums"
                style={{ color: surpriseColor }}
              >
                {c.surprisePct === null ? (
                  <span className="text-disabled">—</span>
                ) : (
                  formatChangePct(c.surprisePct)
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="caption text-soft flex items-center justify-center gap-3">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-2 rounded-[2px]"
            style={{ background: UP_COLOR }}
          />
          beat
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2 w-2 rounded-[2px]"
            style={{ background: DOWN_COLOR }}
          />
          miss
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-[2px] bg-white/[0.16]" />
          consensus
        </span>
      </div>
    </div>
  );
}

export const earningsSurpriseFrame = defineFrame({
  ...earningsSurpriseMeta,
  component: EarningsSurprise,
});
