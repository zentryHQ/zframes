"use client";

// Shared, app-wide singletons for every client "live" surface (dashboard
// preview, catalogue, tinker). Module scope = ONE instance for the whole app:
// HyperliquidProvider opens a single shared WebSocket and every provider holds
// TtlCache state, so all pages reuse one socket + one cache. "use client" keeps
// this out of any server render. Keyless tier only — the keyed providers
// (Binance, Wallet) are intentionally excluded from the public explorer.
import { createRegistry } from "@zframes/core";
import { allFrames } from "@zframes/frames";
import { createKeylessProviders } from "@zframes/providers-keyless";

// Keyless set only — the shared factory never imports the keyed tier
// (Binance/Wallet), so they can't enter the public explorer's bundle.
export const providers = createKeylessProviders();

// Eager registry over all built-in frames. Lazy per-frame splitting is a later
// bundle optimization; eager is correct and simplest.
export const registry = createRegistry(allFrames);
