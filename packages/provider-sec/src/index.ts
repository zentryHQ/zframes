import type {
  Capability,
  CompanyFacts,
  CompanyFactsHistory,
  FinancialFact,
  FinancialMetric,
  FinancialSeries,
  MarketDataProvider,
  SecCompanyFilings,
  SecFiling,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";
import { padCik, resolveCik } from "./tickers";

export { TICKER_TO_CIK, padCik, resolveCik } from "./tickers";

const SUBMISSIONS_URL = (cik: string) =>
  `https://data.sec.gov/submissions/CIK${cik}.json`;
const COMPANY_FACTS_URL = (cik: string) =>
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;

/** How long a resolved profile is reused before re-fetching (filings are event-driven). */
const CACHE_TTL_MS = 15 * 60_000;

// Both endpoints are keyed by CIK and event-driven (they change only on a new
// filing), so the shared cache dedups concurrent loads, reuses a result across
// reloads within the TTL, and serves the last good value on a transient error
// rather than blanking the card. The cached data doesn't depend on the Node
// contact UA, so a single module-level cache per shape is correct.
const filingsCache = new TtlCache<SecCompanyFilings>({
  namespace: "zframes:sec:filings",
  ttlMs: CACHE_TTL_MS,
});
const factsCache = new TtlCache<CompanyFacts>({
  namespace: "zframes:sec:facts",
  ttlMs: CACHE_TTL_MS,
});
const historyCache = new TtlCache<CompanyFactsHistory>({
  namespace: "zframes:sec:facts-history",
  ttlMs: CACHE_TTL_MS,
});

/**
 * The parsed companyfacts blob, cached ahead of BOTH derived shapes. The
 * snapshot and the history read the same download — measured at 3.9 MB for
 * NVDA — so a deep-dive board showing a fundamentals card next to a revenue
 * chart must not pay for it twice.
 *
 * Deliberately NOT persisted: multi-megabyte values would exhaust the ~5 MB
 * localStorage origin quota on the first company, at which point `setItem`
 * throws and TtlCache swallows it — persistence for every other provider would
 * silently stop working. `maxEntries` is tightened well below the default for
 * the same reason: this cache is bounded by bytes in the heap, not by key
 * fan-out, and four companies of blob is already ~16 MB.
 *
 * The derived caches stay in front of it on purpose. Their `load` is what
 * throws on an unusable payload, and stale-on-error only serves a last good
 * value when the throw happens INSIDE the cache that holds it — collapsing
 * these into one raw cache would cache the useless payload as a success and
 * blank the card.
 */
const rawFactsCache = new TtlCache<CompanyFactsResponse>({
  namespace: "zframes:sec:companyfacts-raw",
  ttlMs: CACHE_TTL_MS,
  maxEntries: 4,
});

/** The slice of the submissions JSON we read. */
interface SubmissionsResponse {
  cik?: string;
  name?: string;
  tickers?: string[];
  exchanges?: string[];
  sic?: string;
  sicDescription?: string;
  category?: string;
  fiscalYearEnd?: string;
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      reportDate?: string[];
      form?: string[];
      items?: string[];
      primaryDocument?: string[];
      primaryDocDescription?: string[];
    };
  };
}

