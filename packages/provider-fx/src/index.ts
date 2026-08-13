import type {
  Capability,
  DollarIndex,
  FxRate,
  MarketDataProvider,
  SeriesPoint,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import {
  loadFromChain,
  loadSpot,
  sourceLabel,
  type FxSourceId,
  type RateTable,
} from "./sources";

export type { FxSourceId, RateTable } from "./sources";
export { FX_SOURCES } from "./sources";

// ICE US Dollar Index: a fixed-weight geometric mean of six USD pairs. With
// every source normalised to "currency per USD" (base=USD), each pair's signed
// exponent collapses to a positive power of that per-USD rate:
//   DXY = 50.14348112 · EUR^0.576 · JPY^0.136 · GBP^0.119 · CAD^0.091
//                     · SEK^0.042 · CHF^0.036
// (EURUSD^-0.576 = (1/EURperUSD)^-0.576 = EURperUSD^0.576, and likewise GBP.)
const DXY_CONSTANT = 50.14348112;
const DXY_WEIGHTS: Record<string, number> = {
  EUR: 0.576,
  JPY: 0.136,
  GBP: 0.119,
  CAD: 0.091,
  SEK: 0.042,
  CHF: 0.036,
};

// The fiat sources are ECB-cadence: rates publish once per business day
// (~16:00 CET). One short timeseries request returns the whole window we need —
// latest rate, previous-day change, and a sparkline — so the shared cache keeps a
// TTL just under the hook's hourly poll, dedups concurrent loads across frames,
// persists across reloads, and serves the last good value on a transient error.
// Keyed by base+symbols+window so different boards don't collide. (The
// namespace was renamed from "zframes:fx", orphaning that persisted key set —
// acceptable, the cache is size-bounded.)
const ratesCache = new TtlCache<FxRateWithSource[]>({
  namespace: "zframes:fx:rates",
  ttlMs: 55 * 60_000,
  persist: true,
});

// Synthetic DXY shares that once-a-business-day cadence, so it gets its own
// cache at the same TTL, keyed by window.
const dxyCache = new TtlCache<DollarIndexWithSource>({
  namespace: "zframes:fx:dxy",
  ttlMs: 55 * 60_000,
  persist: true,
});

// The intraday overlay is opt-in and minute-level, so it gets a much shorter TTL
// than the daily series — short enough that an explicit refresh sees a new quote,
// long enough that several frames asking at once cost one request. Not persisted:
// a spot rehydrated from a previous session is by definition not spot.
const spotCache = new TtlCache<{ at: number; rates: Record<string, number> }>({
  namespace: "zframes:fx:spot",
  ttlMs: 5 * 60_000,
});

/**
 * Default history window. ECB skips weekends/holidays, so ~40 calendar days
 * comfortably yields 20+ business-day points for the change% + sparkline — which
 * is all the existing frames render, so it stays the default. Callers wanting
 * depth pass `windowDays` (FXRatesAPI and the ECB Data Portal both go back to
 * 1999; Frankfurter serves the full ECB history too).
 */
export const FX_DEFAULT_WINDOW_DAYS = 40;

/** Options accepted by both capability methods. */
export interface FxQueryOptions {
  /** Calendar days of history to request (default {@link FX_DEFAULT_WINDOW_DAYS}). */
  windowDays?: number;
  /**
   * Also attach FXRatesAPI's minute-level quote as `spot`/`spotAt`. Off by
   * default: it costs a second request, and `rate` intentionally stays the
   * published daily close so money conversion can't twitch between polls.
   */
  intraday?: boolean;
}

/**
 * `FxRate` plus which upstream answered — additive and optional, so every
 * existing consumer (`useFxRates`, `DashboardCurrencyProvider`, the six FX
 * frames) is untouched, while a frame or a log line can say where the number
 * came from and how fresh it is.
 */
export interface FxRateWithSource extends FxRate {
  source?: FxSourceId;
  /** Minute-level quote, only when the caller asked for `intraday`. */
  spot?: number;
  /** When `spot` was quoted (ms epoch). */
  spotAt?: number;
}

/** `DollarIndex` plus the answering upstream — additive and optional, as above. */
export interface DollarIndexWithSource extends DollarIndex {
  source?: FxSourceId;
}

/** A day's ISO date → the UTC-midnight timestamp the series is plotted at. */
function dayTime(day: string): number {
  // UTC midnight so a daily series can't drift a day in a non-UTC timezone.
  return new Date(`${day}T00:00:00Z`).getTime();
}

function changePctOf(history: SeriesPoint[]): number {
  if (history.length < 2) return 0;
  const latest = history[history.length - 1].value;
  const prev = history[history.length - 2].value;
  return prev > 0 ? ((latest - prev) / prev) * 100 : 0;
}

/**
 * Keyless FX provider. Frankfurter (the ECB's daily euro reference rates,
 * rebased to any currency) is the primary; FXRatesAPI, currency-api and the ECB
 * Data Portal back it up in that order via {@link loadFromChain}, all keyless and
 * CORS-open so none of them needs the runtime proxy.
 *
 * Being the repo's only fiat FX feed is why the chain exists: on a single-source
 * outage the display-currency layer has no rate to convert with and every card
 * silently reverts to quoting USD, which reads as wrong data rather than as a
 * failure. Each source normalises into one internal table, so callers see the
 * same `FxRate` shape whichever answered — only the additive `source` differs.
 */
export class FxProvider implements MarketDataProvider {
  readonly name = "fx";
  readonly capabilities: readonly Capability[] = ["fx-rates", "dollar-index"];

  async getFxRates(
    base: string,
    symbols: string[],
    opts: FxQueryOptions = {},
  ): Promise<FxRateWithSource[]> {
    const b = base.toUpperCase();
    // A currency can't be quoted against itself, and Frankfurter rejects it.
    const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))].filter(
      (s) => s && s !== b,
    );
    if (wanted.length === 0) return [];
    const windowDays = opts.windowDays ?? FX_DEFAULT_WINDOW_DAYS;
    const key = `${b}:${[...wanted].sort().join(",")}:${windowDays}`;
    const rows = await ratesCache.get(key, async () => {
      const { value } = await loadFromChain(
        { base: b, symbols: wanted, windowDays, purpose: "rates" },
        (table) => mapRates(table, b, wanted),
      );
      return value;
    });
    if (!opts.intraday) return rows;
    return withSpot(rows, b, wanted);
  }

  async getDollarIndex(
    opts: FxQueryOptions = {},
  ): Promise<DollarIndexWithSource> {
    const windowDays = opts.windowDays ?? FX_DEFAULT_WINDOW_DAYS;
    return dxyCache.get(`dxy:${windowDays}`, async () => {
      const { value } = await loadFromChain(
        {
          base: "USD",
          symbols: Object.keys(DXY_WEIGHTS),
          windowDays,
          purpose: "dxy",
        },
        mapDollarIndex,
      );
      return value;
    });
  }
}

