import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DashboardSpecSchema, type DashboardSpec } from "@zframes/spec/spec";
import { resolveServeTarget, type ResolvedTarget } from "@zframes/store/store";
import { AlternativeMeProvider } from "@zframes/provider-alternativeme";
import { CoinGeckoProvider } from "@zframes/provider-coingecko";
import { DefiLlamaProvider } from "@zframes/provider-defillama";
import { HyperliquidProvider } from "@zframes/provider-hyperliquid";

const DAY_MS = 86_400_000;

/** Load + validate a dashboard.json the same way `lint` does. */
function loadSpec(file: string): DashboardSpec | null {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    console.error(`✗ cannot read ${file}`);
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    console.error(`✗ ${file} is not valid JSON: ${(error as Error).message}`);
    return null;
  }
  const parsed = DashboardSpecSchema.safeParse(json);
  if (!parsed.success) {
    console.error(`✗ ${file} is not a valid dashboard spec:`);
    for (const issue of parsed.error.issues)
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return null;
  }
  return parsed.data;
}

/**
 * The universe of interest = every symbol on the dashboard. Generic walk of
 * `config.symbol` (string) and `config.symbols` (string[]), so any current or
 * future symbol-bearing frame is covered without per-frame coupling.
 */
function symbolsFromSpec(spec: DashboardSpec): string[] {
  const set = new Set<string>();
  for (const instance of spec.frames) {
    const cfg = instance.config as Record<string, unknown>;
    if (typeof cfg.symbol === "string") set.add(cfg.symbol);
    if (Array.isArray(cfg.symbols))
      for (const sym of cfg.symbols) if (typeof sym === "string") set.add(sym);
  }
  return [...set];
}

/** Run a provider call, returning null (and a stderr note) if it fails/offline. */
async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error(`  · ${label} unavailable: ${(error as Error).message}`);
    return null;
  }
}

interface DayStat {
  markPx: number;
  prevDayPx: number;
  changePct: number;
}

/** Biggest gainers/losers from a day-stats map (drops illiquid dust). */
function rankMovers(stats: Record<string, DayStat>, count: number) {
  const rows = Object.entries(stats)
    .map(([symbol, stat]) => ({
      symbol,
      changePct: stat.changePct,
      markPx: stat.markPx,
    }))
    .filter((row) => row.markPx > 0)
    .sort((a, b) => b.changePct - a.changePct);
  return {
    gainers: rows.slice(0, count),
    losers: rows.slice(-count).reverse(),
  };
}

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

// Flags that consume the following token as their value. The positional
// dashboard arg must skip past those values, or `snapshot --model x mydash`
// would mistake `x` (the --model value) for the dashboard.
const VALUE_FLAGS = new Set([
  "--log",
  "--date",
  "--model",
  "--effort",
  "--config",
]);

/** First non-flag token, skipping known `--flag value` pairs. */
function positionalArg(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("-")) {
      if (VALUE_FLAGS.has(a)) i++; // step over this flag's value
      continue;
    }
    return a;
  }
  return undefined;
}

/**
 * Engine stamp for the entry — which model/effort/config produced this run, and
 * when. The agent reasoning over the brief is a swappable, stateless engine, so
 * recording it makes a changing model *detectable and separable* in the log
 * (segment performance by model; spot a regime-shift caused by a swap) instead
 * of silently polluting the self-grading signal. Model/effort/config come from
 * the runner (flags or ZFRAMES_* env); the timestamp is objective (Node Date).
 */
function runMeta(args: string[]) {
  const pick = (flag: string, env: string): string | null =>
    flagValue(args, flag) ?? process.env[env] ?? null;
  const rawConfig = pick("--config", "ZFRAMES_CONFIG");
  let config: unknown = rawConfig;
  if (typeof rawConfig === "string") {
    try {
      config = JSON.parse(rawConfig); // a JSON config object, if given
    } catch {
      config = rawConfig; // otherwise keep the raw string verbatim
    }
  }
  return {
    timestamp: new Date().toISOString(),
    model: pick("--model", "ZFRAMES_MODEL"),
    effort: pick("--effort", "ZFRAMES_EFFORT"),
    config,
  };
}

/**
 * Where this dashboard's analysis log lives by default. A store dashboard is its
 * own folder (`dashboards/<name>/`), so its brief is just a sibling of the spec —
 * `dashboards/<name>/daily-analysis.json`, served at the frame's default
 * `/daily-analysis.json` (serve's sibling root is that folder). Per-folder, so
 * dashboards never collide on one shared brief; no per-name filename needed. A
 * bare path target keeps the pre-store convention: the log in the app's
 * `public/` dir, also at `/daily-analysis.json`.
 */
