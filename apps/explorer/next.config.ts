import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// The version the site advertises is the `zframes` CLI version — the package a
// visitor actually runs via npx — read from that package.json at build time.
// Same source the runtime header reads (apps/runtime/vite.config.ts), so the
// site, the runtime chrome and npm can never disagree.
const cliVersion = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "packages",
      "cli",
      "package.json",
    ),
    "utf8",
  ),
).version as string;

// transpilePackages is the Next equivalent of the runtime's optimizeDeps.exclude:
// every @zframes/* workspace package ships TypeScript source (`main: src/index.ts`),
// so Next must transpile them itself. This must list ALL @zframes packages the app
// imports — core/charts/frames plus every keyless provider wired into the preview,
// and @zframes/serve/serve (imported by the proxy Route Handler).
const nextConfig: NextConfig = {
  // Inlined at build time (not read at request time) so it ships with the
  // static pages the same way the runtime bakes its own header version in.
  env: { ZFRAMES_CLI_VERSION: cliVersion },
  transpilePackages: [
    "@zframes/core",
    "@zframes/spec",
    "@zframes/data-primitives",
    "@zframes/editor",
    "@zframes/serve",
    "@zframes/charts",
    "@zframes/frames",
    "@zframes/providers-keyless",
    "@zframes/provider-wallet",
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
  // The OG image reads assets/DMSans.ttf + the brand mark via fs at request time
  // — force-trace them into the serverless bundle so they ship to prod. Without
  // the mark listed here the card still renders, just with a missing badge.
  outputFileTracingIncludes: {
    "/d/[id]/opengraph-image": [
      "./assets/DMSans-Regular.ttf",
      "./assets/DMSans-Bold.ttf",
      "./assets/zframes-icon-512.png",
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
