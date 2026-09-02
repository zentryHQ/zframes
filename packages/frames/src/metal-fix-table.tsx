import { defineFrame, useMetalHistory, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct } from "./format";
import { formatFixPrice, metalName, pctChange } from "./metals-shared";
import { metalFixTableMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = metalFixTableMeta.schema;

/** "23 Jul 2026" — the fix is a dated print, so it reads as a date, not a delta. */
function formatFixDate(time: number): string {
  return new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** One shared column template so the header labels sit over their numerals. */
const COLUMNS = "grid grid-cols-[minmax(0,1fr)_auto_4.25rem] items-baseline";

/**
 * `display: contents` on each row — the row element generates no box, so its
 * three cells stay direct grid items of the body grid and the columns still
 * size across every row (per-row grids would let the `auto` fix column drift
 * row to row). That is what lets this be a real table for a screen reader
 * without moving a pixel: rows emitted as fragments have no element to carry
 * `role="row"`, so a listener got a flat run of dates and numbers with no
 * header association.
 */
const ROW = "contents";

function MetalFixTable({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const { histories, isLoading } = useMetalHistory(
    [config.symbol],
    config.currency,
  );

  // The provider drops a metal whose file failed rather than failing the call,
  // so match on symbol instead of trusting position — and keep the array
  // identity stable so the row maths doesn't re-run every render.
  const points = useMemo(
    () => histories.find((h) => h.symbol === config.symbol)?.points ?? [],
    [histories, config.symbol],
  );

  const rows = useMemo(() => {
    const tail = points.slice(-config.rows);
    const offset = points.length - tail.length;
    const out: { time: number; value: number; changePct: number | null }[] = [];
    // Newest first, and each row's change is measured against the fix that
    // actually precedes it in the full series — including the oldest row shown.
    for (let i = tail.length - 1; i >= 0; i -= 1) {
      const prev = points[offset + i - 1];
      out.push({
        time: tail[i].time,
        value: tail[i].value,
        // The very first fix ever published has nothing to difference against;
        // that's an absent change, not an unchanged one.
        changePct: prev ? pctChange(prev.value, tail[i].value) : null,
      });
    }
    return out;
  }, [points, config.rows]);

  if (isLoading && rows.length === 0)
    return <FrameStatus loading>loading London fix history…</FrameStatus>;
  if (rows.length === 0)
    return (
      <FrameStatus>
        no London fix history for {metalName(config.symbol)} yet
      </FrameStatus>
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">london fix</div>
          <div className="body-sm text-normal">
            {metalName(config.symbol)} · {config.currency}
          </div>
        </div>
        <div className="caption text-soft text-right">daily</div>
      </div>

      {/* The head is pinned outside the scroll box, so the table role goes on
          a wrapper holding both — same gaps, same flex behaviour. */}
      <div
        role="table"
        aria-label={`${metalName(config.symbol)} London fix history`}
        aria-rowcount={rows.length + 1}
        className="flex min-h-0 flex-1 flex-col gap-2"
      >
        <div
          role="row"
          className={`${COLUMNS} caption text-disabled gap-x-3 border-b border-white/[0.08] pr-1 pb-1 uppercase`}
        >
          <span role="columnheader">date</span>
          <span role="columnheader" className="text-right">
            fix
          </span>
          <span role="columnheader" className="text-right">
            chg
          </span>
        </div>

        <div
          role="rowgroup"
          className={`${scrollAreaClass} ${COLUMNS} content-start gap-x-3`}
        >
          {rows.map((row) => (
            <div key={row.time} role="row" className={ROW}>
              <span
                role="rowheader"
                className="body-sm text-soft truncate py-1"
              >
                {formatFixDate(row.time)}
              </span>
              <span
                role="cell"
                className="body-sm text-strong py-1 text-right tabular-nums"
              >
                {formatFixPrice(row.value, config.currency, money)}
              </span>
              {row.changePct === null ? (
                <span
                  role="cell"
                  className="body-sm text-disabled py-1 text-right tabular-nums"
                >
                  —
                </span>
              ) : (
                <span
                  role="cell"
                  className="body-sm py-1 text-right font-bold tabular-nums"
                  style={{ color: changeColor(row.changePct) }}
                >
                  {formatChangePct(row.changePct)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const metalFixTableFrame = defineFrame({
  ...metalFixTableMeta,
  component: MetalFixTable,
});
