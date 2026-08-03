/**
 * Provider live-schema smoke test — Tier 1 of the scheduled-monitor suite.
 *
 *   pnpm test:providers            # hit every keyless provider's real API
 *   SMOKE_ONLY=coingecko,fx …      # subset by package-name substring
 *   SMOKE_TIMEOUT_MS=30000 …       # per-probe timeout (default 25s)
 *
 * WHY this exists: the vitest suite stubs `global.fetch` with fixture bodies, so
 * it verifies our PARSING, never that a free public API still exists or still
 * returns the shape we parse. This harness calls each capability method against
 * the LIVE endpoint. Providers already `fetchJson(url, schema)` — a shape change
 * throws inside Zod with a clear message — so a THROW is the hard signal
 * (endpoint dead / non-2xx / schema drift) and fails the run. An empty/oddly-
 * shaped-but-non-throwing result is a SOFT signal (warn) — free APIs legitimately
 * return empty on a lag/holiday, and we don't want to spam issues over that.
 *
 * Proxied providers (treasury/ofr/finra/sec/news/fred/fhfa) work here unchanged:
 * in Node `proxied: true` is a no-op (no CORS), so the request goes direct.
 *
 * Runs standalone via tsx — NOT under vitest — so it stays out of `pnpm test`
 * (which must stay hermetic and green on every PR). It's driven by the
 * scheduled `provider-monitor.yml` workflow, which files an issue on failures.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createKeylessProviders } from "@zframes/providers-keyless";
import { SecProvider } from "@zframes/provider-sec";
import { WalletProvider } from "@zframes/provider-wallet";

type Shape = "array" | "object";

// provider-wallet is filed under the keyed/account tier, so it is NOT in
// `createKeylessProviders` and was therefore the one provider the published
// runtime ships (apps/runtime/src/App.tsx composes it on top of the keyless
// set) with no liveness coverage at all. It nonetheless needs no credential —
// a public address read over public RPC, priced through CoinGecko — so it can
// be probed here exactly like a keyless provider, registered by hand below the
// same way SecProvider is. Its sibling, provider-binance, genuinely cannot be:
// it reads a connected account through the server-side signed relay.
//
// The probe address is a long-lived institutional wallet (a Binance hot wallet)
// rather than an individual's: it reliably holds ETH plus several of the
// bundled ERC-20s, so the probe exercises the full path — JSON-RPC batch, the
// balance decode, and the CoinGecko pricing call — instead of short-circuiting
// on an empty wallet. A zero-balance address would return a valid, empty
// Portfolio and quietly prove nothing.
const WALLET_PROBE_ADDRESS = "0x28C6c06298d514Db089934071355E5743bf21d60";

// SEC's fair-access policy requires a contact EMAIL in the User-Agent (verified:
// a URL-only UA 403s, an email UA 200s). In production SEC is reached via the
// same-origin proxy (browser/proxy UA); `createKeylessProviders` constructs
// SecProvider with no contact, so a Node smoke either passes a real email or it
// perpetually false-alarms. We test SEC only when ZFRAMES_CONTACT is an email
// (a repo variable the maintainer sets); otherwise SEC probes are skipped, not
// failed — no email hardcoded in a public repo, no permanent false issue.
const SEC_CONTACT = process.env.ZFRAMES_CONTACT?.includes("@")
  ? process.env.ZFRAMES_CONTACT
  : null;

interface Probe {
  /** package dir name under packages/ (also the SMOKE_ONLY match key) */
  pkg: string;
  /** exported provider class name */
  cls: string;
  method: string;
  args: unknown[];
  expect: Shape;
  /** provider methods that route through the same-origin proxy in the browser */
  proxied?: boolean;
  /**
   * Per-probe timeout override. The bulk-CSV housing sources (Zillow ~4.4 MB,
   * FHFA metro ~4 MB) legitimately need longer than the default, and the
   * providers themselves already pass a 30s `timeoutMs` — a shorter harness
   * timeout would report a permanent false failure.
   */
  timeoutMs?: number;
  /**
   * Grade this property instead of the whole result. For envelope-shaped returns
   * (`{series: […], level, source}`) the envelope always has keys, so a total
   * region-resolution miss would grade "ok" — pick the payload so an empty one
   * warns.
   */
  pick?: string;
  /**
   * Downgrade a *timeout* on this probe from fail to warn. For the multi-MB
   * published CSVs (FHFA's ~4 MB metro file confirmed live: ~6s in isolation,
   * stalling past the provider's own 30s abort under repeat load) a slow serve is
   * exactly the transient the monitor must not file an issue over. Non-timeout
   * errors — dead URL, non-2xx, parse/schema drift — still fail hard.
   */
  slowSource?: boolean;
}

