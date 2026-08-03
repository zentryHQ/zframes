"use client";

// Shared, app-wide singletons for every client "live" surface (dashboard
// preview, catalogue, tinker). Module scope = ONE instance for the whole app:
// HyperliquidProvider opens a single shared WebSocket and every provider holds
// TtlCache state, so all pages reuse one socket + one cache. "use client" keeps
// this out of any server render. Keyless tier + the wallet provider — Binance
// (the only truly keyed provider: needs a server relay) stays excluded.
import { createRegistry } from "@zframes/core";
import { allFrames } from "@zframes/frames";
import { createKeylessProviders } from "@zframes/providers-keyless";
import { WalletProvider } from "@zframes/provider-wallet";

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

// Keyless set + WalletProvider. Wallet is keyless-safe — a public on-chain
// address read straight from the browser (public RPC + CoinGecko, no key, no
// signing, no relay) — so it powers the `portfolio` capability on public
// surfaces (e.g. the hero's live on-chain wallet portfolio). Binance is the one
// provider still excluded: its signed relay has no server in the static/SSR
// explorer.
export const providers = [...keyless, new WalletProvider()];

// Eager registry over all built-in frames. Lazy per-frame splitting is a later
// bundle optimization; eager is correct and simplest.
export const registry = createRegistry(allFrames);
