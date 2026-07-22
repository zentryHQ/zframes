import type { NextConfig } from "next";

// transpilePackages is the Next equivalent of the runtime's optimizeDeps.exclude:
// every @zframes/* workspace package ships TypeScript source (`main: src/index.ts`),
// so Next must transpile them itself. This must list ALL @zframes packages the app
// imports — core/charts/frames plus every keyless provider wired into the preview,
// and @zframes/serve/serve (imported by the proxy Route Handler).
const nextConfig: NextConfig = {
  transpilePackages: [
    "@zframes/core",
    "@zframes/spec",
    "@zframes/data-primitives",
    "@zframes/editor",
    "@zframes/serve",
    "@zframes/charts",
    "@zframes/frames",
    "@zframes/provider-alternativeme",
    "@zframes/provider-bls",
    "@zframes/provider-coingecko",
    "@zframes/provider-coinpaprika",
    "@zframes/provider-defillama",
    "@zframes/provider-deribit",
    "@zframes/provider-finra",
    "@zframes/provider-fx",
    "@zframes/provider-hyperliquid",
    "@zframes/provider-mempool",
    "@zframes/provider-news",
    "@zframes/provider-nyfed",
    "@zframes/provider-ofr",
    "@zframes/provider-sec",
    "@zframes/provider-treasury",
    "@zframes/unicorn",
  ],
  // Keep the DB drivers out of the bundle — PGlite ships WASM and postgres is a
  // native-ish driver; they must load from node_modules in the Node runtime.
  serverExternalPackages: ["postgres"],
  // The OG image reads assets/DMSans.ttf via fs at request time — force-trace it
  // into the serverless bundle so the font ships to prod.
  outputFileTracingIncludes: {
    "/d/[id]/opengraph-image": [
      "./assets/DMSans-Regular.ttf",
      "./assets/DMSans-Bold.ttf",
    ],
  },
  // The browser's fetch layer hard-rewrites proxied provider calls to the shared
  // constant `/__zframes/proxy?url=…`. That path can't be an App Router folder
  // (leading `_` = private, excluded from routing), so map it to a normal api
  // route. Rewrites preserve the query string, so `?url=…` carries through.
  async rewrites() {
    return [{ source: "/__zframes/proxy", destination: "/api/zframes-proxy" }];
  },
  // Non-breaking security headers (defense-in-depth alongside the publish-time
  // URL sanitizer). A full script/connect-src CSP is a tracked follow-up — it
  // needs browser testing against the live WS + cross-origin provider fetches.
  async headers() {
    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];
    return [
      // Everything EXCEPT /embed/* stays un-frameable (clickjacking defense).
      // The negative lookahead keeps `/` matched while excluding the embed tree.
      {
        source: "/((?!embed/).*)",
        headers: [...base, { key: "X-Frame-Options", value: "DENY" }],
      },
      // The chrome-less board embeds (iframed by the landing showcase) must be
      // frameable BY THIS SAME ORIGIN only — SAMEORIGIN, never DENY (which blocks
      // even same-origin) and never a wildcard (no cross-site framing).
      {
        source: "/embed/:path*",
        headers: [...base, { key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default nextConfig;
