/**
 * The Binance keyed-tier plugin manifest — pure data (same `manifest`/`plugin`
 * split as the keyless fleet, see that package's `src/manifest.ts`).
 *
 * `api.binance.com` is declared without `proxied` on purpose: the browser
 * provider never fetches it — the runtime's server-side signed relay
 * (`@zframes/account`) does, with the locally-stored key — so the host belongs
 * in the operator's install-time notice but must NOT enter the derived data
 * relay allowlist, where it would open an unauthenticated GET path to the
 * venue.
 */
import type { ProviderPluginManifest } from "@zframes/spec";

export const BINANCE_MANIFEST: ProviderPluginManifest = {
  id: "binance",
  name: "Binance account",
  description:
    "Portfolio frames for a connected Binance account, read through the local signed relay. The API key stays in a local file and never reaches the browser.",
  termsUrl: "https://www.binance.com/en/terms",
  capabilities: ["portfolio"],
  sources: [{ id: "binance", name: "Binance", url: "https://www.binance.com" }],
  hosts: [
    {
      host: "api.binance.com",
      reason:
        "Account balances and prices, fetched by the local signed relay — not the browser, not the data proxy.",
    },
  ],
  requiresCredentials: true,
};
