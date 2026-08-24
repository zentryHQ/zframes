/**
 * The demo provider as a loadable `ProviderPlugin` module (`manifest` +
 * `createProviders`), dynamic-imported by the runtime's plugin loader as its
 * own browser chunk. See `./manifest` for why the declaration lives apart.
 */
import type { MarketDataProvider } from "@zframes/spec";
import { DEMO_MANIFEST } from "./manifest";
import { MockMarketDataProvider } from "./mock-provider";

export const manifest = DEMO_MANIFEST;

export function createProviders(): MarketDataProvider[] {
  return [new MockMarketDataProvider()];
}
