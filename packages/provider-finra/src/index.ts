import type {
  Capability,
  MarketDataProvider,
  ShortVolumeEntry,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchText } from "@zframes/data-primitives/fetch";

const DAILY_URL = (yyyymmdd: string) =>
  `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${yyyymmdd}.txt`;

/** How far back to look for the most recent published file (covers holidays + long weekends). */
const MAX_LOOKBACK_DAYS = 7;
/** Reuse a resolved report for this long — the file changes at most once a day. */
const CACHE_TTL_MS = 60 * 60_000;

interface ShortVolumeReport {
  date: string;
  bySymbol: Map<string, ShortVolumeEntry>;
}

// One report serves every requested symbol, so a single-slot cache (constant
// key) dedups concurrent loads, reuses the parsed file within the TTL, and
// serves the last good report on a transient error. Not persisted — the value
// holds a Map, which isn't JSON-serialisable (and the file lands once a day, so
// session-scoped caching is enough).
const reportCache = new TtlCache<ShortVolumeReport>({
  namespace: "zframes:finra:shortvol",
  ttlMs: CACHE_TTL_MS,
});

/** Strip a HIP-3 dex prefix to the bare ticker: "xyz:TSLA" → "TSLA". */
function tickerOf(symbol: string): string {
  const i = symbol.indexOf(":");
  return i === -1 ? symbol : symbol.slice(i + 1);
}

/** UTC YYYYMMDD; the loader walks back day-by-day, so timezone skew is harmless. */
function yyyymmdd(date: Date): string {
  return (
    `${date.getUTCFullYear()}` +
    `${String(date.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(date.getUTCDate()).padStart(2, "0")}`
  );
}

function parseReport(text: string): ShortVolumeReport {
  const lines = text.split(/\r?\n/);
  const bySymbol = new Map<string, ShortVolumeEntry>();
  let isoDate = "";
  // Line 0 is the header (Date|Symbol|ShortVolume|...); trailing lines may be a
  // footer/blank — the field-count + finite-number guards drop those.
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split("|");
    if (fields.length < 5) continue;
    const [rawDate, symbol, short, shortExempt, total] = fields;
    if (!symbol) continue;
    const shortVolume = Number(short);
    const totalVolume = Number(total);
    if (!Number.isFinite(shortVolume) || !Number.isFinite(totalVolume))
      continue;
    if (!isoDate && /^\d{8}$/.test(rawDate)) {
      isoDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    }
    bySymbol.set(symbol.toUpperCase(), {
      date: isoDate || rawDate,
      symbol,
      shortVolume,
      shortExemptVolume: Number(shortExempt) || 0,
      totalVolume,
      shortPct: totalVolume > 0 ? (shortVolume / totalVolume) * 100 : 0,
    });
  }
  if (bySymbol.size === 0)
    throw new Error("finra: empty or unparseable short-volume file");
  return { date: isoDate, bySymbol };
}

/**
 * Free, no-API-key provider for FINRA's daily consolidated short-sale volume
 * file (`cdn.finra.org/equity/regsho/daily`). cdn.finra.org sends no CORS
 * headers, so browser fetches are relayed through the runtime's same-origin
 * proxy (`cdn.finra.org` is allowlisted in core/serve.ts); in Node the fetch
 * is direct. Exposes the `short-volume` capability.
 *
 * The published file is *reported short volume* — daily sell-side short flow,
 * including market-maker hedging — NOT short interest. Frames must label it as
 * such. The file lands the next business day, so the loader walks back from
 * today to the most recent available date and caches the parsed result.
 */
export class FinraProvider implements MarketDataProvider {
  readonly name = "finra";
  readonly capabilities: readonly Capability[] = ["short-volume"];

  async getShortVolume(
    symbols: string[],
  ): Promise<Record<string, ShortVolumeEntry>> {
    const report = await this.loadReport();
    const out: Record<string, ShortVolumeEntry> = {};
    for (const symbol of symbols) {
      const entry = report.bySymbol.get(tickerOf(symbol).toUpperCase());
      if (entry) out[symbol] = entry; // keyed by the originally requested symbol
    }
    return out;
  }

  private loadReport(): Promise<ShortVolumeReport> {
    return reportCache.get("latest", () => this.fetchLatest());
  }

  private async fetchLatest(): Promise<ShortVolumeReport> {
    const base = Date.now();
    for (let i = 0; i <= MAX_LOOKBACK_DAYS; i++) {
      const day = new Date(base - i * 86_400_000);
      try {
        return parseReport(
          await fetchText(DAILY_URL(yyyymmdd(day)), {
            proxied: true,
            timeoutMs: 15_000,
          }),
        );
      } catch {
        // 403/404 until the day's file publishes, or a holiday gap — step back.
      }
    }
    throw new Error("finra: no recent short-volume file found");
  }
}
