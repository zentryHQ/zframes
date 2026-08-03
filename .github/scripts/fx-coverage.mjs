#!/usr/bin/env node
/**
 * FX coverage drift monitor — the guard for the board display-currency enum.
 *
 * `packages/spec/src/spec.ts`'s `CURRENCY_CODES` is not an arbitrary list: it is
 * DERIVED from live upstream coverage. `provider-fx` resolves every rate through
 * an ordered chain of four keyless upstreams (Frankfurter/ECB → FXRatesAPI →
 * currency-api → ECB Data Portal direct), and a code earns a place in the enum
 * only when **at least two** of those quote it — so every selectable board
 * currency inherits the chain's fallback resilience.
 *
 * Upstream coverage drifts, and nothing else notices:
 *   • a code dropped to ONE source silently loses its fallback (one 5xx and the
 *     board quotes USD wearing a ฟ/₹/₩ symbol),
 *   • a code dropped to ZERO sources renders an unconverted dollar figure,
 *   • a whole source can quietly go away — during this feature we found
 *     `exchangerate.host` had become key-gated and `exchangerate-api.com/v4`
 *     deprecated.
 *
 * The daily provider monitor can't see any of this: it probes `getFxRates`,
 * which walks the chain and succeeds as long as ANY link answers. A dead
 * fallback is invisible to it by construction. Hence this monitor.
 *
 * Emits a generic monitor report (title/body/findingsCount) for
 * report-to-issue.mjs → ONE dedup'd, auto-closing issue (label: fx-coverage).
 * Advisory — always exit 0; coverage lives in the issue, not the workflow badge.
 *
 *   node .github/scripts/fx-coverage.mjs        # writes fx-coverage-report.json
 *   FX_COVERAGE_BREAK=frankfurter node …        # simulate one source being dead
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SPEC_PATH = resolve("packages/spec/src/spec.ts");
const REPORT_PATH = "fx-coverage-report.json";
const TIMEOUT_MS = Number(process.env.FX_COVERAGE_TIMEOUT_MS ?? 30_000);

/**
 * Transient-blip tolerance. The sibling monitors have no retry at all (a single
 * throw is the signal), which is fine for a 20-provider sweep where one flake is
 * one row in a table. Here a single source is 25% of the whole chain and reads as
 * "the chain lost a link", so a blip must not cry wolf. Three defences, in order:
 *
 *  1. Each source gets ATTEMPTS tries with a growing pause — a 502/timeout has to
 *     reproduce three times, seconds apart, to count as unreachable.
 *  2. If ANY source failed, the coverage comparison is SKIPPED rather than
 *     recomputed from the survivors — otherwise a Frankfurter outage would report
 *     half the enum as "lost its fallback", which is the loudest possible wolf.
 *  3. report-to-issue.mjs dedups on one open issue per label and auto-closes on
 *     the next clean run, so the worst case for a blip that beats (1) is a single
 *     issue that closes itself a week later — never a new issue per run.
 */
const ATTEMPTS = 3;
const RETRY_PAUSE_MS = [0, 3_000, 9_000];

/**
 * Not currencies, on purpose. The board's display-currency layer converts money
 * figures at a fiat reference rate; metals, IMF SDRs and crypto are assets this
 * spec models elsewhere (`provider-metals`, the crypto providers) and must never
 * qualify. Two of the four sources quote them alongside fiat, so a ≥2-source
 * count would otherwise "discover" BTC as a board currency.
 *
 * Metals/funds: XAU XAG XPT XPD XDR. The rest are 3-letter crypto tickers seen
 * in the fxratesapi + currency-api bodies (both list hundreds of tokens); longer
 * names (`1inch`, `matic`) are already dropped by the 3-uppercase-letter filter.
 */
