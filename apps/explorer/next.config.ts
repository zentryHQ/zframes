import type { NextConfig } from "next";

// transpilePackages is the Next equivalent of the runtime's optimizeDeps.exclude:
// every @zframes/* workspace package ships TypeScript source (`main: src/index.ts`),
// so Next must transpile them itself. This must list ALL @zframes packages the app
// imports — core/charts/frames plus every keyless provider wired into the preview,
// and @zframes/core/serve (imported by the proxy Route Handler).
const nextConfig: NextConfig = {
  transpilePackages: [
    "@zframes/core",
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
  ],
  // The browser's fetch layer hard-rewrites proxied provider calls to the shared
  // constant `/__zframes/proxy?url=…`. That path can't be an App Router folder
  // (leading `_` = private, excluded from routing), so map it to a normal api
  // route. Rewrites preserve the query string, so `?url=…` carries through.
  async rewrites() {
    return [{ source: "/__zframes/proxy", destination: "/api/zframes-proxy" }];
  },
};

export default nextConfig;
