import type {
  Capability,
  MarketDataProvider,
  OptionContract,
  OptionsChain,
  OptionsExpiryStrikes,
  OptionsStrikeOi,
  OptionsSummary,
  VolatilityPoint,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const API = "https://www.deribit.com/api/v2/public";

const BOOK_TTL_MS = 4 * 60_000;

// Deribit's public market endpoints are keyless and CORS-open (every /public/*
// response echoes `access-control-allow-origin: <Origin>`), so fetches are
// unproxied.
//
// Both derived shapes — the aggregate summary and the per-contract chain — come
// out of the SAME book-summary response, so the raw rows are cached in their own
// layer and each shape caches its derivation on top. A board with a put/call
// card and a chain card on one book therefore makes ONE request, not two: the
// row cache's in-flight dedup collapses their concurrent first loads, and the
// TTL keeps later polls sharing it. Deliberately NOT persisted, unlike the
// derived shapes — the raw BTC book is ~360 KB and the combined USDC book
// ~1.3 MB, which has no business claiming that much of the ~5 MB origin quota
// every provider's cache shares. The TTL matches the tightest consumer (the
// summary) so a derived refresh past it re-reads the venue instead of
// re-deriving stale rows, and `maxEntries` is 3 because the key space IS 3 —
// the BTC book, the ETH book, and the one combined USDC book.
const bookCache = new TtlCache<BookSummaryRow[]>({
  namespace: "zframes:deribit:book",
  ttlMs: BOOK_TTL_MS,
  maxEntries: 3,
});
const summaryCache = new TtlCache<OptionsSummary>({
  namespace: "zframes:deribit:summary",
  ttlMs: BOOK_TTL_MS,
  persist: true,
});
// Keyed by underlying symbol rather than by book, since the combined USDC book
// yields a different chain per base currency. TTL sits just under
// `useOptionsChain`'s 5-minute poll so background polls still refresh while a
// reload or a second chain card reuses the entry. Not persisted: one BTC chain
// serialises to ~150 KB (834 contracts), so the seven listed underlyings would
// claim ~1 MB of shared quota to save a single 360 KB fetch — the derived
// summary persists because it is an aggregate a couple of orders smaller.
const chainCache = new TtlCache<OptionsChain>({
  namespace: "zframes:deribit:chain",
  ttlMs: 4.5 * 60_000,
  maxEntries: 8,
});
const dvolCache = new TtlCache<VolatilityPoint[]>({
  namespace: "zframes:deribit:dvol",
  ttlMs: 9 * 60_000,
  persist: true,
});

interface JsonRpc<T> {
  result: T;
}

interface BookSummaryRow {
  instrument_name: string;
  open_interest: number;
  volume: number;
  /** Mark IV in **percent** (65.75 = 65.75%), not a decimal. */
  mark_iv: number;
  /** Forward price of the underlying index for THIS row's expiry — it differs
   *  per expiry (26 distinct values across one BTC book), so it is a term
   *  structure, not the spot price. `estimated_delivery_price` is the spot index. */
  underlying_price: number;
  /** Spot index price; verified equal to /public/ticker's `index_price`. */
  estimated_delivery_price: number;
  /** Base currency of the instrument — how a linear underlying is identified in
   *  the combined USDC book (`SOL_USDC-…` rows carry "SOL"). */
  base_currency: string;
  // Quotes are null on an unquoted instrument (65 of 834 BTC rows had no bid,
  // 129 no last), so every price is optional on the way out.
  bid_price: number | null;
  ask_price: number | null;
  last: number | null;
}

interface DvolResult {
  /** [timestampMs, open, high, low, close] tuples. */
  data: [number, number, number, number, number][];
}

const MONTHS: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

// "BTC-31JUL26-69000-C" → { expiry: "31JUL26", expiryMs, strike: 69000, type: "C" }
// The prefix allows `_` and digits because the linear (USDC-quoted) instruments
// are named for their pair — "SOL_USDC-25SEP26-116-P".
const INSTRUMENT_RE =
  /^[A-Z0-9_]+-(\d{1,2}[A-Z]{3}\d{2})-(\d+(?:[d.]\d+)?)-([CP])$/;

/** Deribit writes a fractional strike with `d` where the decimal point goes —
 *  "TRX_USDC-28AUG26-0d41-C" is the 0.41 strike. It only shows up on sub-dollar
 *  underlyings, which is most of the linear book (778 of 2892 instruments), and
 *  a plain `Number()` on the raw segment turns every one of them into NaN. */
function parseStrike(raw: string): number {
  return Number(raw.replace("d", "."));
}

function parseExpiryMs(expiry: string): number {
  // DDMMMYY, settles 08:00 UTC.
  const m = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(expiry);
  if (!m) return Number.POSITIVE_INFINITY;
  const day = Number(m[1]);
  const month = MONTHS[m[2]];
  const year = 2000 + Number(m[3]);
  if (month === undefined) return Number.POSITIVE_INFINITY;
  return Date.UTC(year, month, day, 8, 0, 0);
}

/** Accumulator cell for one strike: running OI + the latest mark IV seen on
 *  each side (a strike typically has one call row and one put row in the
 *  book-summary response, so this is set once per side, not averaged). */
interface StrikeAccumulator {
  callOi: number;
  putOi: number;
  callIv?: number;
  putIv?: number;
}

/** Flatten one expiry's strike map into the ascending-by-strike array shape
 *  both `nearestExpiry` and `allExpiries` return. */
function toStrikes(
  strikeMap: Map<number, StrikeAccumulator>,
): OptionsStrikeOi[] {
  return [...strikeMap.entries()]
    .map(([strike, acc]) => ({
      strike,
      callOi: acc.callOi,
      putOi: acc.putOi,
      callIv: acc.callIv,
      putIv: acc.putIv,
    }))
    .sort((a, b) => a.strike - b.strike);
}

/** ISO calendar date for an expiry epoch. Expiries settle 08:00 UTC, so the UTC
 *  date is unambiguous — a local-time formatter would name the previous day west
 *  of Greenwich for anyone at UTC-9 or further. */
function toIsoDate(expiryMs: number): string {
  return new Date(expiryMs).toISOString().slice(0, 10);
}

/**
 * Deribit lists options two ways, and an underlying resolves to exactly one book:
 *  - BTC and ETH have **inverse** (coin-margined) books of their own, the deep
 *    canonical crypto options market — `currency=BTC` / `currency=ETH`.
 *  - every other underlying it lists is a **linear** USDC-quoted option, and all
 *    of them arrive in ONE combined `currency=USDC` book (BTC and ETH have
 *    linear listings too; their inverse books are deeper, so they win here).
 * `currency=SOL` is not an error — it answers HTTP 200 with an empty book, which
 * is why the linear route exists rather than a per-currency call per symbol.
 */
const INVERSE_BOOKS = new Set(["BTC", "ETH"]);
const LINEAR_BOOK = "USDC";

/** Scale a nullable quote into USD, dropping the field when the instrument has
 *  no quote at all (`bid_price`/`last` are null on an untraded strike). */
function toUsd(price: number | null, scale: number): number | undefined {
  return price === null || !Number.isFinite(price) ? undefined : price * scale;
}

/** One cached fetch of a `currency` book, shared by every shape derived from it. */
function fetchBook(currency: string): Promise<BookSummaryRow[]> {
  return bookCache.get(currency, async () => {
    const body = await fetchJson<JsonRpc<BookSummaryRow[]>>(
      `${API}/get_book_summary_by_currency?currency=${currency}&kind=option`,
    );
    const rows = body?.result;
    if (!Array.isArray(rows) || rows.length === 0)
      throw new Error("deribit options: unexpected response shape");
    return rows;
  });
}

/**
 * Keyless Deribit options provider (no API key, CORS-open). Surfaces BTC/ETH
 * options-market signals: put/call ratio, open-interest by strike, and the DVOL
 * implied-volatility index, plus the full per-contract chain for every
 * underlying the venue lists options on. The put/call, OI-by-strike and chain
 * frames all read one cached book-summary call per book.
 */
export class DeribitProvider implements MarketDataProvider {
  readonly name = "deribit";
  readonly capabilities: readonly Capability[] = [
    "options-summary",
    "options-chain",
    "volatility-index",
  ];

  async getOptionsSummary(currency: string): Promise<OptionsSummary> {
    const ccy = currency.toUpperCase();
    return summaryCache.get(ccy, async () => {
      const rows = await fetchBook(ccy);

      let callOi = 0;
      let putOi = 0;
      let callVolume = 0;
      let putVolume = 0;
      let ivWeighted = 0;
      let ivWeight = 0;
      let underlyingPrice = 0;
      // expiry -> strike -> { callOi, putOi, callIv?, putIv? }
      const byExpiry = new Map<string, Map<number, StrikeAccumulator>>();

      for (const row of rows) {
        const parsed = INSTRUMENT_RE.exec(row.instrument_name);
        if (!parsed) continue;
        const [, expiry, strikeStr, type] = parsed;
        const strike = parseStrike(strikeStr);
        const oi = row.open_interest ?? 0;
        const vol = row.volume ?? 0;
        const isCall = type === "C";
        if (isCall) {
          callOi += oi;
          callVolume += vol;
        } else {
          putOi += oi;
          putVolume += vol;
        }
        if (Number.isFinite(row.mark_iv) && oi > 0) {
          ivWeighted += row.mark_iv * oi;
          ivWeight += oi;
        }
        if (!underlyingPrice && Number.isFinite(row.underlying_price))
          underlyingPrice = row.underlying_price;

        let strikes = byExpiry.get(expiry);
        if (!strikes) {
          strikes = new Map();
          byExpiry.set(expiry, strikes);
        }
        let cell = strikes.get(strike);
        if (!cell) {
          cell = { callOi: 0, putOi: 0 };
          strikes.set(strike, cell);
        }
        const iv = Number.isFinite(row.mark_iv) ? row.mark_iv : undefined;
        if (isCall) {
          cell.callOi += oi;
          if (iv !== undefined) cell.callIv = iv;
        } else {
          cell.putOi += oi;
          if (iv !== undefined) cell.putIv = iv;
        }
      }

      // Nearest future expiry (fall back to the earliest overall if all past).
      const now = Date.now();
      const expiries = [...byExpiry.keys()].map((e) => ({
        expiry: e,
        expiryMs: parseExpiryMs(e),
      }));
      expiries.sort((a, b) => a.expiryMs - b.expiryMs);
      const chosen =
        expiries.find((e) => e.expiryMs > now) ?? expiries[0] ?? null;

      let nearestExpiry: OptionsExpiryStrikes = {
        expiry: chosen?.expiry ?? "",
        expiryMs: chosen?.expiryMs ?? 0,
        strikes: [],
      };
      if (chosen) {
        nearestExpiry = {
          expiry: chosen.expiry,
          expiryMs: chosen.expiryMs,
          strikes: toStrikes(byExpiry.get(chosen.expiry)!),
        };
      }

      // Every expiry present in the book, not just the nearest — lets frames
      // build a strike-vs-expiry ladder (e.g. an OI heatmap) or compare a
      // derived metric (e.g. max pain) across the term structure.
      const allExpiries: OptionsExpiryStrikes[] = expiries.map((e) => ({
        expiry: e.expiry,
        expiryMs: e.expiryMs,
        strikes: toStrikes(byExpiry.get(e.expiry)!),
      }));

      return {
        currency: ccy,
        underlyingPrice,
        putCallRatioOi: callOi > 0 ? putOi / callOi : 0,
        putCallRatioVolume: callVolume > 0 ? putVolume / callVolume : 0,
        callOi,
        putOi,
        callVolume,
        putVolume,
        avgIv: ivWeight > 0 ? ivWeighted / ivWeight : 0,
        nearestExpiry,
        allExpiries,
        asOf: Date.now(),
      };
    });
  }

  /**
   * Every listed contract on one underlying, flattened into the asset-class
   * agnostic chain shape so a table frame renders a crypto book and a listed
   * equity feed through the same columns.
   *
   * Deliberately greek-less: `get_book_summary_by_currency` publishes no greeks
   * (verified live — the row carries mark/bid/ask/last, IV, OI and volume only),
   * and the only public source for them is `/public/ticker`, ONE INSTRUMENT PER
   * CALL — 834 requests for a BTC chain. So delta/gamma/vega/theta/rho are left
   * undefined and a frame must degrade to the IV/OI columns. It will see chains
   * that do carry them (a listed-equity feed publishes greeks), which is exactly
   * why they are optional on {@link OptionContract} rather than required.
   *
   * `iv30` comes from DVOL, the venue's own 30-day forward IV index, which
   * exists for BTC and ETH only — a linear underlying leaves it undefined. See
   * {@link dvol30} for what the extra call actually costs.
   */
  async getOptionsChain(symbol: string): Promise<OptionsChain> {
    const sym = symbol.toUpperCase();
    return chainCache.get(sym, async () => {
      const inverse = INVERSE_BOOKS.has(sym);
      // In parallel, so the secondary index never adds latency to the chain.
      const [rows, iv30] = await Promise.all([
        fetchBook(inverse ? sym : LINEAR_BOOK),
        this.dvol30(sym),
      ]);
      // The inverse books hold one underlying each; the combined linear book
      // holds seven, so it is filtered down to the requested one.
      const mine = inverse ? rows : rows.filter((r) => r.base_currency === sym);
      // An underlying the venue lists no options on returns an EMPTY chain
      // rather than throwing: it is a permanent fact about the market, so the
      // frame should render its empty state, not an error card. Throwing is
      // reserved for a malformed response (see `fetchBook`), which is the case a
      // frame genuinely cannot recover from.
      if (mine.length === 0)
        return { symbol: sym, delayMinutes: 0, contracts: [] };

      const contracts: OptionContract[] = [];
      let underlyingPrice = 0;
      for (const row of mine) {
        const parsed = INSTRUMENT_RE.exec(row.instrument_name);
        if (!parsed) continue;
        const [, expiry, strikeStr, type] = parsed;
        const expiryMs = parseExpiryMs(expiry);
        if (!Number.isFinite(expiryMs)) continue;

        // Spot index — per row, but effectively constant across a book (two
        // values 0.26 apart on one BTC snapshot; the response is built row by
        // row). NOT `underlying_price`, which is the per-expiry FORWARD and
        // ranged 64,592 → 67,105 within that same payload.
        const index = row.estimated_delivery_price || row.underlying_price || 0;
        // ⚠️⚠️ THE UNIT TRAP ON THIS ENDPOINT. An inverse (coin-margined) book
        // quotes premiums in the BASE COIN, not dollars — `quote_currency` is
        // "BTC" and a real row had bid_price 0.642 against a 64,748 spot, i.e.
        // 0.642 BTC ≈ $41,500, NOT $0.64. `OptionContract`'s prices are USD and
        // sit beside a USD strike, so every coin premium is multiplied by the
        // index here. Shipping them unscaled renders a $41k option as "$0.64" —
        // plausible-looking and completely wrong, which is why this scaling is
        // pinned by a test. The index is the multiplier (spot value of the coin
        // received today), not the expiry's forward; it is self-consistent
        // either way to ~0.2%, and mark × index reproduces a deep-ITM
        // contract's intrinsic value. The LINEAR book already quotes in USDC,
        // so it scales by 1.
        const scale = inverse ? index : 1;

        contracts.push({
          contract: row.instrument_name,
          expiry: toIsoDate(expiryMs),
          strike: parseStrike(strikeStr),
          side: type === "C" ? "call" : "put",
          // ⚠️ `mark_iv` is the venue's PERCENT (65.75); OptionContract.iv is a
          // DECIMAL. The aggregate summary above carries the unscaled percent on
          // purpose (see the spec doc comment), so the two must not be mixed.
          iv: Number.isFinite(row.mark_iv) ? row.mark_iv / 100 : undefined,
          // Passed through in the venue's own units, which are NOT contracts as
          // an equity feed counts them: `get_instruments` reports
          // `contract_size: 1.0`, so one contract is one unit of the base asset
          // and these are BTC (or SOL, TRX, …) — fractional, not 100-share lots.
          openInterest: row.open_interest ?? 0,
          volume: row.volume ?? 0,
          bid: toUsd(row.bid_price, scale),
          ask: toUsd(row.ask_price, scale),
          lastPrice: toUsd(row.last, scale),
        });
        if (!underlyingPrice && index > 0) underlyingPrice = index;
      }

      if (contracts.length === 0)
        throw new Error("deribit options-chain: unexpected instrument naming");

      // Sorted so a table frame keeps its row order between polls. ISO dates
      // sort chronologically as strings, so no re-derived timestamps here.
      contracts.sort(
        (a, b) =>
          a.expiry.localeCompare(b.expiry) ||
          a.strike - b.strike ||
          a.side.localeCompare(b.side),
      );

      return {
        symbol: sym,
        underlyingPrice: underlyingPrice || undefined,
        iv30,
        // The public book summary is real time: row timestamps trail the request
        // by ~0.4 s, which is the round trip itself.
        delayMinutes: 0,
        contracts,
      };
    });
  }

  /**
   * DVOL as the chain's `iv30` — the venue's own 30-day forward implied-vol
   * index, published in PERCENT (38.7), so it is scaled to the decimal `iv30`
   * contract like every other IV on the chain.
   *
   * It reuses `getVolatilityIndex`, so a DVOL card already on the board can
   * share the entry — but only if the keys match, and that cache keys on the
   * window (`ccy:resolution:start`). So the start is quantised to the hour here:
   * repeated chain refreshes reuse ONE key instead of minting a fresh one per
   * poll (the drifting-key failure the cache's `maxEntries` doc describes). The
   * honest cost is therefore not zero — about one extra 7 KB call per DVOL TTL
   * per currency, not one per chain poll, and none at all for an underlying with
   * no DVOL (it exists for BTC/ETH only).
   *
   * Never fails the chain: DVOL is a secondary header stat, and a table of 834
   * live contracts must not blank out because an index series was unreachable.
   */
  private async dvol30(symbol: string): Promise<number | undefined> {
    if (!INVERSE_BOOKS.has(symbol)) return undefined;
    const hour = 3600;
    const start =
      Math.floor(Date.now() / (hour * 1000)) * hour * 1000 - 6 * hour * 1000;
    try {
      const series = await this.getVolatilityIndex(symbol, start, hour);
      const last = series.at(-1)?.value;
      return last !== undefined && Number.isFinite(last)
        ? last / 100
        : undefined;
    } catch {
      return undefined;
    }
  }

  async getVolatilityIndex(
    currency: string,
    startTimeMs: number,
    resolutionSec: number,
  ): Promise<VolatilityPoint[]> {
    const ccy = currency.toUpperCase();
    // Key on every input that shapes the response — including the window start,
    // not just the resolution. The caller quantizes startTimeMs to the
    // resolution so keys reuse across remounts rather than churning the
    // (eviction-less) entry map. See providers/log-2026-06-29.
    return dvolCache.get(`${ccy}:${resolutionSec}:${startTimeMs}`, async () => {
      const body = await fetchJson<JsonRpc<DvolResult>>(
        `${API}/get_volatility_index_data?currency=${ccy}` +
          `&start_timestamp=${startTimeMs}&end_timestamp=${Date.now()}` +
          `&resolution=${resolutionSec}`,
      );
      const data = body?.result?.data;
      if (!Array.isArray(data))
        throw new Error("deribit dvol: unexpected response shape");
      return data
        .map((t) => ({ time: t[0], value: t[4] }))
        .sort((a, b) => a.time - b.time);
    });
  }
}
