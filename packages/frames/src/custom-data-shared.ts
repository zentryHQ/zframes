/**
 * React-free helpers behind the `custom-data` frame — the escape-hatch frame
 * that renders an arbitrary keyless HTTPS JSON API declared in the spec.
 *
 * Everything here is security-sensitive: the URL and the extraction path are
 * UNTRUSTED (a dashboard.json can be forked from anyone via the explorer), and
 * the fetched body is doubly so. The rails, in one place so they're auditable:
 *
 *  - URL: https only, and never a private/loopback/link-local host — a shared
 *    spec must not be able to aim the viewer's browser at their own machine or
 *    LAN (`validateCustomUrl`). The frame fetches browser-direct with
 *    `credentials: "omit"` and NEVER through the runtime's server-side proxy,
 *    so a custom URL can't reach the proxy relay at all (no SSRF surface).
 *  - Path: parsed by a tiny eval-free walker (`extractByPath`) that reads own
 *    properties only and refuses `__proto__` / `constructor` / `prototype`
 *    segments, so a hostile path or body can't walk into the prototype chain.
 *  - Output: capped — bounded segment count, bounded wildcard fan-out, and
 *    string values clamped (`clampText`) before they reach the DOM. Values are
 *    only ever rendered as React text nodes, never as markup.
 *
 * This module is imported by `schemas.ts` (the URL refine gives the generating
 * agent lint-time feedback) so it must stay React-free.
 */

/** Longest accepted extraction path, in characters. */
export const MAX_PATH_LENGTH = 200;
/** Deepest accepted extraction path, in segments. */
export const MAX_PATH_SEGMENTS = 16;
/** Most values a wildcard extraction may return (chart/table row cap). */
export const MAX_POINTS = 500;
/** Longest string value rendered before clamping (labels, table cells). */
export const MAX_TEXT = 200;
/** Largest response body parsed, in characters (~2 MB). */
export const MAX_BODY_CHARS = 2_000_000;

/** Prototype-chain segments the walker refuses outright. */
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Hosts a custom-data URL may never target: the viewer's own machine and
 * private/link-local ranges. This is a browser-side courtesy guard — HTTPS +
 * CORS already stop most of this — but it keeps a forked spec from even
 * attempting GETs against localhost services or LAN gear.
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::1" ||
    host === "::"
  )
    return true;
  // IPv4 literals: loopback, RFC-1918 private, link-local, and CGNAT ranges.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  // IPv6 literals: unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host))
    return true;
  return false;
}

/**
 * Validate a custom-data URL. Returns an error message, or null when the URL
 * is acceptable: parseable, https, non-private host. Shared by the Zod schema
 * (agent lint-time feedback) and the fetch path (runtime defense in depth).
 */
export function validateCustomUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "not a valid URL";
  }
  if (parsed.protocol !== "https:") return "only https:// URLs are allowed";
  if (parsed.username || parsed.password)
    return "URLs with embedded credentials are not allowed";
  if (isBlockedHost(parsed.hostname))
    return "private/localhost hosts are not allowed";
  return null;
}

/** One parsed path segment: an object key, an array index, or a wildcard. */
type PathSegment =
  | { kind: "key"; key: string }
  | { kind: "index"; index: number }
  | { kind: "wildcard" };

/**
 * Parse a dot/bracket extraction path — `hourly.temperature_2m`,
 * `data[0].price`, `items[*].name`, `results.*.value` — into segments.
 * Throws with a readable message on anything else; there is deliberately no
 * expression syntax of any kind.
 */
