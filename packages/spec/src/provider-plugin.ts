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
 *   2. the serve proxy's allowlist, derived from `hosts` so the relay can only
 *      reach hosts an install authorised;
 *   3. the per-installation AI catalogue, whose `source` vocabulary comes from
 *      `sources` rather than a list baked into the frame schemas;
 *   4. the install-time terms notice, via `termsUrl`.
 *
 * THREE OF THE FOUR ARE BUILT. The loader is `@zframes/plugins` (a registry of
 * the first-party plugins as lazy browser chunks — a third-party plugin can't
 * exist until this contract is published to npm, so the registry covers
 * everything loadable today), `zframes providers` manages the installed set,
 * and every mount derives its allowlist with `proxyHostsOf`. Still open: the
 * catalogue's `source` vocabulary is the enum in
 * `packages/frames/src/schemas/shared.ts`, held equal to the fleet manifest's
 * credits by `tests/keyless-source-credits.test.ts` until it derives.
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
  /**
   * Exact hostname, no scheme, no path, no wildcard — spelled the way
   * `URL.hostname` reports it, since that is what the allowlist compares.
   */
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
   * True when the plugin fabricates its data and contacts nothing.
   *
   * It is a DECLARATION, not a safety mechanism: nothing renders a watermark
   * off it today, so a host that wants generated numbers to be distinguishable
   * from a market has to do that itself. Labelling simulated data in the chrome
   * is the obvious consumer and does not exist yet.
   */
  synthetic?: boolean;
  /**
   * True when the operator has to supply a credential before this plugin can
   * answer. Surfaced by `zframes providers` so an agent stops asking for boards
   * it cannot fill.
   */
  requiresCredentials?: boolean;
}

/**
 * What GET `PROVIDERS_ROUTE` answers: the plugins this installation mounts, in
 * mount (= routing-precedence) order. Deliberately just identity + the two
 * flags the app renders chrome from — the full manifests stay server-side,
 * where the allowlist and the install-time notice read them.
 */
export interface ProvidersRouteBody {
  plugins: Array<{
    id: string;
    name: string;
    synthetic?: boolean;
    requiresCredentials?: boolean;
  }>;
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

/**
 * A dotted hostname: at least two labels, each starting and ending
 * alphanumeric. Requiring the dot is what rejects `localhost` and every other
 * dotless internal name, and the per-label shape rejects `..`, a leading or
 * trailing dot, and a label edged with a hyphen.
 */
const PUBLIC_HOSTNAME =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

/**
 * Suffixes reserved for, or conventionally used by, names that only resolve
 * inside a network: the IETF special-use names (`.localhost`, `.local`,
 * `.test`, `.invalid`, `.home.arpa`), the ICANN name-collision strings
 * (`.corp`, `.home`, plus `.internal`, reserved 2024), and the router/mDNS
 * conventions (`.lan`, `.intranet`, `.localdomain`).
 */
const INTERNAL_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".intranet",
  ".corp",
  ".home",
  ".home.arpa",
  ".lan",
  ".test",
  ".localdomain",
  ".invalid",
];

/**
 * True for a target that can only be inside the operator's own network:
 * loopback and the unspecified space, RFC1918, CGNAT (RFC 6598), link-local
 * (which is where cloud instance metadata lives), benchmarking (198.18/15),
 * multicast and reserved IPv4, and the internal-only name suffixes above.
 *
 * A LINT, not the security boundary: a public NAME resolves wherever its owner
 * points it, which no string check can see. The boundary is serve's relay,
 * which resolves every hop and refuses one whose addresses are not all public.
 * This check exists so an honest mistake fails at install time with a readable
 * error instead of as a 403 at request time.
 */
function isInternalHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (INTERNAL_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return true;
  const octets = lower.split(".");
  if (octets.length !== 4 || !octets.every((part) => /^\d{1,3}$/.test(part))) {
    return false;
  }
  const [a, b] = octets.map(Number);
  if (a === undefined || b === undefined) return false;
  if (a === 0 || a === 127) return true; // unspecified, loopback
  if (a === 10) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC 6598)
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/**
 * The spelling `URL.hostname` would report for this host, or null when URL
 * refuses it outright (`999.1.1.1`, a five-part IPv4 shape).
 *
 * The relay compares allowlist entries against `URL.hostname`, so an entry
 * spelled any way URL would normalise — a hex or octal IPv4 like `0x7f.0.0.1`
 * most of all — is an entry that can never match: authorised on paper, dead in
 * practice, and in the hex-IP case a disguise for an address `isInternalHost`
 * would have refused. Requiring the canonical spelling closes both.
 */
function canonicalHostname(host: string): string | null {
  try {
    return new URL(`https://${host}`).hostname;
  } catch {
    return null;
  }
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
  // Three different failures are being closed here.
  //
  // A scheme, a path, a port or a wildcard can never match, because the
  // allowlist compares against `URL.hostname`. Left in, such an entry reads as
  // an authorised host that silently never works. The same goes for any
  // non-canonical spelling URL would normalise away (see `canonicalHostname`).
  //
  // A loopback, private, link-local or internal-suffixed target is refused at
  // install time so the mistake is readable where it was made. It is NOT what
  // stops the SSRF: a public name can resolve anywhere its owner points it, so
  // the relay separately resolves every hop and refuses non-public addresses
  // at fetch time. A published data programme never lives at one of these, so
  // refusing them here costs nothing real.
  host: z
    .string()
    .min(1)
    .regex(PUBLIC_HOSTNAME, "host must be a bare public hostname")
    .refine((host) => canonicalHostname(host) === host.toLowerCase(), {
      message: "host is not in canonical URL.hostname form",
    })
    .refine((host) => !isInternalHost(host), {
      message: "host is loopback, private, link-local or internal-only",
    }),
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

  // "Fabricates its data and contacts nothing" and "here are the hosts I
  // contact" cannot both be true. Rejecting is the only honest reading: either
  // field could be the mistake, so guessing which would silently publish a
  // manifest its author never meant.
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