/**
 * One normalised table → one `FxRate` per requested symbol, in the CALLER's
 * order. A symbol with no finite print in the window is dropped rather than
 * emitted with an empty history (which frames render as a blank row).
 */
function mapRates(
  table: RateTable,
  base: string,
  wanted: string[],
): FxRateWithSource[] {
  const days = Object.keys(table.rates).sort(); // ascending YYYY-MM-DD
  return wanted
    .map((symbol): FxRateWithSource | null => {
      const history: SeriesPoint[] = [];
      for (const day of days) {
        const value = table.rates[day]?.[symbol];
        if (typeof value === "number" && Number.isFinite(value))
          history.push({ time: dayTime(day), value });
      }
      if (history.length === 0) return null;
      return {
        symbol,
        base,
        rate: history[history.length - 1].value,
        changePct: changePctOf(history),
        history,
        source: table.source,
      };
    })
    .filter((rate): rate is FxRateWithSource => rate !== null);
}

/** One normalised table → the synthetic ICE dollar index. */
function mapDollarIndex(table: RateTable): DollarIndexWithSource {
  const symbols = Object.keys(DXY_WEIGHTS);
  const days = Object.keys(table.rates).sort(); // ascending YYYY-MM-DD
  const history: SeriesPoint[] = [];
  for (const day of days) {
    const rates = table.rates[day];
    // A DXY point needs all six constituents present and positive; a day short
    // of one is skipped, never synthesised from five legs.
    if (
      !rates ||
      !symbols.every(
        (s) =>
          typeof rates[s] === "number" &&
          Number.isFinite(rates[s]) &&
          rates[s] > 0,
      )
    )
      continue;
    let value = DXY_CONSTANT;
    for (const [currency, weight] of Object.entries(DXY_WEIGHTS))
      value *= Math.pow(rates[currency], weight);
    history.push({ time: dayTime(day), value });
  }
  // Thrown inside the chain attempt, so a source whose window has no complete
  // day falls through to the next one instead of blanking the frame.
  if (history.length === 0)
    throw new Error(
      `${sourceLabel(table.source, "dxy")}: no complete days in window`,
    );
  return {
    value: history[history.length - 1].value,
    changePct: changePctOf(history),
    history,
    source: table.source,
  };
}

/**
 * Attach the minute-level quote to each row, leaving `rate`/`history`/`changePct`
 * (the numbers money conversion reads) on the published daily close. Best-effort:
 * a failed or rate-limited spot call leaves the daily rows exactly as they were.
 */
async function withSpot(
  rows: FxRateWithSource[],
  base: string,
  wanted: string[],
): Promise<FxRateWithSource[]> {
  try {
    const spot = await spotCache.get(
      `${base}:${[...wanted].sort().join(",")}`,
      () => loadSpot(base, wanted),
    );
    return rows.map((row) =>
      typeof spot.rates[row.symbol] === "number"
        ? { ...row, spot: spot.rates[row.symbol], spotAt: spot.at }
        : row,
    );
  } catch {
    return rows;
  }
}
