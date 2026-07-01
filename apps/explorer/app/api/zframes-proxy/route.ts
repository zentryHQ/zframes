import { handleProxy } from "@zframes/core/serve";

// Reached via a next.config rewrite: the browser calls `/__zframes/proxy?url=…`
// (a shared constant in @zframes/core), which Next rewrites here. It can't live
// at app/__zframes/proxy because Next treats `_`-prefixed folders as PRIVATE
// (excluded from routing), so an underscore route file never registers.
//
// @zframes/core/serve imports node:fs/promises, so this must run on the Node
// runtime, not Edge. `force-dynamic` keeps it per-request (it's a live relay);
// edge caching is driven by the CDN-Cache-Control header below, orthogonal to
// Next's build-time dynamic flag.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function proxy(request: Request): Promise<Response> {
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
    userAgent: process.env.ZFRAMES_CONTACT
      ? `zframes (${process.env.ZFRAMES_CONTACT})`
      : undefined,
  });

  // Override handleProxy's `cache-control: no-store` (correct for the loopback
  // CLI; wrong for a shared public edge). Cache only successful relays; never
  // cache proxy/upstream errors (403 host-not-allowed, 502 fetch-failed, etc.).
  headers.delete("cache-control");
  if (status === 200) {
    let ttl = DEFAULT_TTL;
    try {
      const target = new URL(
        new URL(request.url).searchParams.get("url") ?? "",
      );
      ttl = TTL_BY_HOST[target.hostname] ?? DEFAULT_TTL;
    } catch {
      /* keep default */
    }
    headers.set(
      "CDN-Cache-Control",
      `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}`,
    );
    // Browsers revalidate; the edge serves the cached copy.
    headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  } else {
    headers.set("Cache-Control", "no-store");
  }

  return new Response(body ?? "", { status, headers });
}

export const GET = proxy;
export const HEAD = proxy;