const NON_CURRENCY = new Set(
  (
    "XAU XAG XPT XPD XDR " + // metals + IMF special drawing rights
    "BTC ETH BNB SOL XRP ADA DOT TRX LTC BCH XLM XMR ETC EOS XTZ ZEC DASH " +
    "UNI LINK AVAX ATOM ALGO ICP FIL VET HBAR SAND MANA AAVE MKR SNX CRV " +
    "COMP GRT ENJ CHZ BAT ZRX KSM NEO ONE FTM EGLD THETA XEC RUNE LUNA " +
    "APE APT ARB OP INJ SUI SEI TIA TON PEPE SHIB DOGE DAI USDT USDC BUSD " +
    "TUSD FRAX WBTC STETH CAKE LDO IMX RNDR AGIX FET OCEAN KAVA ROSE CELO " +
    "GALA AXS FLOW MINA ZIL QTUM WAVES DCR SC KAS AR AKT AMP GNO YFI SUSHI"
  )
    .split(/\s+/)
    .filter(Boolean),
);

/** ISO-4217 shape: exactly three uppercase letters. */
const CODE_RE = /^[A-Z]{3}$/;

function keep(code) {
  return CODE_RE.test(code) && !NON_CURRENCY.has(code);
}

// ── The enum, read from the source of truth ─────────────────────────────────
/**
 * Read `CURRENCY_CODES` out of `packages/spec/src/spec.ts` by parsing the array
 * literal, rather than duplicating the list here (a hard-coded copy would be the
 * exact drift this monitor exists to catch, one level up). Deliberately does NOT
 * import `@zframes/spec`: the workspace packages aren't dependencies of the repo
 * root, and this script otherwise needs no build, no install and no tsx — plain
 * node, like `audit-report.mjs`. Nothing about the count or the contents is
 * assumed; the list is free to be 19 codes or 150.
 */