const now = Date.now();
const DAY = 86_400_000;
const thisYear = new Date().getFullYear();

// The manifest: one row per capability method a hook calls. Kept declarative so
// adding a provider/method is a one-line edit. Args are sane real inputs; a
// symbol that stopped existing would itself be a finding.
const PROBES: Probe[] = [
  // ── Crypto market data ────────────────────────────────────────────────
  {
    pkg: "provider-hyperliquid",
    cls: "HyperliquidProvider",
    method: "getDayStats",
    args: [["BTC", "ETH"]],
    expect: "object",
  },
  {
    pkg: "provider-hyperliquid",
    cls: "HyperliquidProvider",
    method: "getOpenInterest",
    args: [["BTC"]],
    expect: "array",
  },
  {
    pkg: "provider-hyperliquid",
    cls: "HyperliquidProvider",
    method: "getFundingComparison",
    args: [],
    expect: "array",
  },
  {
    pkg: "provider-hyperliquid",
    cls: "HyperliquidProvider",
    method: "getFundingHistory",
    args: [["BTC"], now - DAY],
    expect: "object",
  },
  {
    pkg: "provider-hyperliquid",
    cls: "HyperliquidProvider",
    method: "getCandles",
    args: ["BTC", "1h", now - 7 * DAY],
    expect: "array",
  },

  {
    pkg: "provider-coingecko",
    cls: "CoinGeckoProvider",
    method: "getGlobalMarket",
    args: [],
    expect: "object",
  },
  {
    pkg: "provider-coingecko",
    cls: "CoinGeckoProvider",
    method: "getCoinMarkets",
    args: [],
    expect: "array",
  },
  {
    pkg: "provider-coingecko",
    cls: "CoinGeckoProvider",
    method: "getTrendingCoins",
    args: [],
    expect: "array",
  },
  {
    pkg: "provider-coingecko",
    cls: "CoinGeckoProvider",
    method: "getSectorPerformance",
    args: [],
    expect: "array",
  },
  {
    pkg: "provider-coingecko",
    cls: "CoinGeckoProvider",
    method: "getNftMarket",
    args: [],
    expect: "array",
  },

  {
    pkg: "provider-coinpaprika",
    cls: "CoinpaprikaProvider",
    method: "getCoinMovers",
    args: [],
    expect: "array",
  },
  {
    pkg: "provider-alternativeme",
    cls: "AlternativeMeProvider",
    method: "getFearGreed",
    args: [],
    expect: "array",
  },

  // ── On-chain / DeFi ───────────────────────────────────────────────────
  {
    pkg: "provider-defillama",
    cls: "DefiLlamaProvider",
    method: "getTvlByChain",
    args: [],
    expect: "array",
  },
  {
    pkg: "provider-defillama",
    cls: "DefiLlamaProvider",
    method: "getDexVolume",
    args: [],
    expect: "array",
  },
  {
    pkg: "provider-defillama",
    cls: "DefiLlamaProvider",
    method: "getDexVolumeHistory",
    args: [["uniswap"]],
    expect: "object",
  },
  {
    pkg: "provider-defillama",
    cls: "DefiLlamaProvider",
    method: "getProtocolTvl",
    args: [],
    expect: "array",
  },
  {
    pkg: "provider-defillama",
    cls: "DefiLlamaProvider",
    method: "getProtocolTvlHistory",
    args: [["aave"]],
    expect: "object",
  },
  {
    pkg: "provider-defillama",
    cls: "DefiLlamaProvider",
    method: "getProtocolFees",
    args: [],
    expect: "array",
  },
  {
    pkg: "provider-defillama",
    cls: "DefiLlamaProvider",
    method: "getStablecoinSupply",
    args: [],
    expect: "object",
  },
  {
    pkg: "provider-defillama",
    cls: "DefiLlamaProvider",
    method: "getYieldPools",
    args: [],
    expect: "array",
  },
  {
    pkg: "provider-defillama",
    cls: "DefiLlamaProvider",
    method: "getFeesOverview",
    args: [],
    expect: "object",
  },

  {
    pkg: "provider-mempool",
    cls: "MempoolProvider",
    method: "getBtcFees",
    args: [],
    expect: "object",
  },
  {
    pkg: "provider-mempool",
    cls: "MempoolProvider",
    method: "getMempoolState",
    args: [],
    expect: "object",
  },
  {
    pkg: "provider-mempool",
    cls: "MempoolProvider",
    method: "getBtcBlocks",
    args: [],
    expect: "array",
  },
  {
    pkg: "provider-mempool",
    cls: "MempoolProvider",
    method: "getNetworkHashrate",
    args: ["1w"],
    expect: "object",
  },
  {
    pkg: "provider-mempool",
    cls: "MempoolProvider",
    method: "getDifficultyAdjustment",
    args: [],
    expect: "object",
  },
  {
    pkg: "provider-mempool",
    cls: "MempoolProvider",
    method: "getMiningPools",
    args: ["1w"],
    expect: "object",
  },
  {
    pkg: "provider-mempool",
    cls: "MempoolProvider",
    method: "getLightningStats",
    args: [],
    expect: "object",
  },

  {
    pkg: "provider-geckoterminal",
    cls: "GeckoTerminalProvider",
    method: "getDexPools",
    args: ["eth"],
    expect: "array",
  },
  {
    pkg: "provider-blockchair",
    cls: "BlockchairProvider",
    method: "getChainActivity",
    args: [],
    expect: "array",
  },

  // ── Thai venue (Bitkub) ───────────────────────────────────────────────
  // Also exercises the ECB rate fetch these methods depend on to report USD:
  // if Frankfurter breaks, every Bitkub method throws, and this catches it.
  {
    pkg: "provider-bitkub",
    cls: "BitkubProvider",
    method: "getDayStats",
    args: [["KUB", "BTC"]],
    expect: "object",
  },
  {
    pkg: "provider-bitkub",
    cls: "BitkubProvider",
    method: "getOrderBook",
    args: ["KUB", 10],
    expect: "object",
  },
  {
    pkg: "provider-bitkub",
    cls: "BitkubProvider",
    method: "getCandles",
    args: ["KUB", "4h"],
    expect: "array",
  },

  // ── Derivatives / options ─────────────────────────────────────────────
  {
    pkg: "provider-deribit",
    cls: "DeribitProvider",
    method: "getOptionsSummary",
    args: ["BTC"],
    expect: "object",
  },
  {
    pkg: "provider-deribit",
    cls: "DeribitProvider",
    method: "getVolatilityIndex",
    args: ["BTC", now - 7 * DAY, 3600],
    expect: "array",
  },

  // ── FX ────────────────────────────────────────────────────────────────
  {
    pkg: "provider-fx",
    cls: "FxProvider",
    method: "getFxRates",
    args: ["USD", ["EUR", "GBP"]],
    expect: "array",
  },
  {
    pkg: "provider-fx",
    cls: "FxProvider",
    method: "getDollarIndex",
    args: [],
    expect: "object",
  },

  // ── Metals ────────────────────────────────────────────────────────────
  {
    pkg: "provider-metals",
    cls: "MetalsProvider",
    method: "getMetalSpot",
    args: [["XAU", "XAG"]],
    expect: "array",
  },
  {
    pkg: "provider-metals",
    cls: "MetalsProvider",
    method: "getMetalHistory",
    args: [["XAU"], "USD"],
    expect: "array",
  },
  {
    pkg: "provider-metals",
    cls: "MetalsProvider",
    method: "getMetalPositioning",
    args: ["XAU"],
    expect: "object",
  },
  {
    pkg: "provider-metals",
    cls: "MetalsProvider",
    method: "getTokenizedGold",
    args: [],
    expect: "array",
  },
  {
    // fiscaldata isn't browser-CORS-reachable, so the browser routes this
    // through the runtime proxy; in Node `proxied` is a no-op.
    pkg: "provider-metals",
    cls: "MetalsProvider",
    method: "getGoldReserve",
    args: [],
    expect: "object",
    proxied: true,
  },

  // ── Official US macro & financial data (proxied → direct in Node) ──────
  {
    pkg: "provider-treasury",
    cls: "TreasuryProvider",
    method: "getYieldCurve",
    args: [],
    expect: "object",
    proxied: true,
  },
  {
    pkg: "provider-treasury",
    cls: "TreasuryProvider",
    method: "getTreasuryAverageRates",
    args: [],
    expect: "array",
    proxied: true,
  },
  {
    pkg: "provider-treasury",
    cls: "TreasuryProvider",
    method: "getNationalDebt",
    args: [],
    expect: "object",
    proxied: true,
  },
  {
    pkg: "provider-treasury",
    cls: "TreasuryProvider",
    method: "getTreasuryAuctions",
    args: [],
    expect: "array",
    proxied: true,
  },

  {
    pkg: "provider-nyfed",
    cls: "NyFedProvider",
    method: "getReferenceRates",
    args: [],
    expect: "array",
  },
  {
    pkg: "provider-ofr",
    cls: "OfrProvider",
    method: "getFinancialStress",
    args: [],
    expect: "object",
    proxied: true,
  },
  {
    pkg: "provider-bls",
    cls: "BlsProvider",
    method: "getMacroSeries",
    args: ["CUUR0000SA0", thisYear - 2, thisYear],
    expect: "object",
  },
  {
    pkg: "provider-finra",
    cls: "FinraProvider",
    method: "getShortVolume",
    args: [["TSLA", "AAPL"]],
    expect: "object",
    proxied: true,
  },
  {
    pkg: "provider-sec",
    cls: "SecProvider",
    method: "getCompanyFacts",
    args: ["AAPL"],
    expect: "object",
    proxied: true,
  },
  {
    pkg: "provider-sec",
    cls: "SecProvider",
    method: "getCompanyFilings",
    args: ["AAPL"],
    expect: "object",
  },
  // FRED is keyless only through `fredgraph.csv` (the endpoint FRED's own charts
  // download), so a move to key-gated access shows up here as a throw. The
  // multi-id call is probed via getCreditSpreads, which fetches BOTH OAS series
  // in one request — the mechanism that keeps their date grids aligned.
  {
    pkg: "provider-fred",
    cls: "FredProvider",
    method: "getIndexSeries",
    args: ["SP500"],
    expect: "object",
    proxied: true,
  },
  {
    pkg: "provider-fred",
    cls: "FredProvider",
    method: "getCreditSpreads",
    args: [],
    expect: "array",
    proxied: true,
  },
  {
    pkg: "provider-fred",
    cls: "FredProvider",
    method: "getHousingPriceIndex",
    args: [],
    expect: "object",
    proxied: true,
  },
  {
    pkg: "provider-fred",
    cls: "FredProvider",
    method: "getMortgageRates",
    args: [],
    expect: "object",
    proxied: true,
  },

  // ── Housing ───────────────────────────────────────────────────────────
  // Both read wide published CSVs, so these probes also cover the parsing that
  // silently shifts columns when a publisher edits the file (FHFA's files have
  // NO header row and their column order differs per level; Zillow quotes
  // commas inside metro names). A layout change fails the Zod/parse step.
  {
    pkg: "provider-zillow",
    cls: "ZillowProvider",
    method: "getHomeValueIndex",
    args: [["United States", "Austin, TX"]],
    expect: "array",
    pick: "entries",
    timeoutMs: 60_000,
    slowSource: true,
  },
  {
    pkg: "provider-fhfa",
    cls: "FhfaProvider",
    method: "getRegionalHousingPrice",
    // State keys are the two-letter codes as published ("TX"), NOT state names —
    // a name resolves to nothing and the probe would report an empty series.
    args: [["TX", "CA"], "state"],
    expect: "array",
    pick: "series",
    proxied: true,
    timeoutMs: 60_000,
    slowSource: true,
  },
  {
    // The metro file is the one that must NOT regress to hpi_master.csv (~17 MB,
    // over PROXY_MAX_BYTES → a 502 the browser sees but curl doesn't).
    pkg: "provider-fhfa",
    cls: "FhfaProvider",
    method: "getRegionalHousingPrice",
    args: [["Austin"], "metro"],
    expect: "array",
    pick: "series",
    proxied: true,
    timeoutMs: 60_000,
    slowSource: true,
  },

  {
    pkg: "provider-news",
    cls: "NewsProvider",
    method: "getNews",
    args: [{ feed: "coindesk", limit: 5 }],
    expect: "array",
    proxied: true,
  },

  // ── Other keyless ─────────────────────────────────────────────────────
  {
    pkg: "provider-ultrasound",
    cls: "UltrasoundProvider",
    method: "getEthSupply",
    args: [],
    expect: "object",
  },
  {
    pkg: "provider-polymarket",
    cls: "PolymarketProvider",
    method: "getPredictionMarkets",
    args: [],
    expect: "array",
  },
  {
    pkg: "provider-etf-flows",
    cls: "EtfFlowsProvider",
    method: "getEtfFlows",
    args: ["btc"],
    expect: "object",
  },
  {
    pkg: "provider-coinmetrics",
    cls: "CoinMetricsProvider",
    method: "getOnchainValuation",
    args: [],
    expect: "object",
  },
  {
    pkg: "provider-coinmetrics",
    cls: "CoinMetricsProvider",
    method: "getDailyCloseHistory",
    args: ["btc"],
    expect: "array",
  },
  {
    pkg: "provider-bitcoin-data",
    cls: "BitcoinDataProvider",
    method: "getOnchainExtras",
    args: [],
    expect: "object",
  },

  // ── Keyed tier that needs no key ──────────────────────────────────────
  // The only keyed-tier provider probeable without credentials (see
  // WALLET_PROBE_ADDRESS above). This is the drift signal for the public-RPC
  // endpoints and the CoinGecko simple/price shape — neither of which any
  // hermetic test can observe.
  {
    pkg: "provider-wallet",
    cls: "WalletProvider",
    method: "getPortfolio",
    args: [{ kind: "wallet", address: WALLET_PROBE_ADDRESS }],
    expect: "object",
  },
];

