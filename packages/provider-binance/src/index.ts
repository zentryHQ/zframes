import type {
  Capability,
  MarketDataProvider,
  Portfolio,
  PortfolioSource,
  PortfolioSourceKind,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { ACCOUNT_PORTFOLIO_ROUTE } from "@zframes/spec/routes";

// One signed relay call shared across every portfolio frame on the dashboard
// (value + allocation + holdings) via in-flight dedup + a short TTL under the
// 60s poll. NOT persisted: account holdings must never be written to
// localStorage. Stale-on-error keeps the last good snapshot through a transient
// relay hiccup; the frame's status gate hides it after a real disconnect.
const portfolioCache = new TtlCache<Portfolio>({
  namespace: "zframes:binance:portfolio",
  ttlMs: 45_000,
  persist: false,
});

/**
 * Keyed provider for a connected Binance account. It holds NO secret and signs
 * nothing itself — it reads the account through the runtime's same-origin signed
 * relay (`/__zframes/account/portfolio`), which performs the HMAC signing in
 * Node with the locally-stored key. So this stays a plain browser provider; the
 * relay only exists under `zframes serve` / the dev plugin, and a 401 (no
 * credential stored) surfaces as the frame's connect-state.
 */
export class BinanceProvider implements MarketDataProvider {
  readonly name = "Binance";
  readonly capabilities: readonly Capability[] = ["portfolio"];
  readonly portfolioKinds: readonly PortfolioSourceKind[] = ["binance"];

  async getPortfolio(source: PortfolioSource): Promise<Portfolio> {
    if (source.kind !== "binance")
      throw new Error(`BinanceProvider can't serve source: ${source.kind}`);
    return portfolioCache.get("binance", async () => {
      const res = await fetch(`${ACCOUNT_PORTFOLIO_ROUTE}?source=binance`, {
        headers: { accept: "application/json" },
      });
      if (res.status === 401) throw new Error("binance: not connected");
      if (!res.ok) throw new Error(`binance portfolio relay ${res.status}`);
      return (await res.json()) as Portfolio;
    });
  }
}
