import {
  defineFrame,
  useCryptoProfile,
  useMoney,
  useProtocolFundamentals,
} from "@zframes/core";
import type { z } from "zod";
import { AssetLogo, tickerOf } from "./asset-logo";
import { formatCompact, formatPct } from "./format";
import { protocolMultiplesMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = protocolMultiplesMeta.schema;

/**
 * A multiple is a ratio, not money — no currency symbol, ever, whatever the
 * board is denominated in. Precision tapers with size because the useful reading
 * changes: 5.9× vs 6.1× is a real difference, 1,140× vs 1,143× is noise.
 */
function formatMultiple(value: number): string {
  if (value >= 10_000) return `${formatCompact(value)}×`;
  if (value >= 100) return `${Math.round(value)}×`;
  if (value >= 10) return `${value.toFixed(1)}×`;
  return `${value.toFixed(2)}×`;
}

/** What a cell can say. `missing` is an input that hasn't arrived; `unmeaning`
 *  is one that arrived and is zero — different facts, so they read differently. */
type Cell = { text: string; muted: boolean };

const MISSING: Cell = { text: "—", muted: true };
/** A protocol that keeps nothing publishes a genuine zero, and price ÷ 0 is not
 *  a large multiple — it is no multiple. Never Infinity, never blank. */
const NOT_MEANINGFUL: Cell = { text: "not meaningful", muted: true };

function multipleOf(
  numerator: number | undefined,
  denominator: number | undefined,
): Cell {
  if (numerator == null || denominator == null) return MISSING;
  if (numerator <= 0 || denominator <= 0) return NOT_MEANINGFUL;
  return { text: formatMultiple(numerator / denominator), muted: false };
}

/** One row of the multiple matrix: what the numerator is, then its two ratios. */
function MultipleRow({
  label,
  sub,
  perRevenue,
  perFees,
}: {
  label: string;
  sub: string;
  perRevenue: Cell;
  perFees: Cell;
}) {
  const cell = (value: Cell) => (
    <div
      className={`metric-sm truncate ${
        value.muted ? "text-soft" : "text-strong"
      }`}
    >
      {value.text}
    </div>
  );
  return (
    <>
      <div className="min-w-0">
        <div className="body-sm text-normal truncate font-semibold">
          {label}
        </div>
        <div className="caption text-soft truncate">{sub}</div>
      </div>
      {cell(perRevenue)}
      {cell(perFees)}
    </>
  );
}

function ProtocolMultiples({ config }: { config: z.output<typeof schema> }) {
  const { fundamentals, isLoading: fundamentalsLoading } =
    useProtocolFundamentals(config.protocol);
  // A HIP-3 paste ("xyz:UNI") still resolves to the bare ticker the profile
  // publisher keys on.
  const ticker = tickerOf(config.symbol);
  const { profile, isLoading: profileLoading } = useCryptoProfile(ticker);
  const money = useMoney();

  // Two hooks on different poll cadences (fundamentals ~30 min, profile ~5 min),
  // so "one arrived, the other didn't" is the FIRST PAINT, not an edge case.
  // Every figure below is read independently and each cell decides for itself
  // whether it has both of its inputs.
  const marketCap = profile?.marketCap;
  const fdv = profile?.fullyDilutedValuation;
  // The provider fills these from its own trailing sum when the publisher omits
  // its aggregate, so an absent value here means the protocol has no such line
  // at all — not that the series is merely long.
  const revenue365 = fundamentals?.revenue365d;
  const fees365 = fundamentals?.fees365d;

  if (!fundamentals && !profile)
    return fundamentalsLoading || profileLoading ? (
      <FrameStatus loading>loading protocol fundamentals…</FrameStatus>
    ) : (
      <FrameStatus>
        nothing published for “{config.protocol}” / {ticker} — the first is a
        DeFiLlama protocol slug, the second a token ticker, and they are not the
        same key
      </FrameStatus>
    );

  const takeRate =
    fees365 != null && fees365 > 0 && revenue365 != null
      ? revenue365 / fees365
      : undefined;

  // Named explicitly rather than left as a dash: a user who paired the wrong
  // slug and ticker sees an empty column, and the only useful thing a card can
  // say is WHICH half of the pair failed to resolve.
  const gaps: string[] = [];
  if (!profile) gaps.push(`market cap for ${ticker} (CoinGecko)`);
  else if (marketCap == null) gaps.push(`a published market cap for ${ticker}`);
  if (!fundamentals) gaps.push(`fees for “${config.protocol}” (DeFiLlama)`);
  else if (revenue365 == null)
    gaps.push(`a published revenue line for “${config.protocol}”`);

  const amount = (value: number | undefined) =>
    value == null ? "—" : money.compact(value);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <AssetLogo symbol={ticker} size={18} />
        <div className="body-sm text-strong truncate font-semibold">
          {fundamentals?.name ?? config.protocol}
        </div>
        <div className="caption text-soft truncate">
          {ticker} · valuation vs what the protocol earns
        </div>
      </div>

      {/* The matrix and the notes that say how to read it scroll together under
          the pinned identity row: both are stacks of text that can't be made
          smaller, so a short card slicing the last note through the middle told
          the reader nothing. Kept a flex column so the notes keep their
          `mt-auto` footing whenever there IS room. */}
      <div className={`${scrollAreaClass} flex flex-col gap-3`}>
        <div className="grid grid-cols-3 items-baseline gap-x-3 gap-y-2">
          <div />
          <div className="min-w-0">
            <div className="caption text-normal truncate font-semibold">
              ÷ REVENUE
            </div>
            <div className="caption text-soft truncate">what it kept · P/S</div>
          </div>
          <div className="min-w-0">
            <div className="caption text-normal truncate font-semibold">
              ÷ FEES
            </div>
            <div className="caption text-soft truncate">users paid · P/F</div>
          </div>

          <MultipleRow
            label="Market cap"
            sub="circulating supply"
            perRevenue={multipleOf(marketCap, revenue365)}
            perFees={multipleOf(marketCap, fees365)}
          />
          <MultipleRow
            label="FDV"
            sub="incl. locked supply"
            perRevenue={multipleOf(fdv, revenue365)}
            perFees={multipleOf(fdv, fees365)}
          />
        </div>

        <div className="mt-auto flex flex-col gap-0.5">
          <div className="caption text-soft truncate">
            mcap {amount(marketCap)} · FDV {amount(fdv)}
          </div>
          <div className="caption text-soft truncate">
            revenue 1y {amount(revenue365)} · fees 1y {amount(fees365)}
            {takeRate != null && ` · keeps ${formatPct(takeRate * 100, 1)}`}
          </div>
          <div className="caption text-soft">
            {/* The two columns differ by exactly the take rate, and the ÷FEES one
                is the flattering read — it credits a protocol with money that went
                to its LPs. FDV is the honest numerator while supply still unlocks. */}
            ÷FEES flatters a pass-through protocol; FDV is the honest numerator
            while supply unlocks
          </div>
          {gaps.length > 0 && (
            <div className="caption text-soft">
              waiting on {gaps.join(" and ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const protocolMultiplesFrame = defineFrame({
  ...protocolMultiplesMeta,
  component: ProtocolMultiples,
});
