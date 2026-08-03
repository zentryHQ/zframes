import { fetchJson } from "@zframes/data-primitives/fetch";

/**
 * The keyless FX upstreams, and the ordered fallback chain that tries them.
 *
 * `provider-fx` is the ONLY fiat FX feed in the repo: six frames read it, the
 * board-wide display-currency layer converts every `useMoney()` card off it, and
 * a non-USD venue provider normalises through it. A single upstream therefore
 * means a single point of failure — when Frankfurter 5xx'd, every non-USD board
 * silently fell back to quoting USD.
 *
 * So each upstream is wrapped in an adapter that normalises its wire format into
 * ONE internal shape ({@link RateTable}: ISO day → code → units per 1 base), and
 * {@link loadFromChain} tries them in order until one both parses AND maps into a
 * usable result. Callers see no difference between sources beyond an additive
 * `source` label.
 *
 * Deliberately React-free (this whole package is), and every request goes
 * through the shared `fetchJson` transport — all four hosts were verified
 * keyless AND CORS-open (`access-control-allow-origin: *`), so none of them needs
 * the runtime's `/__zframes/proxy` and the provider keeps working on a static host.
 */
export type FxSourceId = "frankfurter" | "fxratesapi" | "currency-api" | "ecb";

/**
 * The one internal shape every adapter normalises into — deliberately identical
 * to Frankfurter's timeseries body, since that stays the primary: `rates[day][CODE]`
 * is "units of CODE per 1 base" on that day. Days may be sparse (weekends,
 * holidays, per-currency gaps); the mapper sorts and filters.
 */
export interface RateTable {
  /** Which upstream answered — surfaced to callers as `FxRate.source`. */
  source: FxSourceId;
  /** ISO day (`YYYY-MM-DD`) → { CODE → units of CODE per 1 base }. */
  rates: Record<string, Record<string, number>>;
}

export interface RateRequest {
  /** Base currency, already upper-cased. */
  base: string;
  /** Quote currencies, already upper-cased, deduped, base removed. */
  symbols: string[];
  /** How many calendar days of history to ask for. */
  windowDays: number;
  /**
   * Which caller is asking. Only affects error labels: the DXY path has always
   * thrown `frankfurter dxy: …` and frames/tests read those messages.
   */
  purpose: "rates" | "dxy";
}