type Status = "ok" | "warn" | "fail";
interface Result {
  provider: string;
  method: string;
  status: Status;
  detail: string;
  ms: number;
}

const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 25_000);
const ONLY = (process.env.SMOKE_ONLY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Reject after `ms`, so one wedged endpoint can't hang the whole run. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`timeout after ${ms}ms (${label})`)), ms),
    ),
  ]);
}

/** Grade one non-throwing result against its expected shape. */
function grade(
  expect: Shape,
  value: unknown,
): { status: Status; detail: string } {
  if (value == null)
    return { status: "warn", detail: "returned null/undefined (empty?)" };
  if (expect === "array") {
    if (!Array.isArray(value))
      return { status: "warn", detail: `expected array, got ${typeof value}` };
    return value.length === 0
      ? {
          status: "warn",
          detail: "empty array (transient? or endpoint drained)",
        }
      : { status: "ok", detail: `array(${value.length})` };
  }
  // object
  if (typeof value !== "object" || Array.isArray(value))
    return {
      status: "warn",
      detail: `expected object, got ${Array.isArray(value) ? "array" : typeof value}`,
    };
  const keys = Object.keys(value as object).length;
  return keys === 0
    ? { status: "warn", detail: "empty object" }
    : { status: "ok", detail: `object(${keys} keys)` };
}

