/**
 * The on-chain wallet tier as a loadable `ProviderPlugin` module, dynamic-
 * imported by the runtime's plugin loader as its own browser chunk.
 */
import type { MarketDataProvider } from "@zframes/spec";
import { WALLET_MANIFEST } from "./manifest";
import { WalletProvider } from "./index";

export const manifest = WALLET_MANIFEST;

export function createProviders(): MarketDataProvider[] {
  return [new WalletProvider()];
}
