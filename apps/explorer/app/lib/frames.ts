"use client";

// Shared, app-wide singletons for every client "live" surface (dashboard
// preview, catalogue, tinker). Module scope = ONE instance for the whole app:
// HyperliquidProvider opens a single shared WebSocket and every provider holds
// TtlCache state, so all pages reuse one socket + one cache. "use client" keeps
// this out of any server render. Keyless tier only — the keyed providers
// (Binance, Wallet) are intentionally excluded from the public explorer.
import { createRegistry } from "@zframes/core";
import { allFrames } from "@zframes/frames";
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

export const providers = [
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

// Eager registry over all built-in frames. Lazy per-frame splitting is a later
// bundle optimization; eager is correct and simplest.
export const registry = createRegistry(allFrames);
