import { handleProxy } from "@zframes/serve/serve";
import { PROXY_ALLOW_HOSTS } from "@zframes/serve/proxy-allowlist";

// Reached via a next.config rewrite: the browser calls `/__zframes/proxy?url=…`
// (a shared constant in @zframes/core), which Next rewrites here. It can't live
// at app/__zframes/proxy because Next treats `_`-prefixed folders as PRIVATE
// (excluded from routing), so an underscore route file never registers.
//
// @zframes/serve/serve imports node:fs/promises, so this must run on the Node
// runtime, not Edge. `force-dynamic` keeps it per-request (it's a live relay);
// edge caching is driven by the CDN-Cache-Control header below, orthogonal to
// Next's build-time dynamic flag.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Without this the invocation is killed at the platform default (10s on Hobby,
// 15s on Pro) — BELOW the relay's own 20s timeout, so a slow upstream surfaced
// as a platform error instead of the 502 the frames degrade on, and the proxy's
// bounded-and-reported failure path was unreachable. 60s is the ceiling that
// holds on every plan, and it is a cap on a slow request, not a reservation:
// only the FHFA override below can run past 20s.
export const maxDuration = 60;

// Per-source edge-cache TTLs (seconds). These official sources change slowly, so
// caching at Vercel's edge is the SEC fair-access + cost fix: a CDN HIT is served
// from the edge WITHOUT invoking this function, so 1,000 viewers of the same
// macro dashboard hit the upstream once per TTL. Mirrors the TtlCache cadences.
const HOUR = 3600;
const TTL_BY_HOST: Record<string, number> = {
  // SEC / EDGAR
  "data.sec.gov": 6 * HOUR,
  "www.sec.gov": 6 * HOUR,
  "efts.sec.gov": 6 * HOUR,
  // Treasury
  "api.fiscaldata.treasury.gov": 3 * HOUR,
  "home.treasury.gov": 3 * HOUR,
  // Fed / NY Fed / OFR
  "www.federalreserve.gov": 6 * HOUR,
  "markets.newyorkfed.org": 3 * HOUR,
  "www.financialresearch.gov": 3 * HOUR,
  // BLS
  "api.bls.gov": 12 * HOUR,
  // FRED — daily/weekly published series behind fredgraph.csv
  "fred.stlouisfed.org": 3 * HOUR,
  // FHFA — quarterly HPI. The metro file is ~4 MB, so a short TTL is the one
  // that actually costs here: the data only changes four times a year.
  "www.fhfa.gov": 12 * HOUR,
  // FINRA
  "cdn.finra.org": 3 * HOUR,
  // Exchanges (halts / reference)
  "www.nasdaqtrader.com": 3 * HOUR,
  "www.nyse.com": 6 * HOUR,
  // News RSS — fresher
  "www.coindesk.com": 900,
  "cointelegraph.com": 900,
  "decrypt.co": 900,
  "www.cnbc.com": 900,
  "www.nasdaq.com": 900,
  "news.google.com": 900,
};
const DEFAULT_TTL = HOUR;

/**
 * Edge TTL for a relay that did NOT answer 200. Short, and deliberately without
 * `stale-while-revalidate` — an error must not outlive its window, or a
 * recovered upstream stays broken at the edge.
 *
 * Only some of these are cacheable at all: Vercel's CDN caches 200/404/410 and
 * the 3xx redirects, and nothing else. So this bites on an upstream **404** — a
 * board naming a CIK or ticker the source doesn't have, which every visitor's
 * retry loop re-asked upstream because the old code sent `no-store` on
 * everything. A 502/403 stays uncacheable whatever we send; the in-flight map
 * below is what bounds those.
 */
const ERROR_TTL = 60;

/**
 * The relay's response cap on THIS host. A Vercel function response over
 * ~4.5 MB fails at the platform, which reaches the browser as neither a body
 * nor the proxy's own 502 — so the cap has to bind inside the handler, below
 * the platform's. It must stay above SEC's biggest real payload: NVDA's
 * companyfacts blob measured 4,039,082 bytes and backs the landing showcase's
 * financials card. The CLI keeps its own 16 MB default (loopback, no such limit).
 */
const MAX_RELAY_BYTES = 4_400_000;

/**
 * Hosts too slow for the shared 20s relay timeout.
 *
 * www.fhfa.gov serves `hpi_at_metro.csv` (~4.2 MB) at ~31 KB/s — measured
 * 2026-08-10: 779 KB in 25s — so the whole file needs ~135s and the default
 * timeout aborted it every time, burning an invocation and 502-ing the metro
 * frames. 50s doesn't make a 31 KB/s day succeed either, but it (a) lets the
 * file through whenever FHFA is having a normal day (>85 KB/s), and (b) leaves
 * the relay room to FINISH and populate the 12h edge cache after the frame's
 * own 30s client abort, so the next poll is a HIT rather than another attempt.
 * Capped well under `maxDuration` so the timeout path, not the platform,
 * reports the failure.
 */