type Instance = Record<string, (...a: unknown[]) => Promise<unknown>>;

/** Run every probe for one provider instance sequentially (shared rate limits). */
async function runProvider(
  pkg: string,
  instance: Instance,
  probes: Probe[],
): Promise<Result[]> {
  const out: Result[] = [];
  for (const probe of probes) {
    const started = Date.now();
    try {
      const fn = instance[probe.method];
      if (typeof fn !== "function")
        throw new Error(`no method ${probe.method} on ${probe.cls}`);
      const value = await withTimeout(
        Promise.resolve(fn.apply(instance, probe.args)),
        probe.timeoutMs ?? TIMEOUT_MS,
        `${pkg}.${probe.method}`,
      );
      const graded =
        probe.pick && value && typeof value === "object"
          ? (value as Record<string, unknown>)[probe.pick]
          : value;
      const { status, detail } = grade(probe.expect, graded);
      out.push({
        provider: pkg,
        method: probe.method,
        status,
        detail,
        ms: Date.now() - started,
      });
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).slice(
        0,
        300,
      );
      const timedOut = /timeout|aborted|abort/i.test(message);
      out.push({
        provider: pkg,
        method: probe.method,
        status: probe.slowSource && timedOut ? "warn" : "fail",
        detail:
          probe.slowSource && timedOut ? `${message} (slow source)` : message,
        ms: Date.now() - started,
      });
    }
  }
  return out;
}

