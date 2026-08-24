/**
 * The Node half of the built-in plugin registry: PURE DATA.
 *
 * Every import here is a plugin's `manifest` module, never its `plugin`
 * module, so reading this registry loads zero provider classes — the CLI's
 * `serve` reads it to derive a relay allowlist and answer the providers route,
 * `zframes providers` reads it to print what can be installed, and neither
 * should construct a fleet (instances hold caches and, for streaming
 * adapters, a live socket). The runnable halves are dynamic-imported in the
 * BROWSER by `./load`, keyed by the same ids.
 *
 * Why a fixed registry instead of resolving installed npm packages: a
 * third-party plugin can only be built against a published
 * `@zframes/spec/provider-plugin`, which does not ship yet — so today every
 * loadable plugin is first-party and already in this repo. When the contract
 * publishes, package resolution becomes an ADDITIONAL source of plugins next
 * to this registry, not a replacement for it.
 */
import type { ProviderPluginManifest } from "@zframes/spec";
import { KEYLESS_MANIFEST } from "@zframes/providers-keyless/manifest";
import { DEMO_MANIFEST } from "@zframes/provider-demo/manifest";
import { BINANCE_MANIFEST } from "@zframes/provider-binance/manifest";
import { WALLET_MANIFEST } from "@zframes/provider-wallet/manifest";

// Re-exported for hosts that compose a mount by hand (apps/runtime's
// vite.config passes the dev composition to `dashboardWriteback`), so a host
// names manifests from ONE module instead of four provider packages.
export { BINANCE_MANIFEST, DEMO_MANIFEST, KEYLESS_MANIFEST, WALLET_MANIFEST };

/**
 * Every plugin an installation can name, keyed by manifest id. Listing order
 * is display order for `zframes providers`; MOUNT order (routing precedence)
 * is the operator's installed list, not this record.
 */
export const BUILTIN_PLUGINS: ReadonlyMap<string, ProviderPluginManifest> =
  new Map(
    [KEYLESS_MANIFEST, BINANCE_MANIFEST, WALLET_MANIFEST, DEMO_MANIFEST].map(
      (manifest) => [manifest.id, manifest],
    ),
  );

/** What a host mounts, resolved from the operator's installed-plugin list. */
export interface Installation {
  /** The manifests to mount, in routing-precedence order. */
  manifests: ProviderPluginManifest[];
  /** Installed ids naming no known plugin — warn, never crash the board. */
  unknown: string[];
  /**
   * True when nothing real is mounted and the demo fallback is what renders:
   * the operator installed nothing (or nothing resolvable), so the board runs
   * on plainly-simulated data.
   */
  demoFallback: boolean;
}

/**
 * Resolve the operator's installed-plugin ids (the store config's `providers`
 * list; null/empty = nothing installed) against the registry.
 *
 * A bare install mounts the synthetic demo plugin, so a board always renders —
 * alive but honest (`synthetic` is what the chrome labels). The moment any
 * real plugin is installed the demo drops out: an operator who chose their
 * data must never have simulated numbers silently backfilling capabilities
 * their choice doesn't cover ("No data source" is the correct card there).
 */
export function resolveInstallation(
  installed: readonly string[] | null | undefined,
): Installation {
  const ids = (installed ?? []).filter((id, i, all) => all.indexOf(id) === i);
  const manifests: ProviderPluginManifest[] = [];
  const unknown: string[] = [];
  for (const id of ids) {
    const manifest = BUILTIN_PLUGINS.get(id);
    if (manifest) manifests.push(manifest);
    else unknown.push(id);
  }
  if (manifests.length > 0) return { manifests, unknown, demoFallback: false };
  return { manifests: [DEMO_MANIFEST], unknown, demoFallback: true };
}