export function parsePath(path: string): PathSegment[] {
  if (path.length === 0) throw new Error("path is empty");
  if (path.length > MAX_PATH_LENGTH)
    throw new Error(`path longer than ${MAX_PATH_LENGTH} chars`);
  const segments: PathSegment[] = [];
  // Split into dot parts first, then peel bracket suffixes off each part.
  for (const part of path.split(".")) {
    const m = part.match(/^([^[\]]*)((?:\[[^[\]]*\])*)$/);
    if (!m) throw new Error(`bad path segment "${part}"`);
    const [, head, brackets] = m;
    if (head === "*") segments.push({ kind: "wildcard" });
    else if (head !== "") segments.push({ kind: "key", key: head });
    else if (brackets === "")
      throw new Error(`empty path segment in "${path}"`);
    if (brackets) {
      for (const b of brackets.match(/\[[^[\]]*\]/g) ?? []) {
        const inner = b.slice(1, -1);
        if (inner === "*") segments.push({ kind: "wildcard" });
        else if (/^\d+$/.test(inner))
          segments.push({ kind: "index", index: Number(inner) });
        else
          throw new Error(`bad bracket "${b}" — use [0]-style indices or [*]`);
      }
    }
  }
  if (segments.length === 0) throw new Error("path is empty");
  if (segments.length > MAX_PATH_SEGMENTS)
    throw new Error(`path deeper than ${MAX_PATH_SEGMENTS} segments`);
  for (const seg of segments)
    if (seg.kind === "key" && FORBIDDEN_SEGMENTS.has(seg.key))
      throw new Error(`"${seg.key}" is not allowed in a path`);
  return segments;
}

/** Own-property read — never consults the prototype chain. */
function readKey(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  if (Array.isArray(value)) return undefined;
  return Object.prototype.hasOwnProperty.call(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function walk(value: unknown, segments: PathSegment[], from: number): unknown {
  let current = value;
  for (let i = from; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.kind === "key") current = readKey(current, seg.key);
    else if (seg.kind === "index")
      current = Array.isArray(current) ? current[seg.index] : undefined;
    else {
      // Wildcard: map the remaining path over each element, flattening one
      // level. Capped so a huge body can't fan out unboundedly.
      if (!Array.isArray(current)) return undefined;
      const out: unknown[] = [];
      for (const item of current.slice(0, MAX_POINTS)) {
        const mapped = walk(item, segments, i + 1);
        if (mapped === undefined) continue;
        if (Array.isArray(mapped)) out.push(...mapped.slice(0, MAX_POINTS));
        else out.push(mapped);
        if (out.length >= MAX_POINTS) break;
      }
      return out.slice(0, MAX_POINTS);
    }
    if (current === undefined) return undefined;
  }
  return current;
}

/**
 * Extract the value(s) at `path` inside a parsed JSON body. Returns the raw
 * value (scalar, object, or array — arrays capped at {@link MAX_POINTS}).
 * Throws on a malformed path; returns undefined when the path doesn't resolve.
 */
export function extractByPath(body: unknown, path: string): unknown {
  const result = walk(body, parsePath(path), 0);
  return Array.isArray(result) ? result.slice(0, MAX_POINTS) : result;
}

/** Clamp a rendered string so a hostile body can't dump megabytes into a cell. */
export function clampText(value: string): string {
  return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
}

/**
 * Normalise an extracted value into display cells: always an array (a scalar
 * becomes a one-element array), each cell either a finite number or a clamped
 * string. Objects/arrays-in-cells render as a short JSON preview, clamped.
 */
export function toCells(extracted: unknown): Array<number | string> {
  const list = Array.isArray(extracted) ? extracted : [extracted];
  return list.slice(0, MAX_POINTS).map((v) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "boolean") return String(v);
    if (typeof v === "string") {
      const n = Number(v);
      // Numeric strings chart as numbers ("42.5" from a stringly-typed API).
      if (v.trim() !== "" && Number.isFinite(n)) return n;
      return clampText(v);
    }
    if (v === null || v === undefined) return "—";
    try {
      return clampText(JSON.stringify(v) ?? "—");
    } catch {
      return "—";
    }
  });
}

/** The numeric cells only — what the chart displays draw. */
export function numericCells(cells: Array<number | string>): number[] {
  return cells.filter((c): c is number => typeof c === "number");
}
