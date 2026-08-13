import { readFile, writeFile } from "node:fs/promises";

// By package subpath, not a relative `./spec` — this file is reached by Vite's
// Node config-loader, which can't resolve a relative extensionless path.
import { DashboardSpecSchema } from "@zframes/spec/spec";

// The proxy's host allowlist (+ per-host justifications) lives in its own
// module; imported by package subpath for the same Node config-loader reason.
import { PROXY_ALLOW_HOSTS } from "@zframes/serve/proxy-allowlist";

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
 * Default cap on a relayed body. SEC's companyfacts blob is a few MB, so this
 * allows headroom but bounds it — tuned for the loopback CLI, where the only
 * limit is the user's own memory. A HOSTED mount must lower it to its
 * platform's response cap via `opts.maxBytes`: on Vercel a function response
 * over ~4.5 MB is a platform error the frame can't read as a 502.
 */
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

/**
 * Hosts that must keep the browser UA even when the operator passes
 * `--contact`. `--contact` exists for SEC's fair-access policy, which asks for
 * a contact address — but it swaps the UA for EVERY relayed host, and
 * api.nasdaq.com's bot mitigation answers a non-browser UA by dropping the
 * connection rather than returning a status. So a user who politely identifies
 * themselves for the SEC's benefit would silently lose every Nasdaq card, with
 * nothing in the logs but timeouts. Narrow the courtesy to the hosts that
 * actually asked for it.
 */
const PROXY_FORCE_BROWSER_UA = new Set<string>(["api.nasdaq.com"]);

function uaFor(hostname: string, contactUa?: string): string {
  if (!contactUa || PROXY_FORCE_BROWSER_UA.has(hostname))
    return PROXY_DEFAULT_UA;
  return contactUa;
}

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
 * Per-mount proxy tuning. Every field is optional and every default reproduces
 * the loopback CLI's behaviour, so the mounts that pass nothing (`vite dev`,
 * Storybook) are unaffected — these exist because the SAME relay also runs on a
 * shared host (the explorer's Next route), where the platform imposes bounds a
 * localhost process doesn't have.
 */
export interface ProxyOptions {
  /**
   * A polite contact UA (SEC fair-access). The default is a browser UA the
   * official sources accept; `PROXY_FORCE_BROWSER_UA` hosts ignore this.
   */
  userAgent?: string;
  /**
   * Cap on the relayed body, in bytes. Defaults to `PROXY_MAX_BYTES` (16 MB).
   * Lower it to the host platform's response limit so an oversized payload
   * answers a clean 502 the frame degrades on, rather than a platform error.
   */
  maxBytes?: number;
  /**
   * Per-hostname relay timeout (ms), overriding `PROXY_TIMEOUT_MS` for hosts
   * that are legitimately slower than the default. Keyed by the hostname of the
   * REQUESTED url, and — like the timeout itself — fixed for the whole redirect
   * chain, so a hop can neither extend nor shorten the bound it was entered
   * under.
   */
  timeoutMsByHost?: Record<string, number>;
}

/**
 * GET `/__zframes/proxy?url=<encoded https URL>`: relay an allowlisted
 * official-data host to the browser, same-origin, so CORS-blocked or UA-walled
 * sources are reachable client-side without a backend or keys. GET-only,
 * https-only, host-allowlisted (no open-proxy / SSRF), size- and time-bounded.
 * `userAgent` lets the host send a polite contact UA (SEC fair-access); the
 * default is a browser UA the official sources accept. The size and time bounds
 * are per-mount (`ProxyOptions`) so a hosted mount can hold its platform's
 * limits without moving the CLI's.
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
  opts: ProxyOptions = {},
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
  const maxBytes = opts.maxBytes ?? PROXY_MAX_BYTES;
  try {
    // One timeout for the whole chain, so following hops can't extend the
    // bound; each hop shares the same signal. A host may be given a longer
    // bound than the shared default, but only per the ENTRY hostname — reading
    // it per hop would let a redirect widen its own deadline.
    const signal = AbortSignal.timeout(
      opts.timeoutMsByHost?.[target.hostname] ?? PROXY_TIMEOUT_MS,
    );
    const headers = {
      "User-Agent": uaFor(target.hostname, opts.userAgent),
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
    // Refuse an over-cap payload BEFORE buffering it, when the upstream says
    // how big it is: the relay reads the whole body into memory, so a 17 MB file
    // is otherwise fully downloaded only to be thrown away (FHFA's combined
    // hpi_master.csv is exactly that case). Only an early-out, never the
    // authoritative check — a gzipped response declares its COMPRESSED length
    // while `.text()` hands back the larger decoded body, so this can only
    // under-estimate, never falsely reject.
    const declared = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      proxyError(res, 502, "upstream response too large");
      return;
    }
    const text = await upstream.text();
    // Measured in BYTES, not `text.length`'s UTF-16 code units: the cap bounds
    // what goes on the wire (and what a hosted platform will accept as a
    // response), and any non-ASCII content makes those two numbers differ — a
    // CJK-heavy payload is up to 3x its unit count in UTF-8.
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
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
