"use client";

// Shared, app-wide singletons for every client frame-rendering surface
// (dashboard preview, catalogue, tinker). Module scope = ONE instance for the
// whole app. "use client" keeps this out of any server render.
//
// The explorer renders MOCK DATA ONLY: one deterministic offline provider
// covering every capability — the same MockMarketDataProvider the frame smoke
// tests and Storybook run on, so every frame is guaranteed to render on it.
// Nothing is ever fetched from any upstream market API on this site, which is
// the ToS-compliance posture (docs/decisions/web-explorer/): live data is the
// CLI's job, not the hosted explorer's.
import type { AnyFrameDefinition } from "@zframes/core";
import { createLazyRegistry } from "@zframes/frames/lazy-registry";
import { MockMarketDataProvider } from "@zframes/frames/testing";

export const providers = [new MockMarketDataProvider()];

/**
 * The public on-chain address every `account: true` frame is demoed against on
 * this site. The schema default for those frames is `source: "binance"`, and
 * Binance is a provider the explorer cannot mount (its signed relay needs a
 * server) — left at the default they render a connect form that 404s the
 * credentials route, a dead control on a public page. Every public surface
 * therefore overrides to `source: "wallet"` with this address (Binance's own
 * cold wallet; the mock provider answers the actual data).
 */
export const PUBLIC_DEMO_ADDRESS = "0xF977814e90dA44bFA03b6295A0616a897441acec";

// Lazy registry: eager metas (schema/capabilities/layout for validation and
// the palette), React.lazy components resolved from per-frame chunks on first
// render — so a route ships the frames it renders, not all ~285 + D3. The
// eager `allFrames` barrel must not be imported anywhere in the explorer.
export const registry = createLazyRegistry();

/** Every frame definition, for surfaces that enumerate the catalogue
 *  (catalogue grid, playground picker, tinker starter). Full metas, lazy
 *  components — a drop-in replacement for iterating the eager `allFrames`. */
export const frameDefs: AnyFrameDefinition[] = [...registry.values()];
