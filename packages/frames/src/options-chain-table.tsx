import {
  defineFrame,
  formatAmount,
  useMoney,
  useOptionsChain,
  type Money,
} from "@zframes/core";
import type { OptionContract } from "@zframes/spec";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatCompact, formatPct } from "./format";
import { optionsChainTableMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus, scrollAreaClass, scrollAreaXClass } from "./ui";

const schema = optionsChainTableMeta.schema;

/** The greeks a feed may publish. */
type Greek = "delta" | "gamma" | "vega" | "theta" | "rho";

/** Column heads for the greek columns. The letters are what a chain
 *  conventionally prints, and the words wouldn't fit these track widths. */
const GREEK_LABEL: Record<Greek, string> = {
  delta: "Δ",
  gamma: "Γ",
  vega: "ν",
  theta: "Θ",
  rho: "ρ",
};

/** A quote the feed doesn't publish. Absence renders as this and NEVER as 0: a
 *  zero bid is a real, different statement — someone quoting nothing — and on a
 *  live crypto chain it happens on far fewer rows than the missing quotes do. */
const DASH = "—";

/** How many expiries the on-card chip row offers before it stops; a listed
 *  equity chain runs to dozens, and `expiry` in config reaches any of them. */
const MAX_EXPIRY_CHIPS = 8;

/** Track widths per side, outermost first: volume, OI, IV, bid, ask. The put
 *  side mirrors it (bid, ask, IV, OI, volume) so both books read outward from
 *  the strike, which is how a chain is conventionally laid out. */
const SIDE_TRACKS = ["2.5rem", "2.5rem", "2.75rem", "2.75rem", "2.75rem"];

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

/** "2026-08-28" → "28AUG26", the OCC/Deribit spelling. A dozen ISO dates never
 *  fit a chip row; this does, and it's the form the contract ids already use. */
