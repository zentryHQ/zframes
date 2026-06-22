import { readFile, writeFile } from "node:fs/promises";

/**
 * The dashboard read/write contract, shared verbatim by the dev Vite plugin
 * (`./vite`) and the CLI's `serve` http server. Both hand these helpers the
 * same Node `(req, res)` shape, so the in-browser editor's load + save round
 * trip identically whether the app runs under `vite dev` or `zframes serve`.
 *
 * Node-only and React-free (imports just `node:fs/promises`) so the CLI can
 * bundle it with zod as its lone runtime dep.
 */

// The reserved route strings live in `routes` (React-free AND Node-free) so the
// browser bundle can import them without pulling in this file's `node:fs`
// dependency. Re-exported here for the Node servers (`./vite`, the CLI) that
// import them alongside the handlers from `@zframes/core/serve`. Imported by
// package subpath (NOT relative `./routes`) because this file is reached by
// Vite's Node config-loader, which can't resolve a relative extensionless path.
export {
  DASHBOARD_READ_ROUTE,
  DASHBOARD_WRITE_ROUTE,
  DASHBOARD_PROXY_ROUTE,
} from "@zframes/core/routes";

// Hard cap on the request body — a small spec file, never a large upload.
const MAX_BODY_BYTES = 2_000_000;

/**
 * Hosts the proxy will relay to — official/open financial-data surfaces only.
 * An allowlist (not an open proxy) so a dashboard or page can't turn the local
 * serve process into an SSRF relay to arbitrary or internal hosts.
 */
const PROXY_ALLOW_HOSTS = new Set<string>([
  "data.sec.gov",
  "www.sec.gov",
  "efts.sec.gov",
  "www.federalreserve.gov",
  "www.financialresearch.gov",
  "www.nasdaqtrader.com",
  "www.nyse.com",
  "markets.newyorkfed.org",
  "api.fiscaldata.treasury.gov",
  "api.bls.gov",
  "cdn.finra.org",
  // News-outlet RSS feeds (CORS-blocked, so the news-feed frame reads them
  // through here). Headlines + links only; no keys.
  "www.coindesk.com",
  "cointelegraph.com",
  "decrypt.co",
  "www.cnbc.com",
  "www.nasdaq.com",
  "news.google.com",
]);

// SEC's companyfacts blob is a few MB; allow headroom but bound it.
const PROXY_MAX_BYTES = 16_000_000;
const PROXY_TIMEOUT_MS = 20_000;
// A real desktop Chrome UA: SEC and the other official hosts accept it, so the
// keyless default works out of the box. `--contact` swaps in a polite UA.
const PROXY_DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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

/**
 * GET the spec: stream the file's bytes verbatim as JSON, `no-store` so a
 * post-save reload always re-reads disk. Validation stays in the renderer, so
 * a malformed file still reaches the browser (which shows a spec-error card).
 * A missing file is a 404 the client renders as its "couldn't load" state.
 */
export async function handleSpecRead(
  absFile: string,
  res: ResLike,
): Promise<void> {
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "application/json");
  try {
    res.statusCode = 200;
    res.end(await readFile(absFile, "utf8"));
  } catch (error) {
    res.statusCode = (error as { code?: string }).code === "ENOENT" ? 404 : 500;
    res.end(JSON.stringify({ ok: false, error: String(error) }));
  }
}

/**
 * PUT/POST the spec: CSRF-guarded (requires a JSON content-type, which forces
 * a CORS preflight a malicious page can't satisfy), size-capped, then
 * parse + re-stringify so the file always lands valid and consistently
 * formatted (2-space, trailing newline). Writes only `absFile` — the request
 * body never names a path, so there is no write-side traversal vector.
 */
export function handleSpecWrite(
  req: ReqLike,
  res: ResLike,
  absFile: string,
): void {
  if (req.method !== "PUT" && req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }
  if (!String(req.headers["content-type"] ?? "").includes("application/json")) {
    res.statusCode = 415;
    res.end();
    return;
  }
  let body = "";
  let aborted = false;
  req.on("data", (chunk: Buffer) => {
    if (aborted) return;
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      aborted = true;
      res.statusCode = 413;
      res.end();
      req.destroy();
    }
  });
  req.on("end", async () => {
    if (aborted) return;
    try {
      const json = JSON.parse(body);
      await writeFile(absFile, `${JSON.stringify(json, null, 2)}\n`, "utf8");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, file: absFile }));
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: String(error) }));
    }
  });
}

function proxyError(res: ResLike, status: number, error: string): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: false, error }));
}

/**
 * GET `/__zframes/proxy?url=<encoded https URL>`: relay an allowlisted
 * official-data host to the browser, same-origin, so CORS-blocked or UA-walled
 * sources are reachable client-side without a backend or keys. GET-only,
 * https-only, host-allowlisted (no open-proxy / SSRF), size- and time-bounded.
 * `userAgent` lets the host send a polite contact UA (SEC fair-access); the
 * default is a browser UA the official sources accept.
 */
export async function handleProxy(
  req: ReqLike,
  res: ResLike,
  opts: { userAgent?: string } = {},
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    proxyError(res, 405, "proxy is GET-only");
    return;
  }
  const query = (req.url ?? "").split("?")[1] ?? "";
  const raw = new URLSearchParams(query).get("url");
  let target: URL;
  try {
    target = new URL(raw ?? "");
  } catch {
    proxyError(res, 400, "missing or invalid ?url=");
    return;
  }
  if (target.protocol !== "https:") {
    proxyError(res, 400, "only https targets are allowed");
    return;
  }
  if (!PROXY_ALLOW_HOSTS.has(target.hostname)) {
    proxyError(res, 403, `host not allowed: ${target.hostname}`);
    return;
  }
  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent": opts.userAgent ?? PROXY_DEFAULT_UA,
        Accept: "application/json,text/plain,*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
    const text = await upstream.text();
    if (text.length > PROXY_MAX_BYTES) {
      proxyError(res, 502, "upstream response too large");
      return;
    }
    res.statusCode = upstream.status;
    res.setHeader(
      "content-type",
      upstream.headers.get("content-type") ?? "application/octet-stream",
    );
    res.setHeader("cache-control", "no-store");
    res.end(text);
  } catch (error) {
    proxyError(res, 502, `upstream fetch failed: ${String(error)}`);
  }
}
