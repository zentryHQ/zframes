"use client";

// Shared, app-wide singletons for every client "live" surface (dashboard
// preview, catalogue, tinker). Module scope = ONE instance for the whole app:
// HyperliquidProvider opens a single shared WebSocket and every provider holds
// TtlCache state, so all pages reuse one socket + one cache. "use client" keeps
// this out of any server render. Keyless tier + the wallet provider — Binance
// (the only truly keyed provider: needs a server relay) stays excluded.
import type { AnyFrameDefinition } from "@zframes/core";
import { createLazyRegistry } from "@zframes/frames/lazy-registry";
import { MockMarketDataProvider } from "@zframes/frames/testing";
import { createKeylessProviders } from "@zframes/providers-keyless";
import { WalletProvider } from "@zframes/provider-wallet";
import { getDataMode } from "@/app/lib/data-mode";

// Construction is side-effect-free (the Hyperliquid socket opens lazily on the
// first subscribe, every fetch on the first method call), so the live set can be
// built unconditionally for its COUNT while demo mode never actually reads it.
const keyless = createKeylessProviders();

/**
 * How many keyless providers the explorer actually mounts — read off the
 * factory, not typed into copy. The landing quotes this number as a headline
 * claim ("N free public sources"), and a hand-written one silently rots the
 * moment a provider package lands; this cannot.
 *
 * Deliberately excludes WalletProvider below: it is keyless-*safe* but it is
 * not part of the keyless market-data set the claim is about.
 */
export const KEYLESS_PROVIDER_COUNT = keyless.length;

/**
 * The mode this page load resolved at module init — "demo" unless this browser
 * has opted in to live data (see `data-mode.ts` for why demo is the default).
 * Fixed for the page's lifetime; toggling reloads.
 */
export const dataMode = getDataMode();

// DEMO (default): one deterministic offline provider covering every capability —
// the same MockMarketDataProvider the frame smoke tests and Storybook run on, so
// every frame is guaranteed to render on it. Nothing is fetched from any
// upstream market API, which is the point (see data-mode.ts).
//
// LIVE (opt-in): keyless set + WalletProvider. Wallet is keyless-safe — a public
// on-chain address read straight from the browser (public RPC + CoinGecko, no
// key, no signing, no relay) — so it powers the `portfolio` capability on public
// surfaces (e.g. the hero's live on-chain wallet portfolio). Binance is the one
// provider still excluded: its signed relay has no server in the static/SSR
// explorer.
export const providers =
  dataMode === "live"
    ? [...keyless, new WalletProvider()]
    : [new MockMarketDataProvider()];

/**
 * The public on-chain address every `account: true` frame is demoed against on
 * this site — Binance's own cold wallet, so the numbers are real and large.
 * Keyless: public RPC + CoinGecko, no signing, no relay.
 *
 * Shared because the schema default for those frames is `source: "binance"`,
 * and Binance is the one provider the explorer cannot mount (its signed relay
 * needs a server). Left at the default they render a connect form that 404s the
 * credentials route — a dead control on a public page. Every public surface
 * therefore overrides to `source: "wallet"` with this address.
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
