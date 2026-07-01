"use client";

import {
  createRegistry,
  DashboardRenderer,
  DashboardSpecSchema,
  FramesProvider,
} from "@zframes/core";
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
import { seedDashboard } from "./seed-dashboard";

// Module-scope singletons — NEVER re-instantiate per render. HyperliquidProvider
// opens a shared WebSocket and every provider holds TtlCache state; constructing
// them per render would leak sockets and defeat caching. Mirrors apps/runtime's
// module-scope provider array, minus the keyed tier (Binance, Wallet) which the
// public explorer deliberately excludes — keyless only.
const providers = [
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

// Eager registry over all built-in frames (proven in the Phase-0 spike). Lazy
// per-frame code-splitting (apps/runtime's createLazyRegistry) is a Phase-2+
// bundle optimization; eager is correct and simplest for the preview.
const registry = createRegistry(allFrames);

// Validate once at module load — DashboardSpecSchema is the contract; a bad spec
// should surface a readable message, not a blank screen (invalid *frame* configs
// still render as per-frame error cards inside DashboardRenderer, non-fatal).
const parsed = DashboardSpecSchema.safeParse(seedDashboard);

export default function Dashboard() {
  if (!parsed.success) {
    return (
      <pre
        style={{
          color: "#ff6b81",
          padding: 24,
          whiteSpace: "pre-wrap",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {`Invalid seed spec:\n${JSON.stringify(parsed.error.issues, null, 2)}`}
      </pre>
    );
  }
  return (
    <FramesProvider providers={providers}>
      <main style={{ padding: 24, maxWidth: 1280, margin: "0 auto" }}>
        <DashboardRenderer spec={parsed.data} registry={registry} />
      </main>
    </FramesProvider>
  );
}
