import {
  useFramePatch,
  useMids,
  usePortfolio,
  type Holding,
  type Portfolio,
  type PortfolioSource,
} from "@zframes/core";
import { ACCOUNT_CREDENTIALS_ROUTE } from "@zframes/spec/routes";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AssetLogo } from "./asset-logo";
import { FrameStatus } from "./ui";

/**
 * Shared plumbing for the source-agnostic portfolio frames (value / allocation /
 * holdings). Both a keyed Binance account and a keyless on-chain wallet resolve
 * to the same `portfolio` capability, so the frames consume this regardless of
 * source — only the connect affordance differs by `source.kind`.
 */

export interface PortfolioConfig {
  source: "binance" | "wallet";
  address?: string;
}

/** Resolve the configured source, or null when more config is needed (no address). */
export function resolveSource(config: PortfolioConfig): PortfolioSource | null {
  if (config.source === "wallet") {
    const address = (config.address ?? "").trim();
    return address ? { kind: "wallet", address } : null;
  }
  return { kind: "binance" };
}

/** A holding priced to USD — live mid when available, else the provider value. */
export interface PricedHolding extends Holding {
  value?: number;
}

// Wrapped/pegged assets price off their Hyperliquid base symbol's live mid.
const MID_ALIAS: Record<string, string> = { WETH: "ETH", WBTC: "BTC" };
function midSymbol(symbol: string): string {
  return MID_ALIAS[symbol.toUpperCase()] ?? symbol;
}

/**
 * Price holdings, preferring the **live Hyperliquid mid** (so the value moves
 * with the market in real time) and falling back to the provider's `valueUsd`
 * (CoinGecko/exchange snapshot) for assets Hyperliquid doesn't quote —
 * stablecoins, exotic tokens.
 */
