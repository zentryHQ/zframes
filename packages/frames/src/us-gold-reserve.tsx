import {
  defineFrame,
  useGoldReserve,
  useMetalSpot,
  useMoney,
} from "@zframes/core";
import type { z } from "zod";
import { changeColor, formatCompact } from "./format";
import { MetricRow } from "./metric-row";
import { usGoldReserveMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = usGoldReserveMeta.schema;

/** Module-level so the spot poll keys off one stable array, not a fresh render. */
const GOLD = ["XAU"] as const;

/** "30 Jun 2026" — the report is a dated monthly print, not a live tick. */
function formatReportDate(time: number): string {
  return new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    // asOf is parsed as UTC midnight; without this a western timezone would
    // render the month-end report as the day before.
    timeZone: "UTC",
  });
}

function UsGoldReserve({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const { reserve, isLoading } = useGoldReserve();
  // Hooks can't be conditional — the quote is one shared, cached call that the
  // rest of the board is almost certainly making anyway, and it's simply
  // ignored when the market-value line is switched off.
  const { metals } = useMetalSpot(GOLD);

  if (isLoading && !reserve)
    return <FrameStatus loading>loading gold reserve…</FrameStatus>;
  if (!reserve || reserve.totalOunces <= 0)
    return <FrameStatus>no gold-reserve report yet</FrameStatus>;

  const { totalOunces, totalBookValueUsd: bookValue } = reserve;
  // The statutory price isn't a field in the report — it falls out of it
  // ($42.2222/oz, unchanged since 1973), so derive rather than hard-code.
  const bookPerOz = bookValue > 0 ? bookValue / totalOunces : null;
  // A missing quote is genuinely absent, not zero: valuing 261 M oz at $0 would
  // print "$0" at market and an eleven-figure unrealised *loss*.
  const quote = metals.find((m) => m.symbol === "XAU");
  const spot = quote && quote.price > 0 ? quote.price : null;
  const market =
    config.showMarketValue && spot !== null
      ? { spot, value: totalOunces * spot }
      : null;
  // The row shows the gain, so the multiple beside it has to be the gain's own
  // — market ÷ book is exactly one turn higher and would overstate it.
  const gain =
    market !== null && bookValue > 0 ? market.value - bookValue : null;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-2">
      <div>
        <div className="caption text-soft uppercase">US official gold</div>
        <div className="metric-xl text-strong leading-none">
          {formatCompact(totalOunces)}
          <span className="body-lg text-soft ml-1.5">oz</span>
        </div>
      </div>

      <div className="flex flex-col">
        {bookPerOz !== null && (
          <MetricRow
            label="Book value"
            meta={`carried at ${money.price(bookPerOz)}/oz`}
            value={money.compact(bookValue)}
          />
        )}
        {market !== null && (
          <MetricRow
            label="At market"
            meta={`spot ${money.price(market.spot)}/oz`}
            value={money.compact(market.value)}
          />
        )}
        {gain !== null && (
          <MetricRow
            label="Unrealised gain"
            meta={`${(gain / bookValue).toFixed(0)}× the book value`}
            value={
              <span style={{ color: changeColor(gain) }}>
                {gain >= 0 ? "+" : ""}
                {money.compact(gain)}
              </span>
            }
          />
        )}
      </div>

      {/* The card chrome already credits "U.S. Treasury", so this line only has
          to carry the date — spelling out the report name wrapped it to two
          lines and pushed the last MetricRow past the card. */}
      <div className="caption text-soft">
        monthly status report
        {Number.isFinite(reserve.asOf)
          ? ` · as of ${formatReportDate(reserve.asOf)}`
          : ""}
      </div>
    </div>
  );
}

export const usGoldReserveFrame = defineFrame({
  ...usGoldReserveMeta,
  component: UsGoldReserve,
});
