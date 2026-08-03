import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const here = dirname(fileURLToPath(import.meta.url));
const packagesDir = join(here, "..", "..", "packages");

const readPackageJson = (dir: string) =>
  JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    name?: string;
    version?: string;
  };

// The version the site advertises is the `zframes` CLI version — the package a
// visitor actually runs via npx — read from that package.json at build time.
// Same source the runtime header reads (apps/runtime/vite.config.ts), so the
// site, the runtime chrome and npm can never disagree.
const cliVersion = readPackageJson(join(packagesDir, "cli")).version as string;

/**
 * transpilePackages is the Next equivalent of the runtime's optimizeDeps.exclude:
 * every @zframes/* workspace package ships TypeScript source (`main: src/index.ts`),
 * so Next must transpile them itself — core/charts/frames, every keyless provider
 * reachable from the preview, and @zframes/serve (the proxy Route Handler).
 *
 * ENUMERATED from packages/, never typed by hand. The hand-written list this
 * replaced had silently fallen twelve packages behind — a new provider only shows
 * up as an untranspiled-TypeScript failure at `next build`, which is not in CI, so
 * nothing caught the drift. Listing a package the app never imports costs nothing
 * (Next only transpiles what actually resolves), which is what makes "all of them"
 * both correct and maintenance-free.
 */
const zframesPackages = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readPackageJson(join(packagesDir, entry.name)).name)
  .filter((name): name is string => !!name?.startsWith("@zframes/"))
  .sort();

const nextConfig: NextConfig = {
  // Inlined at build time (not read at request time) so it ships with the
  // static pages the same way the runtime bakes its own header version in.
  env: { ZFRAMES_CLI_VERSION: cliVersion },
  transpilePackages: zframesPackages,
  // Keep the DB drivers out of the bundle — PGlite ships WASM and postgres is a
  // native-ish driver; they must load from node_modules in the Node runtime.
  serverExternalPackages: ["postgres"],
  // The OG image reads assets/DMSans.ttf + the brand mark via fs at request time
  // — force-trace them into the serverless bundle so they ship to prod. Without
  // the mark listed here the card still renders, just with a missing badge.
  outputFileTracingIncludes: {
    "/dashboard/[id]/opengraph-image": [
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
  // Boards lived at `/d/<id>` until the route was renamed to `/dashboard/<id>`.
  // Those short links are already pasted into Slack/X and printed by older
  // published CLI/skill versions, so the old prefix redirects permanently rather
  // than 404ing — `:path*` covers the bare board AND its `/dashboard.json` and
  // `/opengraph-image` children in one rule.
  async redirects() {
    return [
      {
        source: "/d/:path*",
        destination: "/dashboard/:path*",
        permanent: true,
      },
    ];
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
