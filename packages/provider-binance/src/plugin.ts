/**
 * The Binance keyed tier as a loadable `ProviderPlugin` module, dynamic-
 * imported by the runtime's plugin loader as its own browser chunk.
 */
import type { MarketDataProvider } from "@zframes/spec";
import { BINANCE_MANIFEST } from "./manifest";
import { BinanceProvider } from "./index";

export const manifest = BINANCE_MANIFEST;

export function createProviders(): MarketDataProvider[] {
  return [new BinanceProvider()];
}
