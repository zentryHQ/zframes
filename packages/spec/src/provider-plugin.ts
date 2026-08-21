/**
 * The provider-plugin contract: what an installed data adapter declares about
 * itself, and how a host validates one it loaded at run time.
 *
 * WHY THIS EXISTS. zframes ships frames and the assembly layer; it does not
 * ship a decision about which third-party endpoint a board calls. Adapters are
 * therefore installed by the operator as an affirmative, named act, and the
 * runtime discovers them instead of importing them. Discovery needs a
 * declaration, and exactly one declaration feeds four consumers:
 *
 *   1. the loader / `zframes providers`, so an assembling agent can see which
 *      capabilities are actually mounted before it writes a `dashboard.json`;
 *   2. the serve proxy's allowlist, which is DERIVED from `hosts` and ships
 *      empty, so the relay can only reach hosts an install authorised;
 *   3. the per-installation AI catalogue, whose `source` vocabulary comes from
 *      `sources` rather than a list baked into the frame schemas;
 *   4. the install-time terms notice, via `termsUrl`.
 *
 * A plugin is a plain module: a `manifest` plus a `createProviders()` factory.
 * No base class, no lifecycle, nothing to inherit. That keeps a hand-written
 * adapter (the case where an agent wrote the fetch code for a source its user
 * chose) exactly as first-class as a published one.
 */
import { z } from "zod";
import type { Capability, MarketDataProvider } from "./types";

/**
 * A data-provenance credit the plugin contributes. `id` is the value a card's
 * `source` field pins, so it doubles as the routing key: it must be stable
 * across versions or existing boards silently repoint.
 */
export interface ProviderCredit {
  /** Stable, lowercase, no spaces. What a card's `source` field holds. */
  id: string;
  /** Display name shown in the card chrome, e.g. "U.S. Treasury". */
  name: string;
  /** Canonical page opened when the credit is clicked. */
  url: string;
  /**
   * Symbol conventions and limits a generating agent needs in order to pin
   * this source correctly. It lands in the per-installation catalogue, which
   * is why it lives with the adapter and not in a frame schema: the adapter is
   * the only thing that knows its own venue.
   */
  notes?: string;
}

/** A host the plugin contacts, and how. */
export interface ProviderHost {
  /** Exact hostname, no scheme, no path, no wildcard. */
  host: string;
  /**
   * True when the browser cannot reach this host directly (no CORS header) and
   * the request has to go through serve's relay. Only `proxied` hosts enter the
   * derived allowlist; a CORS-open host needs no relay entry.
   */
  proxied?: boolean;
  /** One line the operator reads at install time: what is fetched, and why. */
  reason?: string;
}

/**
 * Everything a plugin declares about itself. Pure data, so it can be read
 * without constructing providers: an instance holds caches and, for streaming
 * adapters, a live socket, and neither `zframes providers` nor the allowlist
 * derivation should pay that cost.
 */
export interface ProviderPluginManifest {
  /** Stable plugin id, lowercase. Namespaces nothing; just identifies. */
  id: string;
  /** Display name for `zframes providers` output. */
  name: string;
  /** Where the operator reads what they are agreeing to by installing this. */
  termsUrl?: string;
  /** One line: what this plugin covers. */
  description?: string;
  /** The union of every capability this plugin's providers serve. */
  capabilities: readonly Capability[];
  /** The credits and `source` ids this plugin contributes. */
  sources: readonly ProviderCredit[];
  /** Hosts contacted. Empty for a synthetic plugin. */
  hosts: readonly ProviderHost[];
  /**
   * True when the plugin fabricates its data and contacts nothing. The chrome
   * watermarks a synthetic board, so this is load-bearing rather than
   * decorative: an operator must never mistake generated numbers for a market.
   */
  synthetic?: boolean;
  /**
   * True when the operator has to supply a credential before this plugin can
   * answer. Surfaced by `zframes providers` so an agent stops asking for boards
   * it cannot fill.
   */
  requiresCredentials?: boolean;
}

/** An installed data adapter, as the loader sees it. */
export interface ProviderPlugin {
  manifest: ProviderPluginManifest;
  /**
   * Construct the providers. Called once per host mount, never per render.
   * Returning several is normal: one package may cover unrelated capabilities
   * with separate adapters.
   */
  createProviders(): MarketDataProvider[];
}

const CreditSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      "source ids are lowercase alphanumeric with dashes",
    ),
  name: z.string().min(1),
  url: z.string().url(),
  notes: z.string().optional(),
});