export function usePricedHoldings(holdings: readonly Holding[] | undefined): {
  priced: PricedHolding[];
  total: number;
} {
  const list = holdings ?? [];
  const symbols = list.map((h) => midSymbol(h.symbol));
  const mids = useMids(symbols);
  return useMemo(() => {
    const priced = list.map((h) => {
      const mid = mids[midSymbol(h.symbol)];
      const value = mid !== undefined ? h.amount * mid : h.valueUsd;
      return { ...h, value };
    });
    const total = priced.reduce((sum, h) => sum + (h.value ?? 0), 0);
    return { priced, total };
    // `list` is derived from `holdings` each render; keying off `holdings`
    // (and `mids`) is the real dependency set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings, mids]);
}

/**
 * The account label, rendered as an Etherscan link for a wallet source (the
 * label is its address) and plain text otherwise (e.g. "Binance").
 */
export function PortfolioLabel({
  portfolio,
  config,
  className = "",
}: {
  portfolio: Portfolio;
  config: PortfolioConfig;
  className?: string;
}) {
  const label =
    portfolio.label ?? (config.source === "wallet" ? "wallet" : "portfolio");
  const address = config.address?.trim();
  if (config.source === "wallet" && address) {
    return (
      <a
        href={`https://etherscan.io/address/${encodeURIComponent(address)}`}
        target="_blank"
        rel="noopener noreferrer"
        title="View on Etherscan"
        className={`hover:text-white hover:underline ${className}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {label}
      </a>
    );
  }
  return <span className={className}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Connect-state: a single hook the three frames switch on.
// ---------------------------------------------------------------------------

type AccountStatus = {
  loading: boolean;
  connected: boolean;
  keyMasked: string | null;
};

/** Keyed-source credential status from the loopback credential route. */
function useAccountStatus(
  source: PortfolioSource | null,
  nonce: number,
): AccountStatus {
  const keyed = source?.kind === "binance";
  const [status, setStatus] = useState<AccountStatus>({
    loading: keyed,
    connected: false,
    keyMasked: null,
  });
  useEffect(() => {
    if (!keyed || !source) {
      setStatus({ loading: false, connected: false, keyMasked: null });
      return;
    }
    let cancelled = false;
    setStatus((s) => ({ ...s, loading: true }));
    fetch(`${ACCOUNT_CREDENTIALS_ROUTE}?source=${source.kind}`, {
      headers: { accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : { connected: false, keyMasked: null }))
      .then((d: { connected?: boolean; keyMasked?: string | null }) => {
        if (cancelled) return;
        setStatus({
          loading: false,
          connected: !!d.connected,
          keyMasked: d.keyMasked ?? null,
        });
      })
      .catch(() => {
        if (!cancelled)
          setStatus({ loading: false, connected: false, keyMasked: null });
      });
    return () => {
      cancelled = true;
    };
    // Re-check on the source kind (not the per-render `source` object) + nonce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyed, source?.kind, nonce]);
  return status;
}

export type PortfolioView =
  | { state: "needs-address" }
  | { state: "needs-connect"; source: PortfolioSource }
  | { state: "checking" }
  | { state: "loading" }
  | { state: "error" }
  | { state: "empty"; portfolio: Portfolio }
  | { state: "live"; portfolio: Portfolio };

/**
 * Drive a portfolio frame: resolve the source, gate on connection (credential
 * status for keyed sources, a configured address for wallets), then load the
 * portfolio. `refresh` re-checks status after a successful connect.
 */
export function usePortfolioView(config: PortfolioConfig): {
  view: PortfolioView;
  refresh: () => void;
} {
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const source = resolveSource(config);
  const status = useAccountStatus(source, nonce);
  const keyed = source?.kind === "binance";
  const ready = !!source && (!keyed || status.connected);
  const { portfolio, isLoading } = usePortfolio(ready ? source : null);

  let view: PortfolioView;
  if (!source) view = { state: "needs-address" };
  else if (keyed && status.loading) view = { state: "checking" };
  else if (keyed && !status.connected)
    view = { state: "needs-connect", source };
  else if (isLoading && !portfolio) view = { state: "loading" };
  else if (!portfolio) view = { state: "error" };
  else if (portfolio.holdings.length === 0)
    view = { state: "empty", portfolio };
  else view = { state: "live", portfolio };

  return { view, refresh };
}

// ---------------------------------------------------------------------------
// Connect chrome — built-in runtime code (not spec-authored), posting only to
// the same-origin loopback credential route. The secret leaves the browser once
// on submit and is never read back (status returns a masked last-4).
// ---------------------------------------------------------------------------

const fieldClass =
  "w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white/90 outline-none focus:border-white/25 placeholder:text-white/30";
const btnClass =
  "rounded-md bg-[hsl(var(--zf-accent-hue,242)_90%_60%)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";

function BinanceConnect({ onConnected }: { onConnected: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(ACCOUNT_CREDENTIALS_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "binance",
          key: apiKey.trim(),
          secret: secret.trim(),
        }),
      });
      const data: { ok?: boolean; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (!res.ok || !data.ok)
        throw new Error(data.error ?? `HTTP ${res.status}`);
      setApiKey("");
      setSecret("");
      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 px-1">
      <div className="flex items-center gap-1.5">
        <AssetLogo symbol="BNB" size={18} />
        <span className="text-strong text-sm font-bold">Connect Binance</span>
      </div>
      <p className="caption text-soft">
        Use a <strong>read-only</strong> key + secret — create them in Binance{" "}
        <a
          href="https://www.binance.com/en/my/settings/api-management"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[hsl(var(--zf-accent-hue,242)_90%_72%)] underline underline-offset-2 hover:text-white"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          API Management
        </a>{" "}
        (enable Reading only). Both stay on your machine, never shared.
      </p>
      <input
        className={fieldClass}
        placeholder="API key"
        value={apiKey}
        autoComplete="off"
        onChange={(e) => setApiKey(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <input
        className={fieldClass}
        placeholder="API secret"
        type="password"
        value={secret}
        autoComplete="off"
        onChange={(e) => setSecret(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
      />
      {error ? <p className="caption text-[#ff6b81]">{error}</p> : null}
      <button
        type="button"
        className={btnClass}
        disabled={busy || !apiKey.trim() || !secret.trim()}
        onClick={(e) => {
          e.stopPropagation();
          void submit();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {busy ? "Verifying…" : "Connect"}
      </button>
    </div>
  );
}

function WalletConnect({ current }: { current?: string }) {
  const patch = useFramePatch();
  const [addr, setAddr] = useState(current ?? "");
  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 px-1">
      <div className="flex items-center gap-1.5">
        <AssetLogo symbol="ETH" size={18} />
        <span className="text-strong text-sm font-bold">Track a wallet</span>
      </div>
      <p className="caption text-soft">
        Enter a public Ethereum address or ENS name. No keys — it&rsquo;s public
        on-chain data. Sharing this dashboard reveals the holdings.
      </p>
      <input
        className={fieldClass}
        placeholder="0x… or name.eth"
        value={addr}
        autoComplete="off"
        onChange={(e) => setAddr(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
      />
      {!patch ? (
        <p className="caption text-soft">
          Set the address in the frame&rsquo;s config to start tracking.
        </p>
      ) : (
        <button
          type="button"
          className={btnClass}
          disabled={!addr.trim()}
          onClick={(e) => {
            e.stopPropagation();
            patch({ address: addr.trim() });
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          Track
        </button>
      )}
    </div>
  );
}

/**
 * Centralises the shared state machine for the three portfolio frames: renders
 * the connect chrome / loading / empty states, and calls `children` with the
 * live Portfolio only when there's something to show.
 */
export function PortfolioGate({
  config,
  loadingLabel = "loading portfolio…",
  children,
}: {
  config: PortfolioConfig;
  loadingLabel?: string;
  children: (portfolio: Portfolio) => ReactNode;
}) {
  const { view, refresh } = usePortfolioView(config);
  switch (view.state) {
    case "needs-address":
    case "needs-connect":
      return <ConnectCard view={view} config={config} onConnected={refresh} />;
    case "checking":
    case "loading":
      return <FrameStatus loading>{loadingLabel}</FrameStatus>;
    case "error":
      return (
        <FrameStatus>
          couldn&rsquo;t load — check the address or try again
        </FrameStatus>
      );
    case "empty":
      return <FrameStatus>no holdings to show</FrameStatus>;
    case "live":
      return <>{children(view.portfolio)}</>;
  }
}

/** The connect-state card, dispatched by source kind. */
export function ConnectCard({
  view,
  config,
  onConnected,
}: {
  view: Extract<PortfolioView, { state: "needs-address" | "needs-connect" }>;
  config: PortfolioConfig;
  onConnected: () => void;
}) {
  if (view.state === "needs-connect" && view.source.kind === "binance")
    return <BinanceConnect onConnected={onConnected} />;
  return <WalletConnect current={config.address} />;
}