function readEnumCodes() {
  const src = readFileSync(SPEC_PATH, "utf8");
  const match =
    /export\s+const\s+CURRENCY_CODES\s*(?::[^=]+)?=\s*\[([\s\S]*?)\]\s*as\s+const/.exec(
      src,
    );
  if (!match)
    throw new Error(
      `could not find the CURRENCY_CODES array literal in ${SPEC_PATH}`,
    );
  const codes = [...match[1].matchAll(/["'`]([A-Za-z]{3})["'`]/g)].map((m) =>
    m[1].toUpperCase(),
  );
  if (codes.length === 0)
    throw new Error(`CURRENCY_CODES parsed as empty in ${SPEC_PATH}`);
  return [...new Set(codes)];
}

// ── Sources ────────────────────────────────────────────────────────────────
async function getJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": "zframes-fx-coverage-monitor (+github actions)" },
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(
      `HTTP ${res.status} ${res.statusText}${
        // A keyless tier that started demanding a key answers 401/403 with a
        // message worth quoting verbatim in the issue.
        res.status === 401 || res.status === 403
          ? ` — ${text.slice(0, 160).replace(/\s+/g, " ")}`
          : ""
      }`,
    );
  try {
    return JSON.parse(text);
  } catch {
    // Non-JSON where JSON is documented = the endpoint changed shape (an HTML
    // interstitial, a Cloudflare challenge, a "this API has moved" page).
    throw new Error(
      `non-JSON response (${res.headers.get("content-type") ?? "?"}): ${text
        .slice(0, 120)
        .replace(/\s+/g, " ")}`,
    );
  }
}

/**
 * Each source reports the set of codes it quotes against USD, INCLUDING USD
 * itself (a source that answers a USD-based request trivially covers USD, but
 * none of them echo the base back inside `rates`).
 */
const SOURCES = [
  {
    id: "frankfurter",
    role: "primary",
    url: "https://api.frankfurter.dev/v1/latest?base=USD",
    async coverage() {
      const body = await getJson(this.url);
      if (!body?.rates || typeof body.rates !== "object")
        throw new Error("unexpected shape: no `rates` object");
      return new Set(["USD", ...Object.keys(body.rates)]);
    },
  },
  {
    id: "fxratesapi",
    role: "fallback 1",
    url: "https://api.fxratesapi.com/latest?base=USD",
    async coverage() {
      const body = await getJson(this.url);
      // `success: false` is how this host reports a key requirement / quota with
      // an HTTP 200, so it must be checked explicitly.
      if (body?.success === false)
        throw new Error(
          `success:false — ${JSON.stringify(body.error ?? body).slice(0, 160)}`,
        );
      if (!body?.rates || typeof body.rates !== "object")
        throw new Error("unexpected shape: no `rates` object");
      return new Set(["USD", ...Object.keys(body.rates)]);
    },
  },
  {
    id: "currency-api",
    role: "fallback 2",
    url: "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
    async coverage() {
      const body = await getJson(this.url);
      // Keys are LOWER-case here (`{"usd":{"thb":32.1,…}}`) — upper-case before
      // comparing with anything else in this script.
      if (!body?.usd || typeof body.usd !== "object")
        throw new Error("unexpected shape: no `usd` object");
      return new Set([
        "USD",
        ...Object.keys(body.usd).map((c) => c.toUpperCase()),
      ]);
    },
  },
  {
    id: "ecb",
    role: "fallback 3",
    // The ECB Data Portal itself. `provider-fx` hits a single series
    // (`D.THB.EUR.SP00.A`); for a COVERAGE list we ask the EXR currency
    // dimension wide open (`D..EUR.SP00.A`) with `lastNObservations=1`, which
    // returns one observation per series plus the SDMX structure that names the
    // CURRENCY dimension values. Two subtleties:
    //   • SDMX-JSON is index-based — a series key ("0:17:0:0:0") is positions
    //     into `structure.dimensions.series`, so CURRENCY must be located by id.
    //   • the dimension still lists LONG-DEAD currencies (GRD, SIT, CYP, and now
    //     BGN, which joined the euro), whose "last observation" is years old. So
    //     a currency counts as covered only if its latest observation is recent
    //     (see STALE_DAYS) — otherwise ECB would claim 44 currencies it stopped
    //     publishing.
    // ECB quotes only against EUR, so the set is EUR-based; that is fine here
    // because coverage is base-independent (the chain crosses through EUR).
    url: "https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?format=jsondata&lastNObservations=1",
    async coverage() {
      const body = await getJson(this.url);
      const dims = body?.structure?.dimensions ?? body?.structure?.dimension;
      const series = body?.dataSets?.[0]?.series;
      const days = dims?.observation?.[0]?.values;
      if (!series || !dims?.series || !days)
        throw new Error("unexpected SDMX shape");
      const at = dims.series.findIndex((d) => d.id === "CURRENCY");
      if (at < 0) throw new Error("no CURRENCY dimension");
      const codes = dims.series[at].values.map((v) => v.id);

      const STALE_DAYS = 21; // > a long holiday gap, << a discontinued series
      const cutoff = Date.now() - STALE_DAYS * 86_400_000;
      const live = new Set(["EUR"]); // EUR is the denominator, always quoted
      for (const [key, entry] of Object.entries(series)) {
        const code = codes[Number(key.split(":")[at])];
        if (!code) continue;
        for (const index of Object.keys(entry?.observations ?? {})) {
          const day = days[Number(index)]?.id;
          if (day && Date.parse(day) >= cutoff) live.add(code);
        }
      }
      if (live.size <= 1)
        throw new Error("no currency had a recent observation");
      return live;
    },
  },
];

// ── Probe ───────────────────────────────────────────────────────────────────
/** Escape hatch for verifying the outage path: point one source at a dead host. */
const BREAK = new Set(
  (process.env.FX_COVERAGE_BREAK ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

async function probe(source) {
  const attempts = [];
  for (let i = 0; i < ATTEMPTS; i++) {
    if (RETRY_PAUSE_MS[i])
      await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS[i]));
    try {
      if (BREAK.has(source.id))
        await getJson(
          "https://fx-coverage-monitor.invalid/simulated-outage.json",
        );
      const codes = await source.coverage();
      const kept = [...codes].filter(keep).sort();
      console.log(
        `  ok   ${source.id.padEnd(13)} ${String(kept.length).padStart(3)} currencies (attempt ${i + 1})`,
      );
      return { ...meta(source), status: "ok", codes: kept, attempts: i + 1 };
    } catch (error) {
      // Node's fetch throws a bare "fetch failed" — the useful part (DNS,
      // TLS, connection refused, timeout) is on `.cause`.
      const cause = error?.cause?.message ?? error?.cause?.code;
      attempts.push(
        (error instanceof Error ? error.message : String(error)) +
          (cause ? ` (${cause})` : ""),
      );
    }
  }
  console.log(`  FAIL ${source.id.padEnd(13)} ${attempts.at(-1)}`);
  return {
    ...meta(source),
    status: "fail",
    codes: [],
    attempts: ATTEMPTS,
    detail: attempts.at(-1),
    allAttempts: attempts,
  };
}

const meta = (s) => ({ source: s.id, role: s.role, url: s.url });

// ── Run ─────────────────────────────────────────────────────────────────────
const enumCodes = readEnumCodes();
console.log(
  `CURRENCY_CODES (from packages/spec/src/spec.ts): ${enumCodes.length} codes`,
);
console.log(`Probing ${SOURCES.length} keyless FX sources…`);

const results = [];
for (const source of SOURCES) results.push(await probe(source)); // serial: these are rate-limited free tiers

const dead = results.filter((r) => r.status === "fail");
const alive = results.filter((r) => r.status === "ok");

/** code → the sources that quote it (alive sources only). */
const support = new Map();
for (const r of alive)
  for (const code of r.codes)
    support.set(code, [...(support.get(code) ?? []), r.source]);

// Coverage comparison is only meaningful when every link answered — see the
// ATTEMPTS comment, defence (2).
const comparable = dead.length === 0;

const lostAll = []; // in the enum, 0 sources — renders an unconverted figure
const lostFallback = []; // in the enum, exactly 1 source — no resilience left
const newlyQualifying = []; // ≥2 sources, not in the enum — informational

if (comparable) {
  for (const code of enumCodes) {
    const n = (support.get(code) ?? []).length;
    if (n === 0) lostAll.push(code);
    else if (n === 1) lostFallback.push({ code, source: support.get(code)[0] });
  }
  const inEnum = new Set(enumCodes);
  for (const [code, sources] of support)
    if (sources.length >= 2 && !inEnum.has(code))
      newlyQualifying.push({ code, sources });
  newlyQualifying.sort((a, b) => a.code.localeCompare(b.code));
}

// ── Report ──────────────────────────────────────────────────────────────────
// A dead source is the highest-severity signal (the chain silently lost a link),
// then a code with no rate at all, then a code down to a single source. Newly
// qualifying codes are informational and never open an issue on their own.
const findingsCount = dead.length + lostAll.length + lostFallback.length;

const headline = dead.length
  ? `${dead.length} FX source(s) unreachable / changed shape`
  : lostAll.length
    ? `${lostAll.length} board currenc${lostAll.length === 1 ? "y has" : "ies have"} no rate source`
    : lostFallback.length
      ? `${lostFallback.length} board currenc${lostFallback.length === 1 ? "y" : "ies"} down to a single source`
      : "coverage intact";

const title = `💱 fx-coverage: ${headline}`;

const esc = (s) => String(s).replace(/\|/g, "\\|");
const sections = [];

if (dead.length) {
  sections.push(
    `### 🔴 Source unreachable or changed shape\n\n` +
      `The fallback chain has silently lost a link — \`getFxRates\` still succeeds while any source answers, ` +
      `so **nothing else in the repo can see this**. Each failure below reproduced **${ATTEMPTS}×** with pauses ` +
      `(${RETRY_PAUSE_MS.filter(Boolean).join("ms / ")}ms), so it is not a single blip. ` +
      `Check whether the keyless tier now demands a key or the host is gone, and replace the link in ` +
      `\`packages/provider-fx/src/sources.ts\`.\n\n` +
      `| source | role | error | url |\n|---|---|---|---|\n` +
      dead
        .map(
          (r) =>
            `| \`${r.source}\` | ${r.role} | ${esc(r.detail)} | ${r.url} |`,
        )
        .join("\n") +
      `\n\n_Coverage comparison **skipped** this run: with a source down, recomputing the ≥2-source set from the ` +
      `survivors would report healthy currencies as having lost their fallback._`,
  );
}

if (lostAll.length) {
  sections.push(
    `### 🔴 In \`CURRENCY_CODES\` but quoted by **no** source\n\n` +
      `A board set to one of these renders an **unconverted USD figure wearing the wrong symbol**. ` +
      `Remove them from \`CURRENCY_CODES\` (\`packages/spec/src/spec.ts\`) or add a source that quotes them.\n\n` +
      lostAll.map((c) => `- \`${c}\``).join("\n"),
  );
}

if (lostFallback.length) {
  sections.push(
    `### 🟠 In \`CURRENCY_CODES\` but down to a **single** source\n\n` +
      `Still correct today, but the resilience the enum was derived from is gone: one 5xx and these boards ` +
      `quietly fall back to quoting USD.\n\n` +
      `| code | only remaining source |\n|---|---|\n` +
      lostFallback.map((f) => `| \`${f.code}\` | \`${f.source}\` |`).join("\n"),
  );
}

if (newlyQualifying.length) {
  sections.push(
    `<details><summary>ℹ️ ${newlyQualifying.length} code(s) now quoted by ≥2 sources but not in \`CURRENCY_CODES\` (informational — never opens an issue)</summary>\n\n` +
      `A prompt to widen the enum, not a defect. Sanity-check each one is a **live** fiat currency a user would pick: ` +
      `the two broad sources also quote crypto and metals (filtered by \`NON_CURRENCY\`, which can lag a new token ` +
      `listing) and keep **defunct or redenominated** codes around as frozen historical rates (VEF, ZWL, LTL, BYR, ` +
      `HRK…), which is why this list stays informational instead of driving the enum automatically.\n\n` +
      newlyQualifying
        .map((n) => `- \`${n.code}\` — ${n.sources.join(", ")}`)
        .join("\n") +
      `\n</details>`,
  );
}

const body =
  (sections.length
    ? sections.join("\n\n")
    : `All ${enumCodes.length} \`CURRENCY_CODES\` entries are quoted by ≥2 of the ${SOURCES.length} keyless sources, and every source answered.`) +
  `\n\n---\n\n` +
  `| source | role | status | currencies |\n|---|---|---|---|\n` +
  results
    .map(
      (r) =>
        `| \`${r.source}\` | ${r.role} | ${r.status === "ok" ? "ok" : "**fail**"} | ${r.status === "ok" ? r.codes.length : "—"} |`,
    )
    .join("\n") +
  `\n\n_Run: ${new Date().toISOString()} · \`CURRENCY_CODES\`: ${enumCodes.length} codes · ` +
  `≥2-source set: ${comparable ? [...support.values()].filter((s) => s.length >= 2).length : "not computed"}._`;

writeFileSync(
  REPORT_PATH,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      title,
      body,
      findingsCount,
      enumCodes,
      comparable,
      // `allAttempts` on a failed source is kept deliberately: the uploaded
      // artifact is where you check whether all 3 tries failed the SAME way
      // (a real outage) or differently (a wobbly host).
      sources: results,
      lostAll,
      lostFallback,
      newlyQualifying,
    },
    null,
    2,
  ),
);

console.log(`\n${headline}`);
if (lostAll.length) console.log(`  no source:      ${lostAll.join(" ")}`);
if (lostFallback.length)
  console.log(
    `  single source:  ${lostFallback.map((f) => `${f.code}(${f.source})`).join(" ")}`,
  );
if (newlyQualifying.length)
  console.log(
    `  newly qualifying (informational): ${newlyQualifying.map((n) => n.code).join(" ")}`,
  );
console.log(`${findingsCount} finding(s) → ${REPORT_PATH}`);
process.exit(0);
