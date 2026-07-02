import type {
  Capability,
  CompanyFacts,
  FinancialMetric,
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
  val?: number;
  fy?: number;
  fp?: string;
  form?: string;
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
 * Revenues). First concept that exists wins.
 */
const FACT_METRICS: Array<{
  label: string;
  unit: string;
  taxonomy: "us-gaap" | "dei";
  concepts: string[];
  /** "flow" = income-statement (prefer full fiscal year); "instant" = balance-sheet point-in-time. */
  kind: "flow" | "instant";
}> = [
  {
    label: "Revenue",
    unit: "USD",
    taxonomy: "us-gaap",
    kind: "flow",
    concepts: [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
      "SalesRevenueNet",
    ],
  },
  {
    label: "Net income",
    unit: "USD",
    taxonomy: "us-gaap",
    kind: "flow",
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
    kind: "flow",
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
 * Pick one entry from a concept's unit array. For flow metrics prefer the
 * latest full-fiscal-year (`fp: "FY"`) value — unambiguous annual figures,
 * avoiding the quarterly/YTD/TTM duration mix — falling back to the latest of
 * any period. For instant (balance-sheet) metrics, just the latest by period end.
 */
function pickEntry(
  entries: FactUnitEntry[],
  kind: "flow" | "instant",
): FactUnitEntry | null {
  const valid = entries.filter(
    (e) => e.end && e.form && Number.isFinite(e.val),
  );
  const pool =
    kind === "flow" && valid.some((e) => e.fp === "FY")
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

/**
 * Free, no-API-key SEC EDGAR provider. Exposes two capabilities:
 * - `filings`: company profile + recent filing history from the CORS-safe
 *   `data.sec.gov/submissions` endpoint (browser-direct).
 * - `fundamentals`: headline XBRL financials from `data.sec.gov/api/xbrl/
 *   companyfacts`, which sends NO CORS header — so in the browser it's fetched
 *   via the runtime's same-origin proxy (`fetchJson({ proxied: true })`); when
 *   `zframes serve`/`vite dev` isn't running, that frame degrades to empty.
 *
 * Either capability resolves by ticker (via a bundled ticker→CIK snapshot) or
 * by raw CIK. In the browser both work with no config (the browser's own
 * User-Agent, or the proxy's, is accepted). In Node, SEC's fair-access policy
 * wants a contact `User-Agent` — pass one to the constructor
 * (`new SecProvider("you@example.com")`); without it Node requests get a 403.
 */
export class SecProvider implements MarketDataProvider {
  readonly name = "sec";
  readonly capabilities: readonly Capability[] = ["filings", "fundamentals"];

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

  private async fetchCompanyFacts(cik: string): Promise<CompanyFacts> {
    // companyfacts has no CORS header → proxy in the browser; direct in Node.
    const body = await fetchJson<CompanyFactsResponse>(
      COMPANY_FACTS_URL(cik),
      undefined,
      { proxied: true, ...this.nodeInit() },
    );
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
    // submissions is CORS-safe, so no proxy; in Node a contact UA still matters.
    const body = await fetchJson<SubmissionsResponse>(
      SUBMISSIONS_URL(cik),
      undefined,
      this.nodeInit(),
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
