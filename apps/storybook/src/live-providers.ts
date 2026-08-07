/**
 * The real, keyless provider set — what the `Live` story renders against.
 *
 * Every other story runs on the deterministic offline `MockMarketDataProvider`;
 * this is the one deliberate exception, so a frame can be eyeballed against the
 * shape real upstream data actually has (sparse series, absurd outliers, missing
 * fields) rather than the mock's tidy synthetic curves.
 *
 * Built ONCE per browser session, not per story: several providers hold live
 * state that must not be duplicated — Hyperliquid opens a WebSocket per
 * instance, and every provider's `TtlCache` is instance-scoped, so a fresh set
 * per story would re-fetch from scratch and burn the keyless rate limits (the
 * same reason `FramesProvider` shares instances in the runtime).
 *
 * Keyless only: `createKeylessProviders()` never imports the keyed tier
 * (Binance/Wallet), so no story can reach a credentialled path.
 */
import { createKeylessProviders } from "@zframes/providers-keyless";
import type { MarketDataProvider } from "@zframes/spec";

let cached: MarketDataProvider[] | null = null;

export function liveProviders(): MarketDataProvider[] {
  cached ??= createKeylessProviders();
  return cached;
}