function filingUrl(
  cik: string,
  accessionNumber: string,
  primaryDocument: string | undefined,
): string {
  // CIK in the Archives path has no leading zeros; accession has no dashes.
  const cikInt = String(Number(cik));
  const acc = accessionNumber.replace(/-/g, "");
  const base = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${acc}`;
  return primaryDocument ? `${base}/${primaryDocument}` : `${base}/`;
}

/** One reported value of an XBRL concept. */
interface FactUnitEntry {
  end?: string;
  /** Period start — present on duration (income/cash-flow) facts, absent on instant ones. */
  start?: string;
  val?: number;
  fy?: number;
  fp?: string;
  form?: string;
  /** Date the filing carrying this value was submitted; later filings restate earlier ones. */
  filed?: string;
}
interface ConceptFact {
  label?: string;
  units?: Record<string, FactUnitEntry[]>;
}
interface CompanyFactsResponse {
  cik?: number;
  entityName?: string;
  facts?: {
    "us-gaap"?: Record<string, ConceptFact>;
    dei?: Record<string, ConceptFact>;
  };
}

/**
 * Headline metrics to surface, each with its XBRL unit and a prioritised list
 * of concept names (filers tag the same idea differently — e.g. Apple reports
 * revenue as RevenueFromContractWithCustomerExcludingAssessedTax, others use
 * Revenues). The snapshot keeps whichever concept holds the latest print; the
 * history merges the whole chain (see {@link buildSeries}).
 */
interface FactMetric {
  label: string;
  unit: string;
  taxonomy: "us-gaap" | "dei";
  concepts: string[];
  /** "duration" = income-statement/cash-flow span; "instant" = balance-sheet point-in-time. */
  kind: "duration" | "instant";
  /**
   * What the `concepts` list means, which only the HISTORY path has to care about:
   *  - `"aliases"` (default) — one reported line the filer retagged over time
   *    (the ASC 606 rename, mostly). A series MERGES every alias, because any
   *    single tag covers only part of the history.
   *  - `"substitutes"` — genuinely different measures ranked by preference.
   *    A series must pick ONE, because splicing them together invents a step
   *    change the issuer never reported: diluted and basic EPS are both filed
   *    for every period (measured on NVDA: 305 prints each), so a merged "EPS"
   *    line would silently swap measures wherever one tag happened to be newer.
   */
  conceptKind?: "aliases" | "substitutes";
}

const FACT_METRICS: FactMetric[] = [
  {
    label: "Revenue",
    unit: "USD",
    taxonomy: "us-gaap",
    kind: "duration",
    concepts: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      // The Including-assessed-tax variant is the same top line for filers who
      // present revenue gross of sales tax — a filer picks one form or the
      // other, never both for the same line. Without it the whole card is empty
      // for them: of the 3,710 CY2024 filers tagging one of the two, 601 tag
      // ONLY this one, and they are not obscure (TJX, Best Buy, Valero, Duke
      // Energy, NextEra, Kraft Heinz).
      "RevenueFromContractWithCustomerIncludingAssessedTax",
      "Revenues",
      // Retired at ASC 606 (2018); still the only revenue tag on older filings.
      "SalesRevenueNet",
    ],
  },
  {
    label: "Net income",
    unit: "USD",
    taxonomy: "us-gaap",
    kind: "duration",
    concepts: ["NetIncomeLoss"],
  },
  {
    label: "Total assets",
    unit: "USD",
    taxonomy: "us-gaap",
    kind: "instant",
    concepts: ["Assets"],
  },
  {
    label: "Shareholders' equity",
    unit: "USD",
    taxonomy: "us-gaap",
    kind: "instant",
    concepts: ["StockholdersEquity"],
  },
  {
    label: "Diluted EPS",
    unit: "USD/shares",
    taxonomy: "us-gaap",
    kind: "duration",
    conceptKind: "substitutes",
    concepts: ["EarningsPerShareDiluted", "EarningsPerShareBasic"],
  },
  {
    label: "Shares outstanding",
    unit: "shares",
    taxonomy: "dei",
    kind: "instant",
    concepts: ["EntityCommonStockSharesOutstanding"],
  },
];

function fiscalPeriodLabel(entry: FactUnitEntry): string {
  if (!entry.fy) return entry.end ?? "";
  return entry.fp === "FY"
    ? `FY${entry.fy}`
    : `${entry.fp ?? ""} ${entry.fy}`.trim();
}

/**
 * Pick one entry from a concept's unit array. For duration metrics prefer the
 * latest full-fiscal-year (`fp: "FY"`) value — unambiguous annual figures,
 * avoiding the quarterly/YTD/TTM duration mix — falling back to the latest of
 * any period. For instant (balance-sheet) metrics, just the latest by period end.
 */
function pickEntry(
  entries: FactUnitEntry[],
  kind: "duration" | "instant",
): FactUnitEntry | null {
  const valid = entries.filter(
    (e) => e.end && e.form && Number.isFinite(e.val),
  );
  const pool =
    kind === "duration" && valid.some((e) => e.fp === "FY")
      ? valid.filter((e) => e.fp === "FY")
      : valid;
  return pool.reduce<FactUnitEntry | null>(
    (best, e) => (!best || e.end! > best.end! ? e : best),
    null,
  );
}

function extractMetrics(
  facts: CompanyFactsResponse["facts"],
): FinancialMetric[] {
  if (!facts) return [];
  const out: FinancialMetric[] = [];
  for (const spec of FACT_METRICS) {
    const taxonomy = facts[spec.taxonomy];
    if (!taxonomy) continue;
    // Scan ALL candidate concepts and keep the most recent — filers migrate tags
    // (e.g. NVDA's revenue concept changed), so "first that exists" can be stale.
    let best: FactUnitEntry | null = null;
    for (const concept of spec.concepts) {
      const entries = taxonomy[concept]?.units?.[spec.unit];
      if (!entries?.length) continue;
      const candidate = pickEntry(entries, spec.kind);
      if (candidate && (!best || candidate.end! > best.end!)) best = candidate;
    }
    if (!best) continue;
    out.push({
      label: spec.label,
      value: best.val as number,
      unit: spec.unit,
      end: best.end as string,
      fiscalPeriod: fiscalPeriodLabel(best),
      form: best.form as string,
    });
  }
  return out;
}

// ── reported history ────────────────────────────────────────────────────────

/**
 * Day spans a duration fact must fall inside to count as one period of the
 * requested cadence. Ranges, not exact lengths, because US fiscal calendars are
 * 52/53-week (NVDA's "years" measure 364 or 371 days, its "quarters" 91 or 98)
 * and month-end conventions move the rest by a few days.
 *
 * The bands also do the real filtering work: a companyfacts duration array
 * interleaves the annual, quarterly AND year-to-date prints of the same line
 * (measured on NVDA revenue: 19 annual, 66 quarterly, 37 cumulative 6-/9-month
 * spans), and the YTD ones are indistinguishable from real periods by anything
 * except their length. Summing or charting them alongside quarters double-counts
 * the year.
 */
const CADENCE_SPAN_DAYS: Record<
  "annual" | "quarterly",
  readonly [min: number, max: number]
> = {
  annual: [340, 400],
  quarterly: [80, 100],
};

const DAY_MS = 86_400_000;

/** Length of an ISO date range in days, or null if either end is unparseable. */
function spanDays(start: string, end: string): number | null {
  // Both parse as UTC midnight, so the difference is exact — no DST skew.
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.round((to - from) / DAY_MS);
}

/** A fact still carrying the tag it came from, so the merge can rank collisions. */
interface Candidate {
  concept: string;
  /** Position in the metric's concept list — the last, deterministic tie-break. */
  rank: number;
  entry: FactUnitEntry;
}

/**
 * Rank of the form a value was reported on. A 10-K figure is audited and
 * supersedes the same period's 10-Q print, so it wins when both were filed the
 * same day. Amendments (10-K/A) rank with their base form — they carry the same
 * authority, and their later `filed` date already decides them.
 */
function formRank(form: string | undefined): number {
  if (form?.startsWith("10-K")) return 2;
  if (form?.startsWith("10-Q")) return 1;
  return 0;
}

/** Whether `next` should replace `best` as the print for a period. */
function supersedes(next: Candidate, best: Candidate): boolean {
  // Newest filing wins: a restatement is the issuer correcting itself, and
  // EDGAR keeps both prints forever. Measured on NVDA FY2014 revenue —
  // 4,130,162,000 (filed 2014-03-13) vs 4,130,000,000 (filed 2016-03-17).
  const filedNext = next.entry.filed ?? "";
  const filedBest = best.entry.filed ?? "";
  if (filedNext !== filedBest) return filedNext > filedBest;
  const rankNext = formRank(next.entry.form);
  const rankBest = formRank(best.entry.form);
  if (rankNext !== rankBest) return rankNext > rankBest;
  // Everything else equal, the earlier-listed concept wins, so a series built
  // from the same blob twice is byte-identical.
  return next.rank < best.rank;
}

/** Every print of one reporting period, split by what each is good for. */
interface PeriodPrints {
  /** Whose VALUE the series takes — see {@link supersedes}. */
  best: Candidate;
  /** Whose `fy`/`fp` the series LABELS with — see {@link historyPeriodLabel}. */
  label: FactUnitEntry;
}

/**
 * Readable period label for a history fact — and the one place `fy`/`fp` are
 * allowed to be read, because both are traps on a re-printed fact.
 *
 * **`fy` is the FILING's fiscal year, not the period's.** Every 10-K and 10-Q
 * re-prints prior-period comparatives stamped with the *filing's* frame, so the
 * newest-filed print of an old period — exactly the print {@link supersedes}
 * keeps for its value — carries a `fy` from years later. Measured on NVDA: the
 * FY2024, FY2025 and FY2026 revenue periods ALL came back `fy: 2026`, i.e. three
 * different years sharing one x-axis label. So the label comes from the
 * EARLIEST-filed print instead — the filing that period was itself the subject
 * of, where the issuer's own `fy`/`fp` describe it correctly (and in the
 * issuer's own convention, which no derivation from the end date can reproduce:
 * NVDA calls a year ending Jan 2026 "FY2026" while Target calls one ending Feb
 * 2025 "FY2024"). Periods predating the issuer's XBRL tagging have no such
 * print and stay mislabelled; {@link disambiguateLabels} catches the collisions
 * that causes.
 *
 * **`fp` is a trap in the other direction**: a 10-K re-prints comparative
 * quarters tagged `fp: "FY"` (measured on NVDA — the 90-day 2009-01-26→
 * 2009-04-26 period carries `fp: "FY"`). When `fp` contradicts the span we
 * already measured, fall back to the raw period end rather than calling a
 * quarter "FY2010" — a lie the reader cannot detect. Inventing the right
 * quarter number instead would need the filer's fiscal calendar, which
 * companyfacts does not carry.
 */
function historyPeriodLabel(
  entry: FactUnitEntry,
  cadence?: "annual" | "quarterly",
): string {
  if (cadence) {
    const agrees =
      cadence === "annual"
        ? entry.fp === "FY"
        : /^Q[1-4]$/.test(entry.fp ?? "");
    if (!agrees) return entry.end ?? "";
  }
  return fiscalPeriodLabel(entry);
}

/**
 * Last line of defence on the labels: any label claimed by more than one period
 * is replaced, for every period claiming it, with that period's end date.
 *
 * Two distinct points on a chart carrying the same label is the one labelling
 * failure a reader cannot recover from — it looks like the issuer reported the
 * same year twice. A date is less pretty and always true. Only pre-XBRL periods
 * should ever land here (the issuer never filed a print that named them), so in
 * practice this touches the far-left tail of a long series or nothing at all.
 */
function disambiguateLabels(facts: FinancialFact[]): void {
  const seen = new Map<string, number>();
  for (const f of facts)
    seen.set(f.fiscalPeriod, (seen.get(f.fiscalPeriod) ?? 0) + 1);
  for (const f of facts) {
    if ((seen.get(f.fiscalPeriod) ?? 0) > 1) f.fiscalPeriod = f.end;
  }
}

/**
 * Build one metric's full reported history from the companyfacts blob.
 *
 * THE FOOTGUN this exists for: issuers change the XBRL tag a line is reported
 * under, so "the first concept that exists" — right for a latest-value snapshot
 * — truncates a series at the switch. NVIDIA's
 * `RevenueFromContractWithCustomerExcludingAssessedTax` holds 28 facts and stops
 * dead at period end 2022-01-30; NVDA plainly still reports revenue, it just
 * moved back to `Revenues`. A chart built off that one tag ends in 2022 and
 * reads as a data outage rather than a bug, which is the worst possible failure
 * mode: nothing to see, nothing to debug. So an alias chain is UNIONED and then
 * deduplicated by period identity, and `concepts` records which tags actually
 * contributed so the stitching stays visible downstream.
 */
function buildSeries(
  facts: NonNullable<CompanyFactsResponse["facts"]>,
  spec: FactMetric,
  cadence: "annual" | "quarterly",
): FinancialSeries | null {
  const taxonomy = facts[spec.taxonomy];
  if (!taxonomy) return null;

  // Substitutes are ranked, not stitched: take the first concept that reports
  // anything and stop, so the series is one measure end to end.
  const merge = spec.conceptKind !== "substitutes";

  // Period identity → its prints. Duration facts are keyed by the whole span:
  // an issuer files a Q3 and a nine-month YTD figure ending the same day, and
  // keying on `end` alone would let them overwrite each other.
  const byPeriod = new Map<string, PeriodPrints>();
  const contributed = new Set<string>();

  for (const [rank, concept] of spec.concepts.entries()) {
    const entries = taxonomy[concept]?.units?.[spec.unit];
    if (!entries?.length) continue;

    let used = 0;
    for (const entry of entries) {
      // Same hygiene as the snapshot: an unorderable, unattributed or
      // non-numeric print is skipped, never coerced — one NaN poisons a chart's
      // whole y-scale, so a gap is strictly better than a bad point.
      if (!entry.end || !entry.form || !Number.isFinite(entry.val)) continue;

      let key: string;
      if (spec.kind === "duration") {
        if (!entry.start) continue; // a duration line with no span is untrustworthy
        const days = spanDays(entry.start, entry.end);
        const [min, max] = CADENCE_SPAN_DAYS[cadence];
        if (days === null || days < min || days > max) continue;
        key = `${entry.start}|${entry.end}`;
      } else {
        // Instant facts have no span, so cadence does not apply — a balance
        // sheet is a balance sheet — and every period end is kept. Measured on
        // NVDA `Assets`: 136 prints over 69 distinct dates, up to 5 for one date.
        key = entry.end;
      }

      const candidate: Candidate = { concept, rank, entry };
      const prints = byPeriod.get(key);
      if (!prints) {
        byPeriod.set(key, { best: candidate, label: entry });
      } else {
        if (supersedes(candidate, prints.best)) prints.best = candidate;
        // Earliest filing wins the LABEL, for the opposite reason the latest
        // wins the value; a print with no `filed` at all can't be dated, so it
        // never displaces one that can.
        if (
          entry.filed &&
          (!prints.label.filed || entry.filed < prints.label.filed)
        )
          prints.label = entry;
      }
      used++;
    }

    if (used > 0 && !merge) break;
  }

  const winners = [...byPeriod.values()];
  if (winners.length === 0) return null;

  winners.sort(
    (a, b) =>
      a.best.entry.end!.localeCompare(b.best.entry.end!) ||
      (a.best.entry.start ?? "").localeCompare(b.best.entry.start ?? ""),
  );

  const out: FinancialFact[] = winners.map(
    ({ best: { concept, entry }, label }) => {
      // Counted here, not at read time: only a tag with a SURVIVING print
      // contributed, so an alias whose every fact lost to a restatement is not
      // advertised as part of the series.
      contributed.add(concept);
      return {
        end: entry.end as string,
        // `start` is omitted entirely on instant facts — the spec's shape, and
        // what tells a consumer it is looking at a balance-sheet point.
        ...(spec.kind === "duration" ? { start: entry.start as string } : {}),
        value: entry.val as number,
        fiscalPeriod: historyPeriodLabel(
          label,
          spec.kind === "duration" ? cadence : undefined,
        ),
        // Provenance of the VALUE, so it always names the filing the number came
        // from — not the older one the label was read off.
        form: entry.form as string,
      };
    },
  );
  disambiguateLabels(out);

  return {
    label: spec.label,
    unit: spec.unit,
    kind: spec.kind,
    // In merge order — the metric's own concept order — not first-seen order,
    // so the list reads as "which links of the chain are in play".
    concepts: spec.concepts.filter((c) => contributed.has(c)),
    facts: out,
  };
}

function extractSeries(
  facts: CompanyFactsResponse["facts"],
  cadence: "annual" | "quarterly",
): FinancialSeries[] {
  if (!facts) return [];
  const out: FinancialSeries[] = [];
  for (const spec of FACT_METRICS) {
    const series = buildSeries(facts, spec, cadence);
    if (series) out.push(series);
  }
  return out;
}

/**
 * Free, no-API-key SEC EDGAR provider. Exposes three capabilities:
 * - `filings`: company profile + recent filing history from the CORS-safe
 *   `data.sec.gov/submissions` endpoint (browser-direct).
 * - `fundamentals`: headline XBRL financials from `data.sec.gov/api/xbrl/
 *   companyfacts`, which sends NO CORS header — so in the browser it's fetched
 *   via the runtime's same-origin proxy (`fetchJson({ proxied: true })`); when
 *   `zframes serve`/`vite dev` isn't running, that frame degrades to empty.
 * - `fundamentals-history`: the SAME companyfacts download, kept whole instead
 *   of reduced to one latest value per metric — every reported period of each
 *   headline line, oldest→newest, stitched across the issuer's tag changes.
 *
 * Every capability resolves by ticker (via a bundled ticker→CIK snapshot) or
 * by raw CIK. In the browser all work with no config (the browser's own
 * User-Agent, or the proxy's, is accepted). In Node, SEC's fair-access policy
 * wants a contact `User-Agent` — pass one to the constructor
 * (`new SecProvider("you@example.com")`); without it Node requests get a 403.
 */
export class SecProvider implements MarketDataProvider {
  readonly name = "sec";
  readonly capabilities: readonly Capability[] = [
    "filings",
    "fundamentals",
    "fundamentals-history",
  ];

  /** @param contact optional contact for the Node User-Agent (SEC requires it; browsers ignore it). */
  constructor(private readonly contact?: string) {}

  /** Node-only contact User-Agent (browsers ignore it; the proxy sets its own). */
  private nodeInit():
    { init: { headers: { "User-Agent": string } } } | undefined {
    return this.contact && typeof document === "undefined"
      ? { init: { headers: { "User-Agent": `zframes (${this.contact})` } } }
      : undefined;
  }

  async getCompanyFacts(tickerOrCik: string): Promise<CompanyFacts> {
    const cik = resolveCik(tickerOrCik);
    if (!cik) {
      throw new Error(
        `sec: unknown ticker "${tickerOrCik}" — not in the bundled map; pass a CIK (e.g. "320193") instead`,
      );
    }
    return factsCache.get(cik, () => this.fetchCompanyFacts(cik));
  }

  /**
   * The raw companyfacts blob, shared by the snapshot and the history so a
   * board carrying both pays for one download. companyfacts has no CORS header
   * → proxy in the browser; direct in Node.
   */
  private rawCompanyFacts(cik: string): Promise<CompanyFactsResponse> {
    return rawFactsCache.get(cik, () =>
      fetchJson<CompanyFactsResponse>(COMPANY_FACTS_URL(cik), undefined, {
        proxied: true,
        ...this.nodeInit(),
      }),
    );
  }

  private async fetchCompanyFacts(cik: string): Promise<CompanyFacts> {
    const body = await this.rawCompanyFacts(cik);
    const metrics = extractMetrics(body.facts);
    if (metrics.length === 0) {
      throw new Error("sec companyfacts: no headline metrics found");
    }
    return {
      cik: padCik(body.cik ?? cik),
      entityName: body.entityName ?? "",
      metrics,
    };
  }

  /**
   * Every reported period of the headline metrics, not just the latest one.
   * `cadence` selects which duration prints to keep (balance-sheet series
   * ignore it — see {@link buildSeries}).
   */
  async getCompanyFactsHistory(
    tickerOrCik: string,
    cadence: "annual" | "quarterly" = "annual",
  ): Promise<CompanyFactsHistory> {
    const cik = resolveCik(tickerOrCik);
    if (!cik) {
      throw new Error(
        `sec: unknown ticker "${tickerOrCik}" — not in the bundled map; pass a CIK (e.g. "320193") instead`,
      );
    }
    // Cadence is part of the key: the two views are different documents built
    // from the one blob, and the blob's own cache stops the second from re-fetching.
    return historyCache.get(`${cik}|${cadence}`, () =>
      this.fetchCompanyFactsHistory(cik, cadence),
    );
  }

  private async fetchCompanyFactsHistory(
    cik: string,
    cadence: "annual" | "quarterly",
  ): Promise<CompanyFactsHistory> {
    const body = await this.rawCompanyFacts(cik);
    const series = extractSeries(body.facts, cadence);
    // Throw rather than return an empty history, for the same reason the
    // snapshot does: it is what lets the TtlCache serve the last good chart
    // instead of blanking the card on a bad payload.
    if (series.length === 0) {
      throw new Error("sec companyfacts: no reported history found");
    }
    return {
      cik: padCik(body.cik ?? cik),
      entityName: body.entityName ?? "",
      cadence,
      series,
    };
  }

  async getCompanyFilings(tickerOrCik: string): Promise<SecCompanyFilings> {
    const cik = resolveCik(tickerOrCik);
    if (!cik) {
      throw new Error(
        `sec: unknown ticker "${tickerOrCik}" — not in the bundled map; pass a CIK (e.g. "320193") instead`,
      );
    }
    return filingsCache.get(cik, () => this.fetchFilings(cik));
  }

  private async fetchFilings(cik: string): Promise<SecCompanyFilings> {
    // Proxied, despite `data.sec.gov/submissions` answering `access-control-
    // allow-origin: *` to curl. Verified in a real browser 2026-08-06: the
    // direct fetch never resolves, so the Filings Feed / Filings Mix cards sat
    // on "no SEC data" while the endpoint looked perfectly healthy from a
    // terminal. Exactly the trap api.fiscaldata.treasury.gov set — a CORS
    // header in a curl response is not proof the browser can reach the host.
    // In Node the proxy flag is a no-op and a contact UA still matters.
    const body = await fetchJson<SubmissionsResponse>(
      SUBMISSIONS_URL(cik),
      undefined,
      { proxied: true, ...this.nodeInit() },
    );
    const recent = body.filings?.recent;
    if (!recent || !Array.isArray(recent.accessionNumber)) {
      throw new Error("sec submissions: unexpected response shape");
    }

    const count = recent.accessionNumber.length;
    const filings: SecFiling[] = [];
    for (let i = 0; i < count; i++) {
      const accessionNumber = recent.accessionNumber[i];
      const form = recent.form?.[i];
      const filingDate = recent.filingDate?.[i];
      if (!accessionNumber || !form || !filingDate) continue;
      const reportDate = recent.reportDate?.[i];
      const description = recent.primaryDocDescription?.[i];
      const items = recent.items?.[i];
      filings.push({
        form,
        filingDate,
        accessionNumber,
        url: filingUrl(cik, accessionNumber, recent.primaryDocument?.[i]),
        ...(reportDate ? { reportDate } : {}),
        ...(description ? { description } : {}),
        ...(items ? { items } : {}),
      });
    }

    return {
      cik: padCik(body.cik ?? cik),
      name: body.name ?? "",
      tickers: body.tickers ?? [],
      exchanges: body.exchanges ?? [],
      filings,
      ...(body.sic ? { sic: body.sic } : {}),
      ...(body.sicDescription ? { sicDescription: body.sicDescription } : {}),
      ...(body.category ? { category: body.category } : {}),
      ...(body.fiscalYearEnd ? { fiscalYearEnd: body.fiscalYearEnd } : {}),
    };
  }
}