function defaultLogPath(target: ResolvedTarget): string {
  return target.kind === "store"
    ? join(dirname(target.file), "daily-analysis.json")
    : resolve(dirname(target.file), "..", "public", "daily-analysis.json");
}

/** The newest entry from a prior analysis log, for grading. Null if none. */
function loadPriorEntry(logPath: string): unknown {
  if (!existsSync(logPath)) return null;
  try {
    const json = JSON.parse(readFileSync(logPath, "utf8")) as {
      entries?: unknown[];
    };
    const entries = json.entries ?? [];
    return entries.length ? entries[entries.length - 1] : null;
  } catch {
    return null;
  }
}

/**
 * `zframes snapshot <dashboard.json>` — the deterministic data-gatherer for the
 * /zframes-brief loop. Derives the symbol universe from the dashboard, pulls a
 * keyless market snapshot, loads the prior log entry (for grading), and prints
 * one JSON object to stdout. Writes nothing — the agent owns the file write.
 */
const USAGE =
  "usage: zframes snapshot [name|dashboard.json] [--log <file>] [--date YYYY-MM-DD]\n" +
  "         [--model <id>] [--effort <level>] [--config <json>]\n" +
  "  (no target → the default store dashboard, just like `serve`;\n" +
  "   or ZFRAMES_MODEL / ZFRAMES_EFFORT / ZFRAMES_CONFIG env)";

export async function snapshot(args: string[]): Promise<number> {
  // Resolve global-default-first, exactly like `serve`: a bare `snapshot` briefs
  // the default dashboard, `snapshot <name>` a specific store one, `snapshot
  // <path>` a file. The file must exist (unlike `init`, which creates it).
  const resolved = resolveServeTarget(positionalArg(args), process.cwd());
  if ("error" in resolved) {
    console.error(`✗ ${resolved.error}`);
    console.error(USAGE);
    return 1;
  }
  const file = resolved.file;
  const logFlag = flagValue(args, "--log");
  const dateFlag = flagValue(args, "--date");
  const logPath = logFlag ? resolve(logFlag) : defaultLogPath(resolved);

  const spec = loadSpec(file);
  if (!spec) return 1;

  const universe = symbolsFromSpec(spec);
  // The dashboard's headline symbol — the first symbol in spec order — gets a
  // candle series in the snapshot. (Was the "featured" frame's symbol before the
  // hero-frame flag was removed; first-in-order is the natural stand-in.)
  const featured = universe[0] ?? null;

  const hl = new HyperliquidProvider();
  const now = Date.now();

  const [userStats, marketStats, candles, funding, fearGreed, global, tvl] =
    await Promise.all([
      universe.length
        ? safe("hyperliquid day-stats", () => hl.getDayStats(universe))
        : Promise.resolve<Record<string, DayStat>>({}),
      safe("hyperliquid market universe", () => hl.getDayStats()),
      featured
        ? safe("hyperliquid candles", () =>
            hl.getCandles(featured, "1d", now - 14 * DAY_MS),
          )
        : Promise.resolve(null),
      universe.length
        ? safe("hyperliquid funding", () =>
            hl.getFundingHistory(universe.slice(0, 6), now - 3 * DAY_MS),
          )
        : Promise.resolve({}),
      safe("fear & greed", () => new AlternativeMeProvider().getFearGreed(14)),
      safe("global market", () => new CoinGeckoProvider().getGlobalMarket()),
      safe("tvl", () => new DefiLlamaProvider().getTvlByChain()),
    ]);

  const out = {
    date: dateFlag ?? new Date().toISOString().slice(0, 10),
    run: runMeta(args),
    // Which dashboard this snapshot is for, and where its brief lives — so the
    // /zframes-brief agent writes the new entry to the RIGHT per-dashboard log
    // (`logPath`, a sibling of this dashboard inside its folder). The frame reads
    // it at its default `/daily-analysis.json` — no per-name `src` needed.
    dashboard: {
      kind: resolved.kind,
      name: resolved.kind === "store" ? resolved.name : null,
      file,
      logPath,
    },
    universe,
    featured,
    market: {
      dayStats: userStats,
      topMovers: marketStats ? rankMovers(marketStats, 5) : null,
      candles,
      funding,
      fearGreed,
      global,
      tvl: tvl ? tvl.slice(0, 12) : null,
    },
    priorEntry: loadPriorEntry(logPath),
  };

  console.log(JSON.stringify(out, null, 2));
  return 0;
}