function expiryLabel(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}${MONTHS[Number(month) - 1] ?? month}${year.slice(2)}`;
}

/** A money cell with no per-cell currency symbol — the card states its currency
 *  once (the underlying price carries the symbol, the footer names the code), and
 *  a `$` on every one of ~150 numerals is noise. Still converted through the
 *  card's rate like any other price; `money.magnitude` is the usual symbol-less
 *  form but rounds, and it would print a 220.50 strike as "221". */
function moneyCell(money: Money, usd: number | undefined): string {
  return usd === undefined
    ? DASH
    : formatAmount(money.convert(usd), money.code);
}

/** IV on the chain shape is a DECIMAL (0.42 = 42%) — unlike the venue percent the
 *  aggregate options-summary carries, which is why these two shapes must never
 *  share an axis. A 0 upstream means "no quote", so it reads as absent rather
 *  than as an option priced at zero volatility. */
function ivCell(iv: number | undefined): string {
  return iv === undefined || iv <= 0 ? DASH : formatPct(iv * 100, 1);
}

/** Contract counts (OI, volume) are not money. A crypto venue counts them in the
 *  BASE COIN, so a row legitimately holds 0.4 contracts, and `formatCompact`
 *  rounds anything under 1K to whole units — which would print that as "0", i.e.
 *  no interest at all. Equity feeds count whole lots and are unaffected. */
function countCell(value: number | undefined): string {
  if (value === undefined) return DASH;
  if (value > 0 && value < 1) return value.toFixed(2);
  return formatCompact(value);
}

/** Greeks are unit-less and differ in scale: gamma at 2dp is "0.00" for most
 *  equity rows, while delta/vega/theta/rho read fine there. */
function greekCell(greek: Greek, value: number | undefined): string {
  if (value === undefined) return DASH;
  return value.toFixed(greek === "gamma" ? 4 : 2);
}

const CELL =
  "caption text-normal truncate py-[0.15rem] text-right tabular-nums";
const HEAD = "caption text-disabled truncate pb-1 text-right uppercase";

function OptionsChainTable({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const { data: chain, isLoading } = useOptionsChain(
    config.symbol,
    config.source,
  );
  // The expiry is a config field a card can flip in place, so the chip row
  // persists into dashboard.json instead of resetting on every reload.
  const [expiryChoice, chooseExpiry] = useFrameChoice("expiry", config.expiry);

  const view = useMemo(() => {
    if (!chain || chain.contracts.length === 0) return null;
    // ISO dates sort chronologically as strings, so [0] is the nearest expiry.
    const expiries = [...new Set(chain.contracts.map((c) => c.expiry))].sort();
    // An expiry left over from another symbol (or one that has since expired)
    // falls back to the nearest rather than emptying the card.
    const expiry = expiries.includes(expiryChoice) ? expiryChoice : expiries[0];

    const byStrike = new Map<
      number,
      { call?: OptionContract; put?: OptionContract }
    >();
    for (const contract of chain.contracts) {
      if (contract.expiry !== expiry) continue;
      const row = byStrike.get(contract.strike) ?? {};
      row[contract.side] = contract;
      byStrike.set(contract.strike, row);
    }
    const strikes = [...byStrike.keys()].sort((a, b) => a - b);
    if (strikes.length === 0) return null;

    // A chain is hundreds to thousands of contracts (7,614 on a real ETF), so the
    // card never renders one: it takes ONE expiry and windows it to the strikes
    // nearest the money, where the liquidity and the decision both are. Wider
    // windows and other expiries are a config field away, and the footer says
    // how much of the ladder is off-screen so the clamp is never invisible.
    const anchor =
      chain.underlyingPrice ?? strikes[Math.floor(strikes.length / 2)];
    const near = strikes
      .slice()
      .sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))
      .slice(0, config.strikes)
      .sort((a, b) => a - b);

    // Greeks are a property of the FEED, not of this frame: a crypto book
    // summary publishes none, a delayed exchange feed publishes all five. An
    // empty Δ/Γ grid would read as data that failed to load rather than as a feed
    // that has no such thing, so a requested column survives only if some
    // contract actually carries it — per greek, since a feed may publish delta
    // without rho.
    const greeks = config.greeks.filter((greek) =>
      chain.contracts.some((contract) => contract[greek] !== undefined),
    );

    // Only meaningful against a real underlying price; without one there is no
    // "the money" to mark, and the middle strike is just the middle strike.
    const atm =
      chain.underlyingPrice === undefined
        ? null
        : near.reduce(
            (best, strike) =>
              Math.abs(strike - anchor) < Math.abs(best - anchor)
                ? strike
                : best,
            near[0],
          );

    return {
      expiries,
      expiry,
      greeks,
      atm,
      strikeCount: strikes.length,
      rows: near.map((strike) => ({ strike, ...byStrike.get(strike) })),
    };
  }, [chain, config.strikes, config.greeks, expiryChoice]);

  if (isLoading && !chain)
    return <FrameStatus loading>loading option chain…</FrameStatus>;
  if (!chain)
    return (
      <FrameStatus>
        no option chain for {config.symbol.toUpperCase() || "—"}
      </FrameStatus>
    );
  // An underlying with no listed options is a permanent fact about the market
  // (only BTC and ETH have crypto option books at all), not an outage — so it
  // says so, instead of reading as a feed that failed.
  if (!view)
    return (
      <FrameStatus>
        {chain.symbol} has no listed options on this feed
      </FrameStatus>
    );

  const { expiries, expiry, greeks, atm, strikeCount, rows } = view;
  const sideSpan = greeks.length + SIDE_TRACKS.length;
  const greekTracks = greeks.map(() => "2.25rem");
  // Each quote/greek column is a floor width that may grow; the strike column in
  // the middle is its own track and is NOT wrapped again.
  //
  // ⚠️ `minmax()` DOES NOT NEST. Wrapping an already-built `minmax(3.5rem, auto)`
  // in another `minmax(…, 1fr)` is invalid CSS, and an invalid track list makes
  // the browser drop the WHOLE `grid-template-columns` declaration — so the grid
  // silently falls back to one implicit column and every cell stacks vertically.
  // It looks like a data outage rather than a CSS error, which is why it survived
  // a passing render test.
  const track = (width: string) => `minmax(${width}, 1fr)`;
  const template = [
    ...greekTracks.map(track),
    ...SIDE_TRACKS.map(track),
    "minmax(3.5rem, auto)",
    ...[...SIDE_TRACKS].reverse().map(track),
    ...greekTracks.map(track),
  ].join(" ");
  const gridStyle = { gridTemplateColumns: template };

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="caption text-soft truncate uppercase">
            {chain.symbol} chain
          </div>
          <div className="metric-sm text-strong">
            {chain.underlyingPrice === undefined
              ? DASH
              : money.price(chain.underlyingPrice)}
          </div>
        </div>
        <div className="flex shrink-0 items-baseline gap-2.5">
          {chain.iv30 !== undefined && (
            <div className="text-right">
              <div className="caption text-soft uppercase">iv30</div>
              <div className="body-sm text-normal tabular-nums">
                {formatPct(chain.iv30 * 100, 1)}
              </div>
            </div>
          )}
          {/* The delay is a hazard, not a footnote: a 15-minute-old chain read as
              live is a real way to lose money, so it sits in the header at every
              size and only says "live" when the feed genuinely is. */}
          <span
            className={`caption rounded border px-1.5 py-0.5 ${
              chain.delayMinutes > 0
                ? "text-highlight border-[var(--color-accent-line)]"
                : "text-soft border-white/[0.08]"
            }`}
          >
            {chain.delayMinutes > 0 ? `${chain.delayMinutes}m delayed` : "live"}
          </span>
        </div>
      </div>

      <div className={`${scrollAreaXClass} flex shrink-0 items-center gap-2`}>
        <TimeframeToggle
          label="expiry"
          options={expiries.slice(0, MAX_EXPIRY_CHIPS).map(expiryLabel)}
          value={expiryLabel(expiry)}
          onChange={(label) => {
            const iso = expiries.find((one) => expiryLabel(one) === label);
            if (iso) chooseExpiry(iso);
          }}
        />
        {expiries.length > MAX_EXPIRY_CHIPS && (
          <span className="caption text-disabled shrink-0">
            +{expiries.length - MAX_EXPIRY_CHIPS}
          </span>
        )}
      </div>

      {/* One scroll box for the whole ladder, so the column heads stay in step
          with the columns when a greek-carrying chain overflows sideways. */}
      <div className={`${scrollAreaClass} ${scrollAreaXClass} flex flex-col`}>
        <div className="grid" style={gridStyle}>
          <span
            className="caption uppercase"
            style={{ gridColumn: `span ${sideSpan}`, color: UP_COLOR }}
          >
            calls
          </span>
          <span className="caption text-disabled text-center uppercase">
            strike
          </span>
          <span
            className="caption text-right uppercase"
            style={{ gridColumn: `span ${sideSpan}`, color: DOWN_COLOR }}
          >
            puts
          </span>
        </div>

        <div className="grid border-b border-white/[0.08]" style={gridStyle}>
          {greeks.map((greek) => (
            <span key={`c-${greek}`} className={HEAD} title={greek}>
              {GREEK_LABEL[greek]}
            </span>
          ))}
          <span className={HEAD}>vol</span>
          <span className={HEAD}>oi</span>
          <span className={HEAD}>iv</span>
          <span className={HEAD}>bid</span>
          <span className={HEAD}>ask</span>
          <span className={`${HEAD} text-center`}>{money.code}</span>
          <span className={HEAD}>bid</span>
          <span className={HEAD}>ask</span>
          <span className={HEAD}>iv</span>
          <span className={HEAD}>oi</span>
          <span className={HEAD}>vol</span>
          {[...greeks].reverse().map((greek) => (
            <span key={`p-${greek}`} className={HEAD} title={greek}>
              {GREEK_LABEL[greek]}
            </span>
          ))}
        </div>

        {rows.map(({ strike, call, put }) => (
          <div
            key={strike}
            className={`grid items-baseline ${
              strike === atm ? "bg-white/[0.05]" : ""
            }`}
            style={gridStyle}
          >
            {greeks.map((greek) => (
              <span key={`c-${greek}`} className={CELL}>
                {greekCell(greek, call?.[greek])}
              </span>
            ))}
            <span className={CELL}>{countCell(call?.volume)}</span>
            <span className={CELL}>{countCell(call?.openInterest)}</span>
            <span className={CELL}>{ivCell(call?.iv)}</span>
            <span className={CELL}>{moneyCell(money, call?.bid)}</span>
            <span className={CELL}>{moneyCell(money, call?.ask)}</span>
            <span
              className={`caption text-strong truncate py-[0.15rem] text-center font-bold tabular-nums`}
            >
              {moneyCell(money, strike)}
            </span>
            <span className={CELL}>{moneyCell(money, put?.bid)}</span>
            <span className={CELL}>{moneyCell(money, put?.ask)}</span>
            <span className={CELL}>{ivCell(put?.iv)}</span>
            <span className={CELL}>{countCell(put?.openInterest)}</span>
            <span className={CELL}>{countCell(put?.volume)}</span>
            {[...greeks].reverse().map((greek) => (
              <span key={`p-${greek}`} className={CELL}>
                {greekCell(greek, put?.[greek])}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="caption text-soft flex shrink-0 justify-between gap-2">
        <span className="truncate">
          {rows.length} of {strikeCount} strikes · {expiry}
        </span>
        <span className="shrink-0">
          {greeks.length === 0
            ? "this feed publishes no greeks"
            : `${chain.contracts.length} contracts listed`}
        </span>
      </div>
    </div>
  );
}

export const optionsChainTableFrame = defineFrame({
  ...optionsChainTableMeta,
  component: OptionsChainTable,
});
