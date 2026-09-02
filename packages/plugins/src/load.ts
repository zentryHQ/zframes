/**
 * The browser half of the built-in plugin registry: dynamic imports, keyed by
 * the same ids `./registry` declares.
 *
 * Each entry is a `() => import(...)` of a plugin's `plugin` module, so every
 * plugin becomes its own chunk in the runtime bundle — the server names what
 * this installation mounts (GET `PROVIDERS_ROUTE`) and the app downloads
 * exactly those plugins, nothing else. Every loaded module goes through
 * `validateProviderPlugin`: the loader's contract is warn-and-skip, never
 * taking the board down over one bad plugin.
 */
import type { MarketDataProvider, ProvidersRouteBody } from "@zframes/spec";
import { PROVIDERS_ROUTE } from "@zframes/spec/routes";
import { validateProviderPlugin } from "@zframes/spec/provider-plugin";

/** id → the plugin module's dynamic import (its own browser chunk). */
const PLUGIN_MODULES: Record<string, () => Promise<unknown>> = {
  keyless: () => import("@zframes/providers-keyless/plugin"),
  binance: () => import("@zframes/provider-binance/plugin"),
  wallet: () => import("@zframes/provider-wallet/plugin"),
  demo: () => import("@zframes/provider-demo/plugin"),
};

export interface RuntimeProviders {
  /** Constructed providers in mount (routing-precedence) order. */
  providers: MarketDataProvider[];
  /**
   * How much of what is mounted fabricates its data — what the host chrome
   * labels, so simulated numbers are never mistaken for a market. "all" is the
   * bare-install demo fallback (or an operator who installed only synthetic
   * plugins); "some" is a demo co-mounted with live plugins, which still puts
   * generated numbers on cards no live provider covers and so still has to be
   * disclosed. Deliberately NOT a boolean: it used to be `allSynthetic`, and
   * one real plugin cleared the badge for the whole installation.
   * Footgun: every value is a truthy string — test `!== "none"`, never `if (…)`.
   */
  synthetic: "all" | "some" | "none";
  /**
   * Ids of the mounted plugins that fabricate their data, in mount order — the
   * disclosure copy names them (`zframes providers remove <id>`).
   */
  syntheticPlugins: string[];
  /**
   * True when nothing the operator named could be mounted and the demo plugin
   * stood in, rather than the operator having installed it on purpose. The two
   * cases need different advice ("no providers installed" vs "remove demo"),
   * and only this one is the product's own default.
   */
  demoFallback: boolean;
}

/**
 * Load and construct the named plugins. Unknown ids and invalid modules are
 * warned and skipped; an empty result falls back to the demo plugin so the
 * board still renders. Exported for tests via the `modules` parameter — the
 * runtime calls `resolveRuntimeProviders` below.
 */
export async function loadPluginProviders(
  ids: readonly string[],
  modules: Record<string, () => Promise<unknown>> = PLUGIN_MODULES,
): Promise<RuntimeProviders> {
  // Two buckets, concatenated live-first below. Capability routing is
  // first-match on array order (`useProviderFor` returns the first mounted
  // provider covering the capability) and a synthetic plugin answers EVERY
  // capability, so mounting one ahead of a real plugin silently hands it the
  // whole board. Sorting it last regardless of install order leaves it doing
  // only what it is for: standing in where nothing live is mounted.
  const live: MarketDataProvider[] = [];
  const simulated: MarketDataProvider[] = [];
  const syntheticPlugins: string[] = [];
  for (const id of ids) {
    const load = modules[id];
    if (!load) {
      console.warn(`zframes: unknown provider plugin "${id}" — skipped`);
      continue;
    }
    try {
      const result = validateProviderPlugin(await load());
      if (!result.ok) {
        console.warn(
          `zframes: provider plugin "${id}" is invalid — skipped:\n  ${result.errors.join("\n  ")}`,
        );
        continue;
      }
      const synthetic = result.plugin.manifest.synthetic === true;
      (synthetic ? simulated : live).push(...result.plugin.createProviders());
      if (synthetic) syntheticPlugins.push(id);
    } catch (error) {
      console.warn(`zframes: provider plugin "${id}" failed to load`, error);
    }
  }
  const providers = [...live, ...simulated];
  if (providers.length === 0 && !ids.includes("demo")) {
    // Nothing mounted (empty list, or every named plugin failed): fall back to
    // the synthetic demo so the board renders rather than showing every card
    // as "No data source". Flagged as a fallback, since the chrome's advice for
    // an accidental demo board differs from one the operator chose.
    return {
      ...(await loadPluginProviders(["demo"], modules)),
      demoFallback: true,
    };
  }
  return {
    providers,
    synthetic:
      simulated.length === 0 ? "none" : live.length === 0 ? "all" : "some",
    syntheticPlugins,
    demoFallback: false,
  };
}

/**
 * What the runtime app mounts: ask the server which plugins this installation
 * has (`PROVIDERS_ROUTE`), then load exactly those. A missing route (a static
 * host, an old server) or a failed fetch resolves to the demo plugin — the
 * app never crashes over provider discovery.
 *
 * Memoized module-wide: providers hold caches and, for streaming adapters, a
 * live socket, so React StrictMode's double-effect (and any second caller)
 * must reuse the one in-flight load rather than constructing a second fleet.
 */
let inflight: Promise<RuntimeProviders> | null = null;

export function resolveRuntimeProviders(): Promise<RuntimeProviders> {
  inflight ??= (async () => {
    let ids: string[] = [];
    try {
      const res = await fetch(PROVIDERS_ROUTE, { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as ProvidersRouteBody;
        if (Array.isArray(body?.plugins)) {
          ids = body.plugins
            .map((plugin) => plugin?.id)
            .filter((id): id is string => typeof id === "string");
        }
      }
    } catch {
      // No server / no route — the static-host case; fall through to demo.
    }
    return loadPluginProviders(ids);
  })();
  return inflight;
}
