import type {
  Capability,
  MarketDataProvider,
  OptionsExpiryStrikes,
  OptionsSummary,
  VolatilityPoint,
} from "@zframes/core";
import { TtlCache } from "@zframes/core/cache";
import { fetchJson } from "@zframes/core/fetch";

const API = "https://www.deribit.com/api/v2/public";

// Deribit's public market endpoints are keyless and CORS-open (every /public/*
// response echoes `access-control-allow-origin: <Origin>`), so fetches are
// unproxied. The book-summary call is ~400 KB / ~900 instruments, so it goes
// through the shared cache: short TTL just under the hook poll, in-flight dedup
// (so the put/call and OI-by-strike frames on one currency make ONE request),
// stale-on-error, and persist across reloads. One cache per logical source.
const summaryCache = new TtlCache<OptionsSummary>({
  namespace: "zframes:deribit:summary",
  ttlMs: 4 * 60_000,
  persist: true,
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
  mark_iv: number;
  underlying_price: number;
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
const INSTRUMENT_RE = /^[A-Z]+-(\d{1,2}[A-Z]{3}\d{2})-(\d+(?:\.\d+)?)-([CP])$/;

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

/**
 * Keyless Deribit options provider (no API key, CORS-open). Surfaces BTC/ETH
 * options-market signals: put/call ratio, open-interest by strike, and the DVOL
 * implied-volatility index. The put/call and OI-by-strike frames both read one
 * cached book-summary call per currency.
 */
export class DeribitProvider implements MarketDataProvider {
  readonly name = "deribit";
  readonly capabilities: readonly Capability[] = [
    "options-summary",
    "volatility-index",
  ];

  async getOptionsSummary(currency: string): Promise<OptionsSummary> {
    const ccy = currency.toUpperCase();
    return summaryCache.get(ccy, async () => {
      const body = await fetchJson<JsonRpc<BookSummaryRow[]>>(
        `${API}/get_book_summary_by_currency?currency=${ccy}&kind=option`,
      );
      const rows = body?.result;
      if (!Array.isArray(rows) || rows.length === 0)
        throw new Error("deribit options: unexpected response shape");

      let callOi = 0;
      let putOi = 0;
      let callVolume = 0;
      let putVolume = 0;
      let ivWeighted = 0;
      let ivWeight = 0;
      let underlyingPrice = 0;
      // expiry -> strike -> { callOi, putOi }
      const byExpiry = new Map<
        string,
        Map<number, { callOi: number; putOi: number }>
      >();

      for (const row of rows) {
        const parsed = INSTRUMENT_RE.exec(row.instrument_name);
        if (!parsed) continue;
        const [, expiry, strikeStr, type] = parsed;
        const strike = Number(strikeStr);
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
        if (isCall) cell.callOi += oi;
        else cell.putOi += oi;
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
        const strikeMap = byExpiry.get(chosen.expiry)!;
        nearestExpiry = {
          expiry: chosen.expiry,
          expiryMs: chosen.expiryMs,
          strikes: [...strikeMap.entries()]
            .map(([strike, oi]) => ({
              strike,
              callOi: oi.callOi,
              putOi: oi.putOi,
            }))
            .sort((a, b) => a.strike - b.strike),
        };
      }

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
        asOf: Date.now(),
      };
    });
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
