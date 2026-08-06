import { defineFrame, useEarningsCalendar } from "@zframes/core";
import { Fragment, useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { formatCompactUsd, formatPrice } from "./format";
import { earningsCalendarMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = earningsCalendarMeta.schema;

/** One shared column template so the header labels sit over their numerals. */
const COLUMNS = "grid grid-cols-[minmax(0,1fr)_5rem_4.5rem] items-start";

/**
 * Format a bare `YYYY-MM-DD` as a readable session, parsing it at LOCAL
 * midnight. `new Date("2026-05-21")` is parsed as UTC per spec, which names the
 * previous day west of Greenwich — the card would then head a list of
 * Thursday's reporters as Wednesday's.
 */
function formatSession(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
}

/** "pre" / "post"; null when the exchange hasn't said which side of the day. */
function sessionSide(time: string): { label: string; title: string } | null {
  if (time === "pre-market") return { label: "pre", title: "before the open" };
  if (time === "after-hours")
    return { label: "post", title: "after the close" };
  return null;
}

/** An EPS with its sign outside the symbol: "-$0.30", not "$-0.3000" — see the
 *  same helper in `earnings-surprise`; {@link formatPrice} owns the rounding. */
function formatEps(value: number): string {
  return value < 0 ? `-${formatPrice(-value)}` : formatPrice(value);
}

function EarningsCalendar({ config }: { config: z.output<typeof schema> }) {
  const { data, isLoading } = useEarningsCalendar(config.date);

  const rows = useMemo(
    () =>
      [...data]
        // Market cap ranks the session's heavyweights, so an entry without one
        // sorts last rather than being dropped or read as a zero-cap company.
        // Spelled out instead of `(b.marketCap ?? -Infinity) - …`, which yields
        // NaN when both are absent and leaves the comparator undefined.
        .sort((a, b) => {
          if (a.marketCap == null && b.marketCap == null) return 0;
          if (a.marketCap == null) return 1;
          if (b.marketCap == null) return -1;
          return b.marketCap - a.marketCap;
        })
        .slice(0, config.count),
    [data, config.count],
  );

  // The config's date is optional, so the card must say which session it ended
  // up listing — the provider's own entries are the authority when it defaulted.
  const sessionIso = config.date ?? rows[0]?.date;
  const sessionLabel = sessionIso ? formatSession(sessionIso) : null;

  if (isLoading)
    return <FrameStatus loading>loading earnings calendar…</FrameStatus>;

  if (rows.length === 0)
    return (
      <FrameStatus>
        no companies report on {sessionLabel ?? sessionIso ?? "this session"}
      </FrameStatus>
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="caption text-soft uppercase">reporting</div>
          <div className="body-sm text-strong truncate font-semibold">
            {sessionLabel ?? sessionIso ?? "next session"}
          </div>
        </div>
        <div className="caption text-soft shrink-0 text-right">
          {rows.length} {rows.length === 1 ? "company" : "companies"}
        </div>
      </div>

      <div
        className={`${COLUMNS} caption text-disabled gap-x-3 border-b border-white/[0.08] pr-1 pb-1 uppercase`}
      >
        <span>company</span>
        <span className="text-right">est. eps</span>
        <span className="text-right">mkt cap</span>
      </div>

      <div className={`${scrollAreaClass} ${COLUMNS} content-start gap-x-3`}>
        {rows.map((e) => {
          const side = sessionSide(e.time);
          return (
            <Fragment key={`${e.symbol}-${e.date}`}>
              <div className="min-w-0 py-1">
                <div className="flex items-center gap-1.5">
                  <span className="body-sm text-strong truncate font-semibold">
                    {tickerOf(e.symbol)}
                  </span>
                  {side && (
                    <span
                      title={side.title}
                      className="caption text-soft shrink-0 rounded-full bg-white/[0.07] px-1.5 py-[1px] uppercase tracking-[0.08em]"
                    >
                      {side.label}
                    </span>
                  )}
                </div>
                <div className="caption text-soft truncate">
                  {e.companyName || tickerOf(e.symbol)}
                </div>
              </div>

              <div className="py-1 text-right">
                <div className="body-sm text-strong tabular-nums">
                  {e.consensusEps == null ? (
                    <span className="text-disabled">—</span>
                  ) : (
                    formatEps(e.consensusEps)
                  )}
                </div>
                {e.estimateCount != null && (
                  <div className="caption text-soft tabular-nums">
                    {e.estimateCount} est
                  </div>
                )}
              </div>

              <div className="body-sm text-normal py-1 text-right tabular-nums">
                {e.marketCap == null ? (
                  <span className="text-disabled">—</span>
                ) : (
                  formatCompactUsd(e.marketCap)
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export const earningsCalendarFrame = defineFrame({
  ...earningsCalendarMeta,
  component: EarningsCalendar,
});