const TIMEOUT_MS_BY_HOST: Record<string, number> = {
  "www.fhfa.gov": 50_000,
};

interface RelayResult {
  status: number;
  body: string;
  contentType: string;
}

/**
 * Relays in flight, keyed by target URL. A cold edge cache lets every concurrent
 * viewer of the same board through to the function at once, and each one was a
 * separate upstream hit on a rate-limited official source; here they await one
 * relay and share its result. Module scope, so it spans the requests one warm
 * instance handles concurrently — not a global cache (Vercel may spread a burst
 * over several instances, and this survives no cold start). The edge TTLs above
 * remain the real fan-out fix; this covers the window before one is populated.
 */
const inFlight = new Map<string, Promise<RelayResult>>();

async function relay(request: Request): Promise<RelayResult> {
  // handleProxy is Node (req,res)-shaped. For the proxy path it reads only
  // `req.method` + `req.url` (a full URL it splits on '?') and writes via
  // `res.statusCode` / `res.setHeader` / `res.end` — so a tiny shim buffers its
  // output, which we then convert to a Web Response. This reuses core's host
  // allowlist + https/GET/size/timeout guards verbatim (single source of truth).
  const reqLike = {
    method: request.method,
    url: request.url,
    headers: {},
  } as unknown as Parameters<typeof handleProxy>[0];

  let status = 200;
  const headers = new Headers();
  let body: string | undefined;
  const resLike = {
    get statusCode() {
      return status;
    },
    set statusCode(v: number) {
      status = v;
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    end(b?: string) {
      body = b;
    },
  } as unknown as Parameters<typeof handleProxy>[1];

  await handleProxy(reqLike, resLike, {
    // The relay allows nothing unless its mount names hosts. This route keeps
    // the fleet's list so the relay behaves as it always did, even though every
    // frame-rendering surface here mounts the synthetic provider today: the
    // route is reachable independently of what the pages mount.
    allowHosts: PROXY_ALLOW_HOSTS,
    userAgent: process.env.ZFRAMES_CONTACT
      ? `zframes (${process.env.ZFRAMES_CONTACT})`
      : undefined,
    maxBytes: MAX_RELAY_BYTES,
    timeoutMsByHost: TIMEOUT_MS_BY_HOST,
  });

  return {
    status,
    body: body ?? "",
    contentType: headers.get("content-type") ?? "application/octet-stream",
  };
}

async function proxy(request: Request): Promise<Response> {
  let targetHost: string | undefined;
  let targetUrl = "";
  try {
    targetUrl = new URL(request.url).searchParams.get("url") ?? "";
    targetHost = new URL(targetUrl).hostname;
  } catch {
    /* handleProxy answers the 400; the dedup key is just the raw param */
  }

  // Share the RESULT, never the Response (a body can only be read once). GET and
  // HEAD dedup together: handleProxy relays both upstream as a full-body GET, so
  // they produce the identical relay.
  let pending = inFlight.get(targetUrl);
  if (!pending) {
    pending = relay(request).finally(() => {
      inFlight.delete(targetUrl);
    });
    inFlight.set(targetUrl, pending);
  }

  let result: RelayResult;
  try {
    result = await pending;
  } catch (error) {
    // handleProxy catches its own upstream failures, so this is a bug in the
    // shim rather than a bad upstream — still answered as the 502 the frames
    // already degrade on, never a 500 with a stack.
    result = {
      status: 502,
      body: JSON.stringify({ ok: false, error: `relay failed: ${error}` }),
      contentType: "application/json",
    };
  }

  const headers = new Headers({ "content-type": result.contentType });
  // handleProxy sends `cache-control: no-store` (correct for the loopback CLI;
  // wrong for a shared public edge), which the shim dropped by only carrying the
  // content-type across. Successful relays get their per-source TTL; everything
  // else gets a short one, so a repeated failure is at least not re-asked
  // upstream once per visitor per poll.
  const ttl =
    result.status === 200 ? (TTL_BY_HOST[targetHost ?? ""] ?? DEFAULT_TTL) : 0;
  headers.set(
    "CDN-Cache-Control",
    ttl > 0
      ? `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`
      : `public, s-maxage=${ERROR_TTL}`,
  );
  // Browsers revalidate; the edge serves the cached copy. Never `no-store`, on
  // either path — Vercel refuses to cache a response carrying it, which would
  // make the error TTL above a no-op.
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");

  return new Response(result.body, { status: result.status, headers });
}

export const GET = proxy;
export const HEAD = proxy;
