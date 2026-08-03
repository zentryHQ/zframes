import { readFile, writeFile } from "node:fs/promises";

// By package subpath, not a relative `./spec` — this file is reached by Vite's
// Node config-loader, which can't resolve a relative extensionless path.
import { DashboardSpecSchema } from "@zframes/spec/spec";

/**
 * The dashboard read/write contract, shared verbatim by the dev Vite plugin
 * (`@zframes/vite`) and the CLI's `serve` http server. Both hand these helpers the
 * same Node `(req, res)` shape, so the in-browser editor's load + save round
 * trip identically whether the app runs under `vite dev` or `zframes serve`.
 *
 * Node-only and React-free (imports just `node:fs/promises`) so the CLI can
 * bundle it with zod as its lone runtime dep.
 */

// The reserved route strings live in `routes` (React-free AND Node-free) so the
// browser bundle can import them without pulling in this file's `node:fs`
// dependency. Re-exported here for the Node servers (`./vite`, the CLI) that
// import them alongside the handlers from `@zframes/serve/serve`. Imported by
// package subpath (NOT relative `./routes`) because this file is reached by
// Vite's Node config-loader, which can't resolve a relative extensionless path.
export {
  DASHBOARD_READ_ROUTE,
  DASHBOARD_WRITE_ROUTE,
  DASHBOARD_PROXY_ROUTE,
} from "@zframes/spec/routes";

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
  "home.treasury.gov",
  "api.bls.gov",
  "cdn.finra.org",
  // Central-bank FX history, all keyless but CORS-blocked, and each the only
  // source for pairs/depth nothing CORS-open publishes. They answer CSV rather
  // than JSON, which the relay passes through untouched.
  //   fred.stlouisfed.org — Fed H.10 dailies via the keyless `fredgraph.csv`
  //     path (no API key on that route); DEXTHUS is the only US-official daily
  //     USD/THB series, and the Bank of Thailand has no keyless API at all.
  //   www.bankofengland.co.uk — IADB CSV, daily GBP spot back to 1975-01-02
  //     (the deepest daily FX history found), several series per request.
  //   www.rba.gov.au — one daily CSV with the widest APAC basket from a central
  //     bank (23 AUD pairs incl. THB/VND/IDR/PGK/TWD).
  "fred.stlouisfed.org",
  "www.bankofengland.co.uk",
  "www.rba.gov.au",
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
/**
 * Redirects are followed by hand (`redirect: "manual"`) so EVERY hop's hostname
 * is re-checked against `PROXY_ALLOW_HOSTS` — `redirect: "follow"` would let an
 * allowlisted host with an open redirect land the request on an arbitrary host
 * and relay its body verbatim (SSRF). Real chains are short: the empirically
 * observed ones are single-hop, same-host canonicalisations (Bank of England's
 * IADB 302 to `_iadb-FromShowColumns.asp`, CoinDesk's RSS 308 to the
 * trailing-slash-less path), so 5 is generous headroom. Exceeding the cap is an
 * error, never a silently truncated relay.
 */
const PROXY_MAX_REDIRECTS = 5;
/**
 * The redirect statuses that carry a `Location`. 303 (and, in practice, 301 and
 * 302) mean "GET the next hop" — the proxy is GET-only anyway, so every hop is
 * a GET and no method rewriting is needed for 307/308 either.
 */
const PROXY_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
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
 * parse + validate + re-stringify so the file always lands as a valid spec,
 * consistently formatted (2-space, trailing newline). Writes only `absFile` —
 * the request body never names a path, so there is no write-side traversal
 * vector.
 *
 * The schema check is what makes this route non-destructive. This is the ONLY
 * path by which a human edit reaches `dashboard.json`, there is no backup and
 * no undo, and a body can be perfectly good JSON while being nothing like a
 * spec (a truncated-but-valid payload, an editor bug, an agent writing the
 * wrong shape). Validating first means such a write is refused with the user's
 * board still on disk, rather than replacing it and answering 200.
 *
 * Deliberately writes the request's own JSON, NOT `safeParse`'s output: the
 * parsed value has every schema default materialised and legacy fields
 * migrated, so writing it back would rewrite the user's hand-readable file with
 * a large surprising diff on every save. Validation gates the write; it does
 * not reformat the spec.
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
      const parsed = DashboardSpecSchema.safeParse(json);
      if (!parsed.success) {
        // Field paths in `lint`'s wording, so the same spelling of a problem
        // reads the same whether it surfaced from `zframes lint` or a Save.
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            ok: false,
            error: "not a valid dashboard spec — nothing was written",
            issues: parsed.error.issues.map(
              (issue) =>
                `${issue.path.join(".") || "(root)"}: ${issue.message}`,
            ),
          }),
        );
        return;
      }
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
 *
 * Redirects are followed, because real official sources use them (Bank of
 * England canonicalises its IADB CSV path, CoinDesk's RSS drops a trailing
 * slash) — but every single hop is re-validated: https-only (an https→http
 * downgrade is refused) and hostname-on-allowlist. A hop that leaves the
 * allowlist answers 403 and NOTHING that host said is read or relayed; a 3xx
 * with no usable `Location`, or a chain longer than `PROXY_MAX_REDIRECTS`, is a
 * 502 rather than a partial answer.
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
    // One timeout for the whole chain, so following hops can't extend the
    // bound; each hop shares the same signal.
    const signal = AbortSignal.timeout(PROXY_TIMEOUT_MS);
    const headers = {
      "User-Agent": opts.userAgent ?? PROXY_DEFAULT_UA,
      Accept: "application/json,text/plain,*/*",
    };
    let current = target;
    let upstream = await fetch(current.toString(), {
      headers,
      redirect: "manual",
      signal,
    });
    for (let hop = 0; PROXY_REDIRECT_STATUSES.has(upstream.status); hop += 1) {
      if (hop >= PROXY_MAX_REDIRECTS) {
        proxyError(res, 502, `too many redirects (>${PROXY_MAX_REDIRECTS})`);
        return;
      }
      const location = upstream.headers.get("location");
      let next: URL | undefined;
      if (location) {
        // A `Location` may be relative — resolve it against the hop it came from.
        try {
          next = new URL(location, current);
        } catch {
          next = undefined;
        }
      }
      if (!next) {
        proxyError(
          res,
          502,
          `upstream ${upstream.status} with no usable Location header`,
        );
        return;
      }
      // Same two invariants as the entry check, re-applied per hop: an
      // https→http downgrade and an off-allowlist host are both refusals, and
      // neither reads a byte of the redirect target's body.
      if (next.protocol !== "https:") {
        proxyError(
          res,
          403,
          `redirect left https: ${next.protocol.replace(":", "")}`,
        );
        return;
      }
      if (!PROXY_ALLOW_HOSTS.has(next.hostname)) {
        proxyError(res, 403, `redirect host not allowed: ${next.hostname}`);
        return;
      }
      current = next;
      upstream = await fetch(current.toString(), {
        headers,
        redirect: "manual",
        signal,
      });
    }
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
