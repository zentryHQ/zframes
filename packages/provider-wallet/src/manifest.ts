/**
 * The on-chain wallet plugin manifest — pure data (same `manifest`/`plugin`
 * split as the keyless fleet). Every host is CORS-open and fetched directly by
 * the browser, so none is `proxied` and the derived relay allowlist gains
 * nothing from installing this. No credential: the wallet address is public
 * data a card carries in its own config.
 */
import type { ProviderPluginManifest } from "@zframes/spec";

export const WALLET_MANIFEST: ProviderPluginManifest = {
  id: "wallet",
  name: "On-chain wallet",
  description:
    "Portfolio frames for a public Ethereum address: balances via public RPC, prices via CoinGecko, ENS names resolved. Read-only, no key.",
  capabilities: ["portfolio"],
  sources: [],
  hosts: [
    {
      host: "ethereum-rpc.publicnode.com",
      reason: "Public Ethereum RPC for ETH and token balances.",
    },
    {
      host: "cloudflare-eth.com",
      reason: "Fallback public Ethereum RPC.",
    },
    {
      host: "1rpc.io",
      reason: "Fallback public Ethereum RPC.",
    },
    {
      host: "api.coingecko.com",
      reason: "USD prices for the held tokens.",
    },
    {
      host: "api.ensideas.com",
      reason: "Resolving an ENS name to its address.",
    },
  ],
};
