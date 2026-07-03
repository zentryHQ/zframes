// The keyless market-data provider set — the 15 free, no-key providers, as ONE
// factory both apps share. Runtime and explorer used to each keep an identical
// copy of this list (apps/runtime/src/App.tsx, apps/explorer/app/lib/frames.ts);
// adding a provider meant editing both and they drifted. Centralising it here
// makes a new keyless provider a one-file change, and — because this package
// never imports the keyed providers (Binance/Wallet) — the public explorer's
// exclusion of the keyed tier is enforced structurally (they never enter its
// dependency graph) rather than by a manual omission that can rot.
//
// Order is load-bearing: capability routing is first-match-by-capability with no
// dedup (useProviderFor, packages/core/src/hooks.tsx). Preserve the existing app
// order. Constructed with no args, matching every current call site (SecProvider
// takes an optional `contact` User-Agent, but no site passes it today).
//
// React-free by design — safe to import from a Vite app or a Next client module.
// The runtime appends the keyed providers itself: [...createKeylessProviders(),
// new BinanceProvider(), new WalletProvider()].
import type { MarketDataProvider } from "@zframes/spec";
import { AlternativeMeProvider } from "@zframes/provider-alternativeme";
import { BlsProvider } from "@zframes/provider-bls";
import { CoinGeckoProvider } from "@zframes/provider-coingecko";
import { CoinpaprikaProvider } from "@zframes/provider-coinpaprika";
import { DefiLlamaProvider } from "@zframes/provider-defillama";
import { DeribitProvider } from "@zframes/provider-deribit";
import { FinraProvider } from "@zframes/provider-finra";
import { FxProvider } from "@zframes/provider-fx";
import { HyperliquidProvider } from "@zframes/provider-hyperliquid";
import { MempoolProvider } from "@zframes/provider-mempool";
import { NewsProvider } from "@zframes/provider-news";
import { NyFedProvider } from "@zframes/provider-nyfed";
import { OfrProvider } from "@zframes/provider-ofr";
import { SecProvider } from "@zframes/provider-sec";
import { TreasuryProvider } from "@zframes/provider-treasury";

/** The keyless market-data provider set, in capability-routing order. */
export function createKeylessProviders(): MarketDataProvider[] {
  return [
    new HyperliquidProvider(),
    new DefiLlamaProvider(),
    new AlternativeMeProvider(),
    new CoinGeckoProvider(),
    new CoinpaprikaProvider(),
    new NyFedProvider(),
    new TreasuryProvider(),
    new BlsProvider(),
    new SecProvider(),
    new FinraProvider(),
    new OfrProvider(),
    new FxProvider(),
    new NewsProvider(),
    new MempoolProvider(),
    new DeribitProvider(),
  ];
}
