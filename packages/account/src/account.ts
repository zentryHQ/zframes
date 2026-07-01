import { createHmac } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
// Imported by the package subpath (NOT relative "./store") so Vite's Node
// config-loader can resolve it when it loads this module via `@zframes/core/account`
// — same contract this file uses for `@zframes/core/routes`.
import { credentialsFile, storeHome } from "@zframes/store";
import type { Holding, Portfolio } from "@zframes/spec/types";

/**
 * The keyed-account tier's Node-only backend: local credential storage plus a
 * server-side signed read relay for connected CEX accounts (Binance for v1).
 * Shared verbatim by the dev Vite plugin (`./vite`) and the CLI's `serve`, like
 * the spec/proxy contract in `./serve`.
 *
 * Why a relay at all: a keyed account needs HMAC-signed requests carrying the
 * user's secret, which must never reach the browser. So the secret lives in a
 * local file (NEVER the spec), the signing happens here in Node, and the browser
 * only ever sees the resulting portfolio JSON. The keyless on-chain wallet does
 * NOT use this path — it reads public data directly.
 *
 * Node-only and React-free (node builtins + type-only imports). Route strings
 * come from `@zframes/core/routes` by package subpath (NOT relative `./routes`)
 * so Vite's Node config-loader can resolve them — same contract `./serve` uses.
 */
export {
  ACCOUNT_PORTFOLIO_ROUTE,
  ACCOUNT_CREDENTIALS_ROUTE,
} from "@zframes/spec/routes";

