import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { dashboardPath, setDefault } from "@zframes/store/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `zframes snapshot` is the deterministic data-gatherer a brief-writing agent
// runs: it prints ONE JSON object to stdout, and that agent JSON.parses it
// and follows it. Nothing in PR CI executed it before this file, yet two of its
// contracts are quietly load-bearing:
//
//  * `dashboard.logPath` — the instruction telling the agent WHERE to write the
//    new entry. Collapse the store branch and every store dashboard's brief
//    lands in a nonexistent `../public/`, or several dashboards share one log —
//    the exact collision the per-folder store layout fixed.
//  * the positional/flag stepping — `snapshot --model x mydash` must brief
//    `mydash`, not the `--model` value. Getting that wrong grades yesterday's
//    calls against a DIFFERENT board's universe.
//
// Plus the failure contract: on any spec-load failure stdout must stay EMPTY
// (a partial object would crash the runner's JSON.parse) with the diagnostic on
// stderr and exit 1, and a single dead provider must degrade to `null` rather
// than fail the run.
//
// `snapshot(args)` is the only export — positionalArg / defaultLogPath /
// rankMovers / runMeta / loadPriorEntry / symbolsFromSpec are all module-private
// on purpose, so every assertion below drives them through `snapshot([...])` and
// reads the emitted JSON off a console.log spy. Isolation follows
// packages/cli/src/init.test.ts: a throwaway XDG_CONFIG_HOME per test (storeHome
// reads the env live) plus a separate tmp dir standing in for the cwd. The
// network is stubbed (`vi.stubGlobal("fetch", …)`) and the router THROWS on an
// unrouted URL, so the suite can never reach the real APIs.

interface DayStat {
  markPx: number;
  prevDayPx: number;
  changePct: number;
}

interface Mover {
  symbol: string;
  changePct: number;
  markPx: number;
}

/** The one JSON object snapshot prints — a caller's whole input. */
interface Brief {
  date: string;
  run: {
    timestamp: string;
    model: string | null;
    effort: string | null;
    config: unknown;
  };
  dashboard: {
    kind: "store" | "path";
    name: string | null;
    file: string;
    logPath: string;
  };
  universe: string[];
  featured: string | null;
  market: {
    dayStats: Record<string, DayStat>;
    topMovers: { gainers: Mover[]; losers: Mover[] } | null;
    candles: Array<{ time: number; close: number }> | null;
    funding: Record<string, Array<{ time: number; fundingRate: number }>>;
    fearGreed: Array<{ value: number; classification: string }> | null;
    global: { totalMarketCapUsd: number } | null;
    tvl: Array<{ name: string; tvl: number }> | null;
  };
  priorEntry: unknown;
}

const INFO_URL = "https://api.hyperliquid.xyz/info";
const FNG_URL = "https://api.alternative.me/fng/?limit=14";
const GLOBAL_URL = "https://api.coingecko.com/api/v3/global";
const CHAINS_URL = "https://api.llama.fi/v2/chains";

/** The Hyperliquid `info` POST bodies the four snapshot calls send. */
interface InfoBody {
  type: string;
  dex?: string;
  coin?: string;
  startTime?: number;
  req?: { coin: string; interval: string; startTime: number };
}

interface StubResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