/** Bounded-concurrency map over provider packages. */
async function pool<T, R>(
  items: T[],
  size: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from(
    { length: Math.min(size, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function main() {
  // The live keyless set — the exact providers the published apps ship. Indexing
  // instances by constructor name lets a probe find its provider AND lets us flag
  // any provider in the set that has no probe (registry drift).
  const instances = createKeylessProviders();
  const byClass = new Map<string, Instance>();
  for (const inst of instances)
    byClass.set(inst.constructor.name, inst as unknown as Instance);
  // Give SEC a contact-email UA (see note above) — replaces the no-contact registry one.
  if (SEC_CONTACT)
    byClass.set(
      "SecProvider",
      new SecProvider(SEC_CONTACT) as unknown as Instance,
    );
  // The keyed tier is absent from `createKeylessProviders`, so register the one
  // member that needs no credential by hand. Deliberately NOT pushed into
  // `instances`: that list drives the registry-drift warning, which asks "is
  // every KEYLESS provider probed?" — adding a keyed provider there would make
  // the two lists mean different things.
  byClass.set("WalletProvider", new WalletProvider() as unknown as Instance);

  let selected = ONLY.length
    ? PROBES.filter((p) => ONLY.some((o) => p.pkg.includes(o)))
    : PROBES;
  // Skip SEC (don't fail) when no contact email is configured.
  const skipped: Result[] = [];
  if (!SEC_CONTACT) {
    for (const p of selected.filter((p) => p.cls === "SecProvider"))
      skipped.push({
        provider: p.pkg,
        method: p.method,
        status: "warn",
        detail:
          "skipped — set ZFRAMES_CONTACT=you@example.com to smoke SEC (fair-access UA needs an email)",
        ms: 0,
      });
    selected = selected.filter((p) => p.cls !== "SecProvider");
  }
  if (!selected.length && !skipped.length) {
    console.error(`SMOKE_ONLY=${ONLY.join(",")} matched no probes`);
    process.exit(2);
  }

  // Group probes by class so each provider instance runs its methods in sequence.
  const byClassProbes = new Map<string, Probe[]>();
  for (const p of selected)
    (byClassProbes.get(p.cls) ?? byClassProbes.set(p.cls, []).get(p.cls)!).push(
      p,
    );

  console.log(
    `Probing ${byClassProbes.size} providers / ${selected.length} methods (timeout ${TIMEOUT_MS}ms)…\n`,
  );
  const perPkg = await pool(
    [...byClassProbes.entries()],
    4,
    ([cls, probes]) => {
      const inst = byClass.get(cls);
      if (!inst)
        return Promise.resolve(
          probes.map((p) => ({
            provider: p.pkg,
            method: p.method,
            status: "fail" as Status,
            detail: `class ${cls} not in keyless set — manifest stale?`,
            ms: 0,
          })),
        );
      return runProvider(probes[0].pkg, inst, probes);
    },
  );
  const results = [...perPkg.flat(), ...skipped];

  // Completeness: a provider shipped in the keyless set but never probed is a
  // silent gap — surface it as a warn so the manifest is kept in lockstep.
  const coveredClasses = new Set(PROBES.map((p) => p.cls));
  for (const inst of instances) {
    if (!coveredClasses.has(inst.constructor.name))
      results.push({
        provider: inst.constructor.name,
        method: "(no probe)",
        status: "warn",
        detail: "in keyless set but not smoke-tested — add a probe",
        ms: 0,
      });
  }

  const fails = results.filter((r) => r.status === "fail");
  const warns = results.filter((r) => r.status === "warn");

  // Human-readable table, worst first.
  const order: Record<Status, number> = { fail: 0, warn: 1, ok: 2 };
  for (const r of [...results].sort(
    (a, b) =>
      order[a.status] - order[b.status] || a.provider.localeCompare(b.provider),
  )) {
    const icon = r.status === "ok" ? "✓" : r.status === "warn" ? "▲" : "✗";
    console.log(`${icon} ${r.provider}.${r.method}  ${r.detail}  (${r.ms}ms)`);
  }
  console.log(
    `\n${results.length} methods — ${results.length - fails.length - warns.length} ok, ${warns.length} warn, ${fails.length} fail`,
  );

  const report = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    ok: results.length - fails.length - warns.length,
    warn: warns.length,
    fail: fails.length,
    results,
  };
  const outPath = resolve(process.cwd(), "provider-smoke-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nreport → ${outPath}`);

  // Only a hard failure (throw/dead endpoint/schema drift) fails the run; warns
  // are surfaced in the report but don't block or file an issue.
  process.exit(fails.length > 0 ? 1 : 0);
}

void main();