const HostSchema = z.object({
  // Rejects a scheme, a path, a port and a wildcard: the allowlist compares
  // against URL.hostname, so anything else can never match and would read as
  // an authorised host that silently never works.
  host: z
    .string()
    .min(1)
    .regex(/^[a-z0-9.-]+$/i, "host must be a bare hostname"),
  proxied: z.boolean().optional(),
  reason: z.string().optional(),
});

/**
 * Capability strings are NOT checked against the `Capability` union: it is a
 * type-only union with no run-time counterpart, and an unknown capability is
 * already harmless because nothing routes to it. Such a frame renders the
 * existing "No data source" card, which is the correct failure.
 */
const ManifestSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "plugin ids are lowercase with dashes"),
  name: z.string().min(1),
  termsUrl: z.string().url().optional(),
  description: z.string().optional(),
  capabilities: z.array(z.string().min(1)).readonly(),
  sources: z.array(CreditSchema).readonly(),
  hosts: z.array(HostSchema).readonly(),
  synthetic: z.boolean().optional(),
  requiresCredentials: z.boolean().optional(),
});

export type ProviderPluginValidation =
  { ok: true; plugin: ProviderPlugin } | { ok: false; errors: string[] };

/**
 * Validate a dynamically imported module as a plugin.
 *
 * Accepts either the module namespace or a default export, since an adapter
 * author may reasonably write either. Failures are collected rather than
 * thrown: the loader's contract is to warn, skip the plugin, and leave the
 * board rendering, never to take the dashboard down over one bad install.
 */
export function validateProviderPlugin(
  value: unknown,
): ProviderPluginValidation {
  const candidate = unwrapModule(value);
  if (!candidate) {
    return { ok: false, errors: ["not an object with a `manifest`"] };
  }

  const errors: string[] = [];
  const parsed = ManifestSchema.safeParse(candidate.manifest);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length ? issue.path.join(".") : "manifest";
      errors.push(`manifest.${path}: ${issue.message}`);
    }
  }
  if (typeof candidate.createProviders !== "function") {
    errors.push("createProviders: expected a function");
  }

  // A plugin declaring no capability can never serve a frame, so mounting it
  // would be a silent no-op. Say so at install time instead.
  if (parsed.success && parsed.data.capabilities.length === 0) {
    errors.push("manifest.capabilities: declares none, so nothing can route");
  }

  // The synthetic flag is what the chrome watermarks on, so a plugin that both
  // claims to fabricate data and names hosts is a contradiction that has to be
  // resolved by its author, not guessed at here.
  if (parsed.success && parsed.data.synthetic && parsed.data.hosts.length > 0) {
    errors.push("manifest: synthetic plugins must declare no hosts");
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, plugin: candidate as unknown as ProviderPlugin };
}

function unwrapModule(
  value: unknown,
): { manifest: unknown; createProviders?: unknown } | null {
  for (const level of [value, (value as { default?: unknown })?.default]) {
    if (level && typeof level === "object" && "manifest" in level) {
      return level as { manifest: unknown; createProviders?: unknown };
    }
  }
  return null;
}

/**
 * The hosts a set of installed plugins authorises the relay to reach.
 *
 * Only `proxied` hosts are included: the relay exists for hosts the browser
 * cannot call itself, and widening it to CORS-open hosts would hand the local
 * process reach it never needs. Serve starts from an EMPTY set and adds only
 * what this returns, so an installation with no plugins has no reachable host.
 */
export function proxyHostsOf(
  manifests: readonly ProviderPluginManifest[],
): string[] {
  const hosts = new Set<string>();
  for (const manifest of manifests) {
    for (const entry of manifest.hosts) {
      if (entry.proxied) hosts.add(entry.host.toLowerCase());
    }
  }
  return [...hosts].sort();
}

/**
 * The `source` vocabulary a set of installed plugins contributes, deduplicated
 * by id with the first declaration winning (mount order is the operator's
 * precedence, same rule capability routing already follows).
 */
export function sourceCreditsOf(
  manifests: readonly ProviderPluginManifest[],
): ProviderCredit[] {
  const byId = new Map<string, ProviderCredit>();
  for (const manifest of manifests) {
    for (const credit of manifest.sources) {
      if (!byId.has(credit.id)) byId.set(credit.id, credit);
    }
  }
  return [...byId.values()];
}

/** Every capability a set of installed plugins serves, deduplicated. */
export function capabilitiesOf(
  manifests: readonly ProviderPluginManifest[],
): Capability[] {
  const seen = new Set<Capability>();
  for (const manifest of manifests) {
    for (const capability of manifest.capabilities) seen.add(capability);
  }
  return [...seen];
}