// Minimal structural shapes satisfied by both Node's http and Vite's connect
// middleware, so neither this module nor `./vite` needs a node/vite type dep.
interface ReqLike {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: "data", cb: (chunk: Buffer) => void): unknown;
  on(event: "end", cb: () => void): unknown;
  destroy(): unknown;
}
interface ResLike {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

function json(res: ResLike, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Reject any request whose Host (or Origin) isn't loopback. The server already
 * binds 127.0.0.1, but this also defeats DNS-rebinding: a remote page that
 * rebinds its name to 127.0.0.1 still sends its own hostname in `Host`, so it
 * can't reach the credential routes or read a portfolio through the relay.
 */
export function isLocalRequest(req: ReqLike): boolean {
  const hostname = String(req.headers.host ?? "").split(":")[0];
  if (!LOCAL_HOSTS.has(hostname)) return false;
  const origin = req.headers.origin;
  if (origin !== undefined) {
    try {
      if (!LOCAL_HOSTS.has(new URL(String(origin)).hostname)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// Connect/disconnect bodies are tiny ({source,key,secret}); cap hard.
const MAX_BODY_BYTES = 8_192;
function readBody(req: ReqLike, res: ResLike): Promise<string | null> {
  return new Promise((resolveBody) => {
    let body = "";
    let aborted = false;
    req.on("data", (chunk: Buffer) => {
      if (aborted) return;
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        aborted = true;
        json(res, 413, { ok: false, error: "body too large" });
        req.destroy();
        resolveBody(null);
      }
    });
    req.on("end", () => {
      if (!aborted) resolveBody(body);
    });
  });
}

// ---------------------------------------------------------------------------
// Credential storage — a local file outside the project, NEVER the spec.
// ---------------------------------------------------------------------------

export interface Credential {
  key: string;
  secret: string;
}
type CredentialStore = Record<string, Credential>;

// Credentials live in the XDG home (~/.config/zframes/credentials.json).
async function readStore(): Promise<CredentialStore> {
  try {
    const parsed = JSON.parse(
      await readFile(credentialsFile(), "utf8"),
    ) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as CredentialStore)
      : {};
  } catch {
    return {};
  }
}

async function writeStore(store: CredentialStore): Promise<void> {
  await mkdir(storeHome(), { recursive: true, mode: 0o700 });
  // mkdir's `mode` is ignored when the dir already exists (e.g. created 0755 by
  // a prior `zframes init`), so force 0700 — this home holds the secret.
  await chmod(storeHome(), 0o700).catch(() => {});
  await writeFile(credentialsFile(), `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

/** Env-var fallback (e.g. ZFRAMES_BINANCE_KEY / _SECRET), for headless/CI use. */
function envCredential(source: string): Credential | null {
  const up = source.toUpperCase();
  const key = process.env[`ZFRAMES_${up}_KEY`];
  const secret = process.env[`ZFRAMES_${up}_SECRET`];
  return key && secret ? { key, secret } : null;
}

async function getCredential(source: string): Promise<Credential | null> {
  const store = await readStore();
  return store[source] ?? envCredential(source);
}

/** Mask a key for status display — only the last 4 chars ever leave Node. */
export function maskKey(key: string): string {
  return key.length <= 4 ? "…" : `…${key.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Source adapters — keyed CEX accounts only (the keyless wallet skips this).
// ---------------------------------------------------------------------------

// Stablecoins have no Hyperliquid mid, so the adapter values them ~$1 directly;
// every other asset is left for the frames to price live from streamed mids.
const STABLES = new Set([
  "USDT",
  "USDC",
  "BUSD",
  "DAI",
  "FDUSD",
  "TUSD",
  "USDP",
  "USD",
]);

interface SourceAdapter {
  /** Verify a credential with one signed read call; throws on failure. */
  verify(cred: Credential): Promise<void>;
  /** Read the account's holdings into a normalized, source-agnostic Portfolio. */
  portfolio(cred: Credential): Promise<Portfolio>;
}

const BINANCE_BASE = "https://api.binance.com";
const BINANCE_TIMEOUT_MS = 15_000;

/** HMAC-SHA256 of the query string with the API secret (Binance's signing). */
export function signBinance(query: string, secret: string): string {
  return createHmac("sha256", secret).update(query).digest("hex");
}

/** Map Binance's /api/v3/account balances into normalized holdings (>0 only). */
export function binanceHoldings(data: {
  balances?: Array<{ asset: string; free: string; locked: string }>;
}): Holding[] {
  return (data.balances ?? [])
    .map((b) => ({
      symbol: b.asset,
      amount: Number(b.free) + Number(b.locked),
    }))
    .filter((b) => Number.isFinite(b.amount) && b.amount > 0)
    .map((b) => ({
      symbol: b.symbol,
      amount: b.amount,
      valueUsd: STABLES.has(b.symbol.toUpperCase()) ? b.amount : undefined,
    }));
}

async function binanceAccount(
  cred: Credential,
  nowMs: number,
): Promise<unknown> {
  const query = `timestamp=${nowMs}&recvWindow=5000`;
  const signature = signBinance(query, cred.secret);
  const res = await fetch(
    `${BINANCE_BASE}/api/v3/account?${query}&signature=${signature}`,
    {
      headers: { "X-MBX-APIKEY": cred.key },
      signal: AbortSignal.timeout(BINANCE_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    // Binance error bodies carry no secret; surface the status for the UI.
    throw new Error(`binance ${res.status}`);
  }
  return res.json();
}

const binanceAdapter: SourceAdapter = {
  async verify(cred) {
    await binanceAccount(cred, Date.now());
  },
  async portfolio(cred) {
    const data = (await binanceAccount(cred, Date.now())) as Parameters<
      typeof binanceHoldings
    >[0];
    return {
      source: "binance",
      label: "Binance",
      holdings: binanceHoldings(data),
      asOf: Date.now(),
    };
  },
};

/** Keyed sources reachable through the relay. The keyless wallet is NOT here. */
const ADAPTERS: Record<string, SourceAdapter> = { binance: binanceAdapter };

function sourceParam(req: ReqLike): string {
  const query = (req.url ?? "").split("?")[1] ?? "";
  return new URLSearchParams(query).get("source") ?? "";
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET `/__zframes/account/portfolio?source=binance`: read the connected
 * account's holdings server-side (signing with the local secret) and return the
 * normalized Portfolio. 401 when no credential is stored — the frame renders its
 * connect-state. The secret never appears in the response.
 */
export async function handleAccountPortfolio(
  req: ReqLike,
  res: ResLike,
): Promise<void> {
  if (!isLocalRequest(req))
    return json(res, 403, { ok: false, error: "non-local origin" });
  if (req.method !== "GET" && req.method !== "HEAD")
    return json(res, 405, { ok: false, error: "GET only" });
  const source = sourceParam(req);
  const adapter = ADAPTERS[source];
  if (!adapter)
    return json(res, 400, { ok: false, error: `unknown source: ${source}` });
  const cred = await getCredential(source);
  if (!cred)
    return json(res, 401, {
      ok: false,
      connected: false,
      error: "not connected",
    });
  try {
    json(res, 200, await adapter.portfolio(cred));
  } catch (error) {
    json(res, 502, { ok: false, error: String(error) });
  }
}

/**
 * `/__zframes/account/credentials` — the in-app connect form's backend:
 *  - GET    `?source=binance` → `{ connected, keyMasked }` (never the secret)
 *  - POST   `{source,key,secret}` → verify with one read call, then store
 *  - DELETE `{source}` → forget the stored credential
 *
 * POST/DELETE are CSRF-guarded (JSON content-type forces a CORS preflight a
 * hostile page can't satisfy) and loopback-only (isLocalRequest). The secret is
 * stored server-side and never echoed back.
 */
export async function handleAccountCredentials(
  req: ReqLike,
  res: ResLike,
): Promise<void> {
  if (!isLocalRequest(req))
    return json(res, 403, { ok: false, error: "non-local origin" });
  const method = req.method ?? "GET";

  if (method === "GET") {
    const cred = await getCredential(sourceParam(req));
    return json(res, 200, {
      connected: !!cred,
      keyMasked: cred ? maskKey(cred.key) : null,
    });
  }

  if (method !== "POST" && method !== "DELETE")
    return json(res, 405, { ok: false, error: "method not allowed" });

  if (!String(req.headers["content-type"] ?? "").includes("application/json"))
    return json(res, 415, {
      ok: false,
      error: "content-type must be application/json",
    });

  const raw = await readBody(req, res);
  if (raw === null) return; // 413 already sent
  let parsed: { source?: string; key?: string; secret?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json(res, 400, { ok: false, error: "invalid json" });
  }
  const source = String(parsed.source ?? "");
  if (!ADAPTERS[source])
    return json(res, 400, { ok: false, error: `unknown source: ${source}` });

  if (method === "DELETE") {
    const store = await readStore();
    delete store[source];
    await writeStore(store);
    return json(res, 200, { ok: true, connected: false });
  }

  // POST = connect: verify the key works (and is reachable) before storing.
  const key = String(parsed.key ?? "").trim();
  const secret = String(parsed.secret ?? "").trim();
  if (!key || !secret)
    return json(res, 400, { ok: false, error: "key and secret required" });
  try {
    await ADAPTERS[source].verify({ key, secret });
  } catch (error) {
    return json(res, 400, {
      ok: false,
      verified: false,
      error: `verification failed: ${String(error)}`,
    });
  }
  const store = await readStore();
  store[source] = { key, secret };
  await writeStore(store);
  return json(res, 200, {
    ok: true,
    verified: true,
    connected: true,
    keyMasked: maskKey(key),
  });
}
