import type { MetalHistory, SeriesPoint } from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";
import { METALS, num } from "./universe";

/**
 * The LBMA fix-file loading: daily London benchmark prices in USD/GBP/EUR,
 * gold and silver back to 1968 — the deepest keyless price history in the
 * fleet. index.ts reads it through `historyFor` and, for the spot change
 * column, `lastFix`/`FIX_WARMUP_MS`.
 */

const LBMA_URL = "https://prices.lbma.org.uk/json";

/** The LBMA publishes each fix in three currencies, in this column order. */
export const LBMA_CURRENCIES = ["USD", "GBP", "EUR"] as const;

// The LBMA fix files are the full history in one document (~150 KB gzipped for
// gold), and the fix publishes twice a business day — so the TTL is long and,
// unlike every small provider payload, this one is NOT persisted: several
// decades of daily points per metal would blow the localStorage budget for
// every other cache. One download per metal per 6h serves every metals frame on
// the board through the shared in-memory entry.
const historyCache = new TtlCache<MetalHistory[]>({
  namespace: "zframes:metals:history",
  ttlMs: 6 * 60 * 60_000,
  persist: false,
});

// Latest LBMA USD fix per symbol, filled as histories resolve. getMetalSpot
// reads it to attach a change-vs-fix (see getMetalSpot).
export const lastFix = new Map<string, number>();

/**
 * How long a cold `getMetalSpot` waits for the fix history before answering
 * without a change column. The LBMA file lands in ~1.5s; past this the price
 * is worth more than the delta, and the download completes into the shared
 * cache regardless, so the next poll fills the column in.
 */
export const FIX_WARMUP_MS = 3_000;

/** One LBMA fix row: `d` the date, `v` the price in [USD, GBP, EUR]. */
interface LbmaRow {
  d?: string;
  v?: (number | null)[];
}

/** Fetch and parse one metal's whole LBMA fix history for one currency. */
async function loadLbma(
  symbol: string,
  file: string,
  currency: string,
): Promise<MetalHistory> {
  const column = LBMA_CURRENCIES.indexOf(
    currency as (typeof LBMA_CURRENCIES)[number],
  );
  const rows = await fetchJson<LbmaRow[]>(
    `${LBMA_URL}/${file}.json`,
    undefined,
    {
      // Decades of daily fixes in one document — well past the shared default.
      timeoutMs: 30_000,
    },
  );
  if (!Array.isArray(rows)) throw new Error(`lbma ${file}: unexpected shape`);
  const points: SeriesPoint[] = [];
  for (const row of rows) {
    const value = num(row?.v?.[column]);
    // Pre-1999 rows carry a null EUR column, and the odd row is blank; both are
    // simply absent from the series rather than rendering as a zero.
    if (!row?.d || value === null || value <= 0) continue;
    const time = Date.parse(`${row.d}T00:00:00Z`);
    if (!Number.isFinite(time)) continue;
    points.push({ time, value });
  }
  if (points.length === 0) throw new Error(`lbma ${file}: no usable rows`);
  points.sort((a, b) => a.time - b.time);
  // USD is the fix the spot change is measured against; remember the newest.
  if (currency === "USD") lastFix.set(symbol, points[points.length - 1].value);
  return { symbol, currency, points };
}

/** One cache entry per (symbol, currency) so boards in EUR don't evict the USD board. */
export function historyFor(
  symbol: string,
  currency: string,
): Promise<MetalHistory> {
  const def = METALS[symbol];
  if (!def?.lbma)
    return Promise.reject(new Error(`no LBMA fix published for ${symbol}`));
  const file = def.lbma;
  return historyCache
    .get(`${symbol}:${currency}`, async () => [
      await loadLbma(symbol, file, currency),
    ])
    .then(([history]) => history);
}