/** The label a source's errors carry, e.g. `frankfurter dxy`. */
export function sourceLabel(
  source: FxSourceId,
  purpose: RateRequest["purpose"],
) {
  return purpose === "dxy" ? `${source} dxy` : source;
}

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Keep only finite, positive numbers — a rate of 0 or NaN is not a rate. */
function usable(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

// ── Rate-limit cooldowns ────────────────────────────────────────────────────
// `fetchJson` has no retry/backoff (by design — it's the shared transport), so a
// 429 is handled here: the source is skipped for a cooldown window rather than
// re-asked on the next poll, and the chain falls through to the next upstream
// instead of throwing. FXRatesAPI is the one source that publishes a quota
// (`x-ratelimit-limit: 61`), but any host can start shedding load.
const RATE_LIMIT_COOLDOWN_MS = 10 * 60_000;
const cooldownUntil = new Map<FxSourceId, number>();

/** The HTTP status embedded in a `fetchJson` failure, if any. */
function statusOf(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = /failed: (\d{3})$/.exec(message);
  return match ? Number(match[1]) : null;
}

/** 429 (and 418, which some CDNs use for the same thing) means "back off". */
export function isRateLimited(error: unknown): boolean {
  const status = statusOf(error);
  return status === 429 || status === 418;
}

// ── Adapters ────────────────────────────────────────────────────────────────

interface FrankfurterTimeseries {
  base: string;
  start_date: string;
  end_date: string;
  /** date (YYYY-MM-DD) → { CURRENCY → rate }. */
  rates: Record<string, Record<string, number>>;
}

/**
 * PRIMARY. Frankfurter (api.frankfurter.dev) republishes the ECB's daily euro
 * reference rates rebased to any currency, keyless and CORS-open. One
 * open-ended timeseries request yields the whole window in the internal shape
 * already, so this adapter is a shape check and nothing more. Daily granularity,
 * published once per business day (~16:00 CET).
 */
async function loadFrankfurter(req: RateRequest): Promise<RateTable> {
  const url =
    `https://api.frankfurter.dev/v1/${isoDaysAgo(req.windowDays)}..` +
    `?base=${req.base}&symbols=${req.symbols.join(",")}`;
  const body = await fetchJson<FrankfurterTimeseries>(url);
  if (!body?.rates)
    throw new Error(
      `${sourceLabel("frankfurter", req.purpose)}: unexpected response shape`,
    );
  return { source: "frankfurter", rates: body.rates };
}

interface FxRatesApiTimeseries {
  success?: boolean;
  base: string;
  /** ISO *timestamp* (not date) → { CURRENCY → rate }, newest first. */
  rates: Record<string, Record<string, number>>;
}

/**
 * FALLBACK 1. FXRatesAPI — keyless, CORS-open, 185 codes, history to 1999, and
 * minute-level `latest` (see {@link loadSpot}). Two wire quirks: the timeseries
 * keys are full ISO timestamps (`2026-07-31T23:59:00.000Z`, so the day is the
 * first 10 chars) in DESCENDING order, and the envelope carries `success`.
 *
 * `success === true` is required rather than merely tolerated: it's what stops a
 * Frankfurter-shaped body (identical `{base, rates}` skeleton) from being
 * mistaken for this source's answer while a stub or a misrouted proxy is in play.
 *
 * A for-profit vendor, so it is never the sole path — if it key-gates someday the
 * chain simply carries on to the next source.
 */
async function loadFxRatesApi(req: RateRequest): Promise<RateTable> {
  const url =
    `https://api.fxratesapi.com/timeseries?start_date=${isoDaysAgo(req.windowDays)}` +
    `&end_date=${isoToday()}&base=${req.base}&currencies=${req.symbols.join(",")}`;
  const body = await fetchJson<FxRatesApiTimeseries>(url);
  if (body?.success !== true || !body.rates)
    throw new Error(
      `${sourceLabel("fxratesapi", req.purpose)}: unexpected response shape`,
    );
  const rates: Record<string, Record<string, number>> = {};
  // The feed is intraday, so one calendar day can carry several stamps — and it
  // serves them NEWEST FIRST, so "last one seen wins" would keep the earliest
  // print. Track the winning stamp per day and keep the latest one.
  const stampFor: Record<string, string> = {};
  for (const [stamp, day] of Object.entries(body.rates)) {
    if (!day || typeof day !== "object") continue;
    const date = stamp.slice(0, 10);
    if (stampFor[date] && stampFor[date] >= stamp) continue;
    stampFor[date] = stamp;
    rates[date] = day;
  }
  return { source: "fxratesapi", rates };
}

interface CurrencyApiLatest {
  /** The publication day, `YYYY-MM-DD`. */
  date: string;
  /** Keyed by the LOWER-CASE base code, e.g. `usd`, then lower-case quotes. */
  [base: string]: string | Record<string, number>;
}

/**
 * FALLBACK 2. currency-api (CC0, no rate limits, 339 codes). Latest-only: it
 * publishes one file per day per base, so this yields a SINGLE-day table — the
 * rate survives, the sparkline and change% degrade to one point / 0%. That is
 * the trade for a source with no quota at all.
 *
 * `latest.currency-api.pages.dev` on purpose, not the jsDelivr mirror: the CDN
 * copy is cached `max-age=604800` and was observed a full day stale.
 */
async function loadCurrencyApi(req: RateRequest): Promise<RateTable> {
  const base = req.base.toLowerCase();
  const url = `https://latest.currency-api.pages.dev/v1/currencies/${base}.json`;
  const body = await fetchJson<CurrencyApiLatest>(url);
  const table = body?.[base];
  if (!table || typeof table !== "object")
    throw new Error(
      `${sourceLabel("currency-api", req.purpose)}: unexpected response shape`,
    );
  const quotes = table as Record<string, number>;
  const day: Record<string, number> = {};
  for (const symbol of req.symbols) {
    const value = quotes[symbol.toLowerCase()];
    if (usable(value)) day[symbol] = value;
  }
  const date =
    typeof body.date === "string" && body.date.length >= 10
      ? body.date.slice(0, 10)
      : isoToday();
  return { source: "currency-api", rates: { [date]: day } };
}

interface SdmxJson {
  dataSets?: {
    series?: Record<
      string,
      { observations?: Record<string, (number | null)[]> }
    >;
  }[];
  structure?: {
    /** Current ECB Data Portal spells it `dimensions`; older SDMX-JSON, `dimension`. */
    dimensions?: SdmxDimensions;
    dimension?: SdmxDimensions;
  };
}

interface SdmxDimensions {
  series?: { id: string; values: { id: string }[] }[];
  observation?: { values: { id: string }[] }[];
}

/**
 * FALLBACK 3. The ECB Data Portal itself — Frankfurter's own upstream, so it is
 * last: reaching it means the convenience wrapper is down but the authoritative
 * source is up. Daily from 1999-01-04.
 *
 * Two things make it the fiddliest adapter:
 *
 *  - **SDMX-JSON is index-based, not key-based.** A series' `observations` are
 *    keyed by POSITION into `structure.dimensions.observation[0].values` (the
 *    union of days across all requested series), and the series key itself
 *    (`"0:1:0:0:0"`) is positions into the series dimensions — where CURRENCY's
 *    `values` come back ALPHABETICALLY, not in request order. Both must be read
 *    through the structure; hard-coding either mislabels every currency.
 *  - **It only quotes against the euro** (`D.<CODE>.EUR.SP00.A` is CODE per EUR).
 *    A non-EUR base is therefore a cross: the base's own EUR quote is requested
 *    alongside the symbols and each day divided through, and a day missing
 *    either leg is dropped rather than half-computed.
 */
async function loadEcb(req: RateRequest): Promise<RateTable> {
  const label = sourceLabel("ecb", req.purpose);
  // EUR needs no series of its own — it IS the denominator (1 EUR per EUR).
  const codes = [...new Set([...req.symbols, req.base])].filter(
    (c) => c !== "EUR",
  );
  if (codes.length === 0) throw new Error(`${label}: nothing to request`);
  const url =
    `https://data-api.ecb.europa.eu/service/data/EXR/D.${codes.join("+")}.EUR.SP00.A` +
    `?format=jsondata&startPeriod=${isoDaysAgo(req.windowDays)}`;
  const body = await fetchJson<SdmxJson>(url);

  const dims = body?.structure?.dimensions ?? body?.structure?.dimension;
  const series = body?.dataSets?.[0]?.series;
  const days = dims?.observation?.[0]?.values;
  if (!series || !dims?.series || !days)
    throw new Error(`${label}: unexpected response shape`);

  const currencyAt = dims.series.findIndex((d) => d.id === "CURRENCY");
  if (currencyAt < 0) throw new Error(`${label}: no CURRENCY dimension`);
  const currencies = dims.series[currencyAt].values;

  // day → code → units of code per 1 EUR
  const perEur: Record<string, Record<string, number>> = {};
  for (const [seriesKey, entry] of Object.entries(series)) {
    const code = currencies[Number(seriesKey.split(":")[currencyAt])]?.id;
    if (!code) continue;
    for (const [index, observation] of Object.entries(
      entry?.observations ?? {},
    )) {
      const day = days[Number(index)]?.id;
      const value = observation?.[0];
      if (!day || !usable(value)) continue;
      (perEur[day] ??= {})[code] = value;
    }
  }

  // Rebase: units of symbol per 1 base = (symbol per EUR) / (base per EUR).
  const rates: Record<string, Record<string, number>> = {};
  for (const [day, quotes] of Object.entries(perEur)) {
    const perBase = req.base === "EUR" ? 1 : quotes[req.base];
    if (!usable(perBase)) continue; // no cross leg → the whole day is unusable
    const row: Record<string, number> = {};
    for (const symbol of req.symbols) {
      const quote = symbol === "EUR" ? 1 : quotes[symbol];
      if (usable(quote)) row[symbol] = quote / perBase;
    }
    if (Object.keys(row).length > 0) rates[day] = row;
  }
  if (Object.keys(rates).length === 0)
    throw new Error(`${label}: no usable observations`);
  return { source: "ecb", rates };
}

/**
 * The chain, in order. Frankfurter stays first (it is what every existing frame
 * has been reading, at daily granularity, with the widest rebasing support);
 * the rest exist so a Frankfurter outage degrades the board's numbers rather
 * than silently reverting every card to USD.
 */
export const FX_SOURCES: readonly {
  id: FxSourceId;
  load: (req: RateRequest) => Promise<RateTable>;
}[] = [
  { id: "frankfurter", load: loadFrankfurter },
  { id: "fxratesapi", load: loadFxRatesApi },
  { id: "currency-api", load: loadCurrencyApi },
  { id: "ecb", load: loadEcb },
];

/**
 * Try each source in order until one both parses AND maps into a usable result,
 * and return that result plus the table it came from.
 *
 * `map` runs INSIDE the attempt on purpose: "the body parsed but carries nothing
 * this caller can use" (a DXY window with no complete day, say) is a failure of
 * that source, not of the request — so it falls through to the next upstream
 * instead of surfacing an error card while three working feeds go unasked.
 *
 * When everything fails the FIRST error is re-thrown, so the message a frame
 * shows still describes the primary rather than whichever fallback happened to
 * fail last. A rate-limited source is skipped for {@link RATE_LIMIT_COOLDOWN_MS}
 * so a 429 costs one request, not one per poll.
 */
export async function loadFromChain<T>(
  req: RateRequest,
  map: (table: RateTable) => T,
): Promise<{ value: T; table: RateTable }> {
  let firstError: unknown = null;
  let skipped = 0;
  for (const source of FX_SOURCES) {
    const until = cooldownUntil.get(source.id) ?? 0;
    if (Date.now() < until) {
      skipped += 1;
      continue;
    }
    try {
      const table = await source.load(req);
      return { value: map(table), table };
    } catch (error) {
      if (isRateLimited(error))
        cooldownUntil.set(source.id, Date.now() + RATE_LIMIT_COOLDOWN_MS);
      firstError ??= error;
    }
  }
  if (firstError) throw firstError;
  throw new Error(
    `fx: every source is rate-limited (${skipped} in cooldown), no rates available`,
  );
}

// ── Intraday spot ───────────────────────────────────────────────────────────

interface FxRatesApiLatest {
  success?: boolean;
  /** Minute-level: the response's own `date` is the request minute. */
  date?: string;
  base: string;
  rates: Record<string, number>;
}

/**
 * FXRatesAPI's minute-level `latest`, the one intraday quote in the fleet
 * (Frankfurter/ECB publish once per business day ~16:00 CET).
 *
 * Deliberately NOT folded into the daily series: the board's conversion rate is
 * read off `FxRate.rate`, and swapping a stable daily close for a minute quote
 * would make every converted card twitch on each poll (and make two cards
 * disagree mid-render). It is exposed alongside instead — `spot`/`spotAt` — so a
 * ticker-style frame can show the fresher number while money conversion stays
 * anchored to the published close.
 *
 * Best-effort by contract: the caller treats a throw as "no spot today".
 */
export async function loadSpot(
  base: string,
  symbols: string[],
): Promise<{ at: number; rates: Record<string, number> }> {
  const url = `https://api.fxratesapi.com/latest?base=${base}&currencies=${symbols.join(",")}`;
  const body = await fetchJson<FxRatesApiLatest>(url);
  if (body?.success !== true || !body.rates)
    throw new Error("fxratesapi spot: unexpected response shape");
  const rates: Record<string, number> = {};
  for (const symbol of symbols) {
    const value = body.rates[symbol];
    if (usable(value)) rates[symbol] = value;
  }
  const parsed = body.date ? Date.parse(body.date) : Number.NaN;
  return { at: Number.isFinite(parsed) ? parsed : Date.now(), rates };
}
