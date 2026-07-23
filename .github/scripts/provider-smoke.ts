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
 * Proxied providers (treasury/ofr/finra/sec/news) work here unchanged: in Node
 * `proxied: true` is a no-op (no CORS), so the request goes direct.
 *
 * Runs standalone via tsx — NOT under vitest — so it stays out of `pnpm test`
 * (which must stay hermetic and green on every PR). It's driven by the
 * scheduled `provider-monitor.yml` workflow, which files an issue on failures.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createKeylessProviders } from "@zframes/providers-keyless";
import { SecProvider } from "@zframes/provider-sec";

type Shape = "array" | "object";

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
        TIMEOUT_MS,
        `${pkg}.${probe.method}`,
      );
      const { status, detail } = grade(probe.expect, value);
      out.push({
        provider: pkg,
        method: probe.method,
        status,
        detail,
        ms: Date.now() - started,
      });
    } catch (e) {
      out.push({
        provider: pkg,
        method: probe.method,
        status: "fail",
        detail: (e instanceof Error ? e.message : String(e)).slice(0, 300),
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
