import {
  defineFrame,
  useAnalystRatings,
  useEquityProfile,
  useMoney,
} from "@zframes/core";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { CardHeader } from "./card-header";
import { DOWN_COLOR, UP_COLOR, changeColor, formatChangePct } from "./format";
import { analystRatingsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = analystRatingsMeta.schema;

/**
 * Tint the published consensus label. The publisher's vocabulary isn't fixed
 * ("Buy", "Strong Buy", "Overweight", "Underperform", …), so this matches only
 * the words that actually carry direction and falls through to no tint — an
 * unrecognised label still reads, it just isn't coloured, which beats guessing
 * a direction and colouring it wrong.
 */
function consensusColor(label: string): string | undefined {
  const l = label.toLowerCase();
  if (/buy|outperform|overweight|accumulate/.test(l)) return UP_COLOR;
  if (/sell|underperform|underweight|reduce/.test(l)) return DOWN_COLOR;
  return undefined;
}

/** A published field is only usable once it's a real finite number. */
function usable(n: number | undefined): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function AnalystRatings({ config }: { config: z.output<typeof schema> }) {
  const { data: ratings, isLoading: ratingsLoading } = useAnalystRatings(
    config.symbol,
  );
  const { data: profile, isLoading: profileLoading } = useEquityProfile(
    config.symbol,
  );
  const money = useMoney();

  const consensus = ratings?.consensus?.trim();
  const analystCount = usable(ratings?.analystCount);
  // Usually absent — the keyless source publishes a label, not a number — so
  // this is a supporting line, never the headline, and never a dial position.
  const meanRating = usable(ratings?.meanRating);
  const brokers = ratings?.brokers ?? [];
  const target = usable(profile?.oneYearTarget);
  const price = usable(profile?.price);

  // Upside needs BOTH legs and a real divisor. A known target with no live
  // price is still worth showing; a percent derived from half the pair is not.
  const upsidePct =
    target !== undefined && price !== undefined && price > 0
      ? ((target - price) / price) * 100
      : undefined;

  const hasAny =
    Boolean(consensus) ||
    analystCount !== undefined ||
    meanRating !== undefined ||
    brokers.length > 0 ||
    target !== undefined;

  // Two hooks on different cadences: hold the skeleton until BOTH have failed
  // to produce anything, so the card doesn't flash an empty state on the way in.
  if (!hasAny)
    return ratingsLoading || profileLoading ? (
      <FrameStatus loading>loading analyst coverage…</FrameStatus>
    ) : (
      <FrameStatus>
        no analyst coverage for “{tickerOf(config.symbol)}”
      </FrameStatus>
    );

  const tint = consensus ? consensusColor(consensus) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <CardHeader>
        <CardHeader.Main>
          <CardHeader.Eyebrow>
            {tickerOf(config.symbol)} · consensus
          </CardHeader.Eyebrow>
          {/* `className="truncate"`: the consensus is a WORD, not a figure,
              and the publisher's vocabulary runs long ("Strong Buy",
              "Underperform"). */}
          <CardHeader.Value
            size="metric-lg"
            tint={tint}
            absent={consensus === undefined}
            className="truncate"
          >
            {consensus ?? "—"}
          </CardHeader.Value>
          {meanRating !== undefined && (
            <CardHeader.Sub size="caption" className="tabular-nums">
              mean {meanRating.toFixed(1)} / 5
            </CardHeader.Sub>
          )}
        </CardHeader.Main>
        {analystCount !== undefined && (
          <CardHeader.Aside>
            <CardHeader.Value>{analystCount}</CardHeader.Value>
            <CardHeader.Sub>
              {analystCount === 1 ? "analyst" : "analysts"}
            </CardHeader.Sub>
          </CardHeader.Aside>
        )}
      </CardHeader>

      {target !== undefined && (
        <div className="flex items-end justify-between gap-3 border-t border-white/[0.06] pt-2">
          <div className="min-w-0">
            <div className="caption text-soft uppercase">1y target</div>
            <div className="metric-sm text-strong tabular-nums">
              {money.price(target)}
            </div>
          </div>
          {price !== undefined && (
            <div className="min-w-0 text-center">
              <div className="caption text-soft uppercase">last</div>
              <div className="metric-sm text-normal tabular-nums">
                {money.price(price)}
              </div>
            </div>
          )}
          {upsidePct !== undefined && (
            <div className="shrink-0 text-right">
              <div className="caption text-soft uppercase">implied</div>
              <div
                className="metric-sm tabular-nums"
                style={{ color: changeColor(upsidePct) }}
              >
                {formatChangePct(upsidePct)}
              </div>
            </div>
          )}
        </div>
      )}

      {config.showBrokers && brokers.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <div className="caption text-soft uppercase">
            covering brokers · {brokers.length}
          </div>
          {/* Names arrive truncated and upper-cased ("B OF A GLBL RES") — that's
              how the source publishes them, and expanding an abbreviation would
              mean guessing which house it is. Chips as-published. */}
          <div
            className={`flex flex-wrap content-start gap-1 ${scrollAreaClass}`}
          >
            {brokers.map((broker, i) => (
              <span
                key={`${i}-${broker}`}
                className="caption text-normal truncate rounded bg-white/[0.06] px-1.5 py-0.5"
              >
                {broker}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="caption text-soft mt-auto">
        Sell-side sentiment, not fact — a consensus target averages opinions and
        is routinely wrong.
      </div>
    </div>
  );
}

export const analystRatingsFrame = defineFrame({
  ...analystRatingsMeta,
  component: AnalystRatings,
});