/** A minimal Response-like the stubbed global fetch resolves to. */
function jsonResponse(body: unknown, status = 200): StubResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** `[markPx, prevDayPx]` per symbol, per dex ("" is Hyperliquid's default dex). */
type DexUniverse = Record<string, [number, number]>;

interface StubOptions {
  dexes?: Record<string, DexUniverse>;
  /** Substrings of URLs that answer 500 — exercises snapshot's `safe()` path. */
  down?: string[];
  /** DeFiLlama `/v2/chains` body. */
  chains?: Array<{ name: string; tvl: number }>;
}

// Percentages come out of the provider as ((mark - prev) / prev) * 100, so every
// pair here uses an exact binary fraction (1, ½, ¼, …) — no float dust in the
// asserted changePct values. DUST has markPx 0: rankMovers must drop it.
const DEFAULT_DEX: DexUniverse = {
  BTC: [200, 100], // +100%
  ETH: [150, 100], // +50%
  SOL: [75, 100], // -25%
};

const DEFAULT_CHAINS = [
  { name: "Ethereum", tvl: 60_000_000_000 },
  { name: "Solana", tvl: 10_000_000_000 },
];

/**
 * Route every URL the four keyless providers hit. Unrouted URLs throw, so a
 * forgotten route surfaces as an "unavailable" note on stderr (the happy-path
 * tests assert stderr is clean) instead of a silent real network call.
 */
function stubFetch(options: StubOptions = {}) {
  const dexes = options.dexes ?? { "": DEFAULT_DEX };
  const fetchMock = vi.fn(
    async (url: string, init?: RequestInit): Promise<StubResponse> => {
      if ((options.down ?? []).some((host) => url.includes(host)))
        return jsonResponse({ error: "down" }, 500);

      if (url === INFO_URL) {
        const body = JSON.parse(String(init?.body)) as InfoBody;
        if (body.type === "metaAndAssetCtxs") {
          const ctxs = dexes[body.dex ?? ""] ?? {};
          return jsonResponse([
            { universe: Object.keys(ctxs).map((name) => ({ name })) },
            Object.values(ctxs).map(([markPx, prevDayPx]) => ({
              markPx: String(markPx),
              prevDayPx: String(prevDayPx),
              openInterest: "1",
            })),
          ]);
        }
        if (body.type === "fundingHistory") {
          // The second row's rate is unparseable, so the provider must drop it.
          return jsonResponse([
            { coin: body.coin, fundingRate: "0.0001", time: 1_700_000_000_000 },
            { coin: body.coin, fundingRate: "n/a", time: 1_700_000_003_600 },
          ]);
        }
        if (body.type === "candleSnapshot") {
          return jsonResponse([
            { t: 1, o: "1", h: "2", l: "0.5", c: "1.5", v: "10" },
            { t: 2, o: "1.5", h: "3", l: "1", c: "2.5", v: "20" },
          ]);
        }
        throw new Error(`unrouted hyperliquid body: ${body.type}`);
      }
      if (url === FNG_URL)
        return jsonResponse({
          data: [
            {
              value: "55",
              value_classification: "Greed",
              timestamp: "1700000000",
            },
          ],
        });
      if (url === GLOBAL_URL)
        return jsonResponse({
          data: {
            total_market_cap: { usd: 3_000_000_000_000 },
            market_cap_percentage: { btc: 50 },
            market_cap_change_percentage_24h_usd: 1,
          },
        });
      if (url === CHAINS_URL)
        return jsonResponse(options.chains ?? DEFAULT_CHAINS);
      throw new Error(`unexpected fetch: ${url}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

type FetchMock = ReturnType<typeof stubFetch>;

/** Every Hyperliquid `info` POST body the run sent, in call order. */
function infoCalls(mock: FetchMock): InfoBody[] {
  return mock.mock.calls
    .filter(([url]) => url === INFO_URL)
    .map(([, init]) => JSON.parse(String(init?.body)) as InfoBody);
}

const ENV_KEYS = [
  "XDG_CONFIG_HOME",
  "ZFRAMES_MODEL",
  "ZFRAMES_EFFORT",
  "ZFRAMES_CONFIG",
] as const;

let xdg: string;
let cwd: string;
let savedEnv: Record<string, string | undefined>;
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

function logged(): string {
  return logSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
}

function errored(): string {
  return errSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
}

/**
 * Run the command with a genuinely FRESH module: the four providers snapshot
 * imports hold module-level TtlCaches, so a value primed by an earlier run would
 * be served from cache and every fetch-count assertion would read zero.
 */
async function runSnapshot(
  args: string[],
  cwdDir: string = cwd,
): Promise<{ code: number; out: string; err: string }> {
  vi.resetModules();
  const { snapshot } = await import("./snapshot");
  logSpy.mockClear();
  errSpy.mockClear();
  const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(cwdDir);
  try {
    const code = await snapshot(args);
    return { code, out: logged(), err: errored() };
  } finally {
    cwdSpy.mockRestore();
  }
}

function parseBrief(out: string): Brief {
  return JSON.parse(out) as Brief;
}

/** A schema-valid spec whose frames carry the given configs, in order. */
function spec(configs: Array<Record<string, unknown>> = []) {
  return {
    title: "test board",
    frames: configs.map((config, i) => ({
      id: `f${i}`,
      frame: "price-chart",
      position: { x: 0, y: i, w: 4, h: 3 },
      config,
    })),
  };
}

/** Write a store dashboard (folder layout) and return its spec path. */
function seedStore(name: string, body: unknown = spec()): string {
  const file = dashboardPath(name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(body));
  return file;
}

/** Write a spec at an arbitrary path (a `path` target) and return the path. */
function seedPath(file: string, body: unknown = spec()): string {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(body));
  return file;
}

beforeEach(() => {
  xdg = mkdtempSync(join(tmpdir(), "zframes-snapshot-xdg-"));
  cwd = mkdtempSync(join(tmpdir(), "zframes-snapshot-cwd-"));
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.XDG_CONFIG_HOME = xdg;
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(xdg, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("snapshot — target resolution and flag stepping", () => {
  it("exports only the command entry point", async () => {
    // Every helper is module-private on purpose (the command's only contract
    // is the CLI surface), which is why every test here goes through snapshot().
    vi.resetModules();
    const mod = await import("./snapshot");
    expect(Object.keys(mod)).toEqual(["snapshot"]);
  });

  it("resolves the positional dashboard PAST a --model value", async () => {
    // The footgun the source's VALUE_FLAGS comment calls out. A store dashboard
    // literally named "x" exists, so a stepping bug would resolve happily and
    // brief the WRONG board instead of erroring.
    seedStore("mydash");
    seedStore("x");
    stubFetch();

    const { code, out, err } = await runSnapshot(["--model", "x", "mydash"]);

    expect(code).toBe(0);
    const brief = parseBrief(out);
    expect(brief.dashboard.name).toBe("mydash");
    expect(brief.dashboard.file).toBe(dashboardPath("mydash"));
    expect(brief.run.model).toBe("x");
    expect(err).toBe("");
  });

  it("resolves a positional that precedes its flags", async () => {
    seedStore("mydash");
    seedStore("x");
    stubFetch();

    const brief = parseBrief(
      (await runSnapshot(["mydash", "--model", "x"])).out,
    );
    expect(brief.dashboard.name).toBe("mydash");
    expect(brief.dashboard.file).toBe(dashboardPath("mydash"));
    expect(brief.run.model).toBe("x");
  });

  it("falls through to global-default-first resolution with no positional", async () => {
    // Two entries in the store, so only the configured default can win (the
    // sole-entry fallback would be ambiguous).
    seedStore("mydash");
    seedStore("other");
    setDefault("mydash");
    stubFetch();

    const { code, out } = await runSnapshot([]);

    expect(code).toBe(0);
    const brief = parseBrief(out);
    expect(brief.dashboard.kind).toBe("store");
    expect(brief.dashboard.name).toBe("mydash");
  });

  it("prints the resolve error plus usage on stderr and nothing on stdout", async () => {
    stubFetch();

    const { code, out, err } = await runSnapshot([]);

    expect(code).toBe(1);
    expect(out).toBe("");
    expect(err).toContain("no dashboard found");
    expect(err).toContain("usage: zframes snapshot");
  });
});

describe("snapshot — the log path it reports to a caller", () => {
  it("keeps a store dashboard's brief inside its own folder", async () => {
    seedStore("mydash");
    seedStore("other");
    stubFetch();

    const mine = parseBrief((await runSnapshot(["mydash"])).out).dashboard;
    const theirs = parseBrief((await runSnapshot(["other"])).out).dashboard;

    expect(mine.logPath).toBe(
      join(xdg, "zframes", "dashboards", "mydash", "daily-analysis.json"),
    );
    // A sibling of the spec — served from the dashboard's own folder.
    expect(dirname(mine.logPath)).toBe(dirname(mine.file));
    // …and per-folder, so two dashboards never share one brief.
    expect(theirs.logPath).not.toBe(mine.logPath);
    expect(theirs.logPath).toBe(
      join(xdg, "zframes", "dashboards", "other", "daily-analysis.json"),
    );
  });

  it("keeps the legacy public/ location for a plain path target", async () => {
    const file = seedPath(join(cwd, "app", "dashboard.json"));
    stubFetch();

    const brief = parseBrief((await runSnapshot([file])).out);

    expect(brief.dashboard.kind).toBe("path");
    expect(brief.dashboard.name).toBeNull();
    expect(brief.dashboard.file).toBe(file);
    // <dir>/../public/daily-analysis.json — the pre-store convention.
    expect(brief.dashboard.logPath).toBe(
      join(cwd, "public", "daily-analysis.json"),
    );
  });

  it("lets --log override both, resolved to an absolute path", async () => {
    seedStore("mydash");
    stubFetch();

    const relative = parseBrief(
      (await runSnapshot(["mydash", "--log", "brief.json"])).out,
    );
    expect(relative.dashboard.logPath).toBe(join(cwd, "brief.json"));

    const absolute = join(cwd, "elsewhere", "brief.json");
    const pinned = parseBrief(
      (await runSnapshot(["mydash", "--log", absolute])).out,
    );
    expect(pinned.dashboard.logPath).toBe(absolute);
  });

  it("silently ignores the --log=<file> form", async () => {
    seedStore("mydash");
    setDefault("mydash");
    stubFetch();

    const { code, out } = await runSnapshot(["mydash", "--log=brief.json"]);

    expect(code).toBe(0);
    // KNOWN BUG: flagValue uses indexOf, so `--log=brief.json` never matches and
    // the flag is dropped without a word — the log path stays the default
    // instead of the requested file — should accept the `--flag=value` form (or
    // reject it loudly), the way serve.ts (`--port=`, `--contact=`) and init.ts
    // (`--title=`, `--author=`) both do. Pinned so the suite stays green; fixing
    // the source must flip this assertion.
    expect(parseBrief(out).dashboard.logPath).toBe(
      join(xdg, "zframes", "dashboards", "mydash", "daily-analysis.json"),
    );
    expect(parseBrief(out).dashboard.logPath).not.toBe(join(cwd, "brief.json"));
  });
});

describe("snapshot — the engine stamp", () => {
  it("prefers the flags over the ZFRAMES_* env", async () => {
    seedStore("mydash");
    process.env.ZFRAMES_MODEL = "env-model";
    process.env.ZFRAMES_EFFORT = "env-effort";
    process.env.ZFRAMES_CONFIG = "env-config";
    stubFetch();

    const brief = parseBrief(
      (
        await runSnapshot([
          "mydash",
          "--model",
          "flag-model",
          "--effort",
          "flag-effort",
          "--config",
          "flag-config",
        ])
      ).out,
    );

    expect(brief.run.model).toBe("flag-model");
    expect(brief.run.effort).toBe("flag-effort");
    expect(brief.run.config).toBe("flag-config");
  });

  it("falls back to the ZFRAMES_* env when no flags are given", async () => {
    seedStore("mydash");
    process.env.ZFRAMES_MODEL = "env-model";
    process.env.ZFRAMES_EFFORT = "env-effort";
    process.env.ZFRAMES_CONFIG = "env-config";
    stubFetch();

    const brief = parseBrief((await runSnapshot(["mydash"])).out);

    expect(brief.run.model).toBe("env-model");
    expect(brief.run.effort).toBe("env-effort");
    expect(brief.run.config).toBe("env-config");
  });

  it("stamps all three null when neither flag nor env is set", async () => {
    seedStore("mydash");
    stubFetch();

    const brief = parseBrief((await runSnapshot(["mydash"])).out);

    expect(brief.run.model).toBeNull();
    expect(brief.run.effort).toBeNull();
    expect(brief.run.config).toBeNull();
  });

  it("emits a parseable --config as an object and an unparseable one verbatim", async () => {
    seedStore("mydash");
    stubFetch();

    const asObject = parseBrief(
      (await runSnapshot(["mydash", "--config", '{"a":1,"b":["x"]}'])).out,
    );
    expect(asObject.run.config).toEqual({ a: 1, b: ["x"] });

    const asString = parseBrief(
      (await runSnapshot(["mydash", "--config", "thinking=high"])).out,
    );
    expect(asString.run.config).toBe("thinking=high");
  });

  it("stamps an ISO timestamp and dates the run by the system clock", async () => {
    seedStore("mydash");
    stubFetch();
    // Only Date is faked: AbortSignal.timeout (inside the shared fetch helper)
    // must keep its real timer, and nothing here needs the loop advanced.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-04T05:06:07.000Z"));
    try {
      const brief = parseBrief((await runSnapshot(["mydash"])).out);
      expect(brief.run.timestamp).toBe("2026-03-04T05:06:07.000Z");
      expect(new Date(brief.run.timestamp).toISOString()).toBe(
        brief.run.timestamp,
      );
      expect(brief.date).toBe("2026-03-04");

      // --date overrides the derived day (the runner owns the label).
      const dated = parseBrief(
        (await runSnapshot(["mydash", "--date", "2025-12-31"])).out,
      );
      expect(dated.date).toBe("2025-12-31");
      expect(dated.run.timestamp).toBe("2026-03-04T05:06:07.000Z");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("snapshot — the symbol universe", () => {
  it("collects config.symbol and config.symbols, deduped, in spec order", async () => {
    seedStore(
      "mydash",
      spec([
        { symbol: "BTC" },
        { symbols: ["ETH", "BTC", 42, null, "SOL"] }, // dupes + non-strings dropped
        { symbol: "ETH" }, // already seen
        {}, // no symbols at all
        { symbols: "not-an-array" }, // ignored: not an array
        { symbol: 7 }, // ignored: not a string
        { symbols: ["GHOST"] }, // not listed on the venue
      ]),
    );
    stubFetch();

    const { code, out, err } = await runSnapshot(["mydash"]);

    expect(code).toBe(0);
    const brief = parseBrief(out);
    expect(brief.universe).toEqual(["BTC", "ETH", "SOL", "GHOST"]);
    // featured = universe[0], in spec order — it's the one that gets candles.
    expect(brief.featured).toBe("BTC");
    // The universe is the dashboard's ask; dayStats only holds what the venue
    // actually quotes, so GHOST stays in the universe and out of the stats.
    expect(Object.keys(brief.market.dayStats).sort()).toEqual([
      "BTC",
      "ETH",
      "SOL",
    ]);
    expect(brief.market.dayStats.BTC).toMatchObject({
      markPx: 200,
      prevDayPx: 100,
      changePct: 100,
    });
    expect(err).toBe("");
  });

  it("candles the featured symbol only and funds the first six", async () => {
    const symbols = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];
    seedStore("mydash", spec([{ symbols }]));
    const fetchMock = stubFetch({
      dexes: { "": Object.fromEntries(symbols.map((s) => [s, [200, 100]])) },
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-04T05:06:07.000Z"));
    const now = Date.parse("2026-03-04T05:06:07.000Z");
    try {
      const brief = parseBrief((await runSnapshot(["mydash"])).out);

      const candleCalls = infoCalls(fetchMock).filter(
        (b) => b.type === "candleSnapshot",
      );
      expect(candleCalls).toHaveLength(1);
      expect(candleCalls[0].req).toEqual({
        coin: "S1", // featured only
        interval: "1d",
        startTime: now - 14 * 86_400_000,
      });
      expect(brief.market.candles).toEqual([
        { time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
        { time: 2, open: 1.5, high: 3, low: 1, close: 2.5, volume: 20 },
      ]);

      // Funding is capped at the first six symbols — a wider universe must not
      // fan out into eight extra round trips.
      const fundingCalls = infoCalls(fetchMock).filter(
        (b) => b.type === "fundingHistory",
      );
      expect(fundingCalls.map((b) => b.coin).sort()).toEqual([
        "S1",
        "S2",
        "S3",
        "S4",
        "S5",
        "S6",
      ]);
      expect(fundingCalls[0].startTime).toBe(now - 3 * 86_400_000);
      expect(Object.keys(brief.market.funding).sort()).toEqual([
        "S1",
        "S2",
        "S3",
        "S4",
        "S5",
        "S6",
      ]);
      // The unparseable second row is dropped, the good one is numeric.
      expect(brief.market.funding.S1).toEqual([
        { time: 1_700_000_000_000, fundingRate: 0.0001 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips every universe-scoped call for a frameless dashboard", async () => {
    seedStore("mydash", spec([]));
    const fetchMock = stubFetch();

    const { code, out, err } = await runSnapshot(["mydash"]);

    expect(code).toBe(0);
    const brief = parseBrief(out);
    expect(brief.universe).toEqual([]);
    expect(brief.featured).toBeNull();
    expect(brief.market.dayStats).toEqual({});
    expect(brief.market.funding).toEqual({});
    expect(brief.market.candles).toBeNull();
    // Not zero fetches: the universe-INDEPENDENT sources (market universe, fear
    // & greed, global market, TVL) still run — a frameless board still gets a
    // market backdrop. What must not happen is a symbol-scoped call.
    expect(infoCalls(fetchMock)).toEqual([{ type: "metaAndAssetCtxs" }]);
    expect(brief.market.topMovers).not.toBeNull();
    expect(err).toBe("");
  });
});

describe("snapshot — market aggregates", () => {
  it("ranks five gainers and five losers, dropping zero-priced dust", async () => {
    seedStore("mydash", spec([{ symbol: "A" }]));
    const fetchMock = stubFetch({
      dexes: {
        "": {
          A: [200, 100], // +100%
          B: [150, 100], // +50%
          C: [125, 100], // +25%
          D: [100, 100], // 0%
          E: [75, 100], // -25%
          F: [50, 100], // -50%
          G: [25, 100], // -75%
          DUST: [0, 1], // -100%, but markPx 0 → dropped as illiquid dust
        },
      },
      chains: [
        { name: "ZERO", tvl: 0 }, // dropped: not > 0
        ...Array.from({ length: 14 }, (_, i) => ({
          name: `C${i + 1}`,
          tvl: (14 - i) * 1_000_000_000,
        })).reverse(), // fed ascending, must come back descending
      ],
    });

    const brief = parseBrief((await runSnapshot(["mydash"])).out);
    const movers = brief.market.topMovers;

    expect(movers).not.toBeNull();
    expect(movers?.gainers.map((r) => r.symbol)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
    // Losers are the tail, reversed — worst first.
    expect(movers?.losers.map((r) => r.symbol)).toEqual([
      "G",
      "F",
      "E",
      "D",
      "C",
    ]);
    expect(movers?.gainers[0]).toEqual({
      symbol: "A",
      changePct: 100,
      markPx: 200,
    });
    expect(movers?.losers[0]).toEqual({
      symbol: "G",
      changePct: -75,
      markPx: 25,
    });
    const ranked = [...(movers?.gainers ?? []), ...(movers?.losers ?? [])].map(
      (r) => r.symbol,
    );
    expect(ranked).not.toContain("DUST");

    // TVL is sorted desc and capped at 12 chains.
    expect(brief.market.tvl?.map((c) => c.name)).toEqual([
      "C1",
      "C2",
      "C3",
      "C4",
      "C5",
      "C6",
      "C7",
      "C8",
      "C9",
      "C10",
      "C11",
      "C12",
    ]);
    expect(brief.market.fearGreed).toEqual([
      { value: 55, classification: "Greed", time: 1_700_000_000_000 },
    ]);
    expect(brief.market.global).toEqual({
      totalMarketCapUsd: 3_000_000_000_000,
      marketCapChangePct24h: 1,
      dominance: { btc: 50 },
    });
    expect(infoCalls(fetchMock).length).toBeGreaterThan(0);
  });

  it("degrades one dead source to null and still prints a parseable brief", async () => {
    seedStore("mydash", spec([{ symbol: "BTC" }]));
    stubFetch({ down: ["api.coingecko.com"] });

    const { code, out, err } = await runSnapshot(["mydash"]);

    // A source being down must never fail the run — the snapshot is still usable.
    expect(code).toBe(0);
    const brief = parseBrief(out);
    expect(brief.market.global).toBeNull();
    expect(err).toContain("global market unavailable");
    expect(err).toContain("failed: 500");
    // Everything else survives.
    expect(brief.market.fearGreed).not.toBeNull();
    expect(brief.market.tvl).not.toBeNull();
    expect(Object.keys(brief.market.dayStats)).toEqual(["BTC"]);
  });
});

describe("snapshot — the prior log entry", () => {
  function seedLog(body: string): string {
    const file = join(
      xdg,
      "zframes",
      "dashboards",
      "mydash",
      "daily-analysis.json",
    );
    writeFileSync(file, body);
    return file;
  }

  it("hands over the LAST entry in the log, not the first", async () => {
    seedStore("mydash");
    seedLog(
      JSON.stringify({
        entries: [
          { date: "2026-01-01", note: "oldest" },
          { date: "2026-01-02", note: "middle" },
          { date: "2026-01-03", note: "newest" },
        ],
      }),
    );
    stubFetch();

    const brief = parseBrief((await runSnapshot(["mydash"])).out);

    expect(brief.priorEntry).toEqual({ date: "2026-01-03", note: "newest" });
  });

  it("yields null without throwing for every degenerate log", async () => {
    seedStore("mydash");
    stubFetch();

    // No log file at all (the first-ever run).
    expect(
      parseBrief((await runSnapshot(["mydash"])).out).priorEntry,
    ).toBeNull();

    for (const body of [
      "{ not json",
      '{"other":1}', // no `entries` key
      '{"entries":[]}', // present but empty
      '{"entries":null}',
    ]) {
      seedLog(body);
      const { code, out } = await runSnapshot(["mydash"]);
      expect(code).toBe(0);
      expect(parseBrief(out).priorEntry).toBeNull();
    }
  });

  it("reads the log the --log flag points at", async () => {
    seedStore("mydash");
    const other = join(cwd, "elsewhere.json");
    writeFileSync(other, JSON.stringify({ entries: [{ note: "from --log" }] }));
    // The default in-folder log holds something else, so this can only pass if
    // the flag actually redirected the read.
    seedLog(JSON.stringify({ entries: [{ note: "default log" }] }));
    stubFetch();

    const brief = parseBrief(
      (await runSnapshot(["mydash", "--log", other])).out,
    );

    expect(brief.dashboard.logPath).toBe(other);
    expect(brief.priorEntry).toEqual({ note: "from --log" });
  });
});

describe("snapshot — spec load failures print nothing on stdout", () => {
  it("exits 1 on malformed JSON", async () => {
    const file = seedPath(join(cwd, "app", "dashboard.json"));
    writeFileSync(file, "{ frames: [ ");
    stubFetch();

    const { code, out, err } = await runSnapshot([file]);

    expect(code).toBe(1);
    // The brief runner JSON.parses stdout — a partial object would crash it.
    expect(out).toBe("");
    expect(err).toContain(`✗ ${file} is not valid JSON`);
  });

  it("exits 1 on a schema-invalid spec, naming the offending field", async () => {
    const file = seedPath(join(cwd, "app", "dashboard.json"), {
      title: "broken",
      frames: [{ id: "a", frame: "clock" }], // position is required
    });
    stubFetch();

    const { code, out, err } = await runSnapshot([file]);

    expect(code).toBe(1);
    expect(out).toBe("");
    expect(err).toContain(`✗ ${file} is not a valid dashboard spec`);
    expect(err).toContain("frames.0.position");
  });

  // Running as root defeats a 0o000 mode, so the unreadable-file path is only
  // observable as an unprivileged user (which is how CI runs).
  it.skipIf(process.getuid?.() === 0)(
    "exits 1 when the spec file cannot be read",
    async () => {
      const file = seedPath(join(cwd, "app", "dashboard.json"));
      chmodSync(file, 0o000);
      stubFetch();
      try {
        const { code, out, err } = await runSnapshot([file]);

        expect(code).toBe(1);
        expect(out).toBe("");
        expect(err).toContain(`✗ cannot read ${file}`);
      } finally {
        chmodSync(file, 0o600);
      }
    },
  );
});
