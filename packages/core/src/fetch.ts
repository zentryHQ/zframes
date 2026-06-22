import type { ZodType } from "zod";
import { DASHBOARD_PROXY_ROUTE } from "./routes";

/**
 * Polite, resilient JSON fetch shared by every provider. Centralises the
 * transport concerns each provider would otherwise repeat (or skip):
 *  - aborts after `timeoutMs` so a stalled connection can't wedge the poll loop
 *  - sends a descriptive User-Agent in non-browser (Node/CLI) runtimes, where
 *    public APIs penalise anonymous traffic (browsers forbid setting it)
 *  - throws a labelled error on a non-2xx response
 *  - optionally validates the body with a Zod schema, so a shape change throws
 *    here with a clear message instead of surfacing later as an opaque
 *    "undefined is not an object" deep inside a frame
 *
 * React-free on purpose (deep export `@zframes/core/fetch`) so providers can
 * use it without pulling React into their bundle.
 */
export interface FetchJsonOptions {
  /** Abort the request after this many ms (default 10_000). */
  timeoutMs?: number;
  /** Extra request init — method, body, headers (e.g. Hyperliquid's POSTs). */
  init?: RequestInit;
  /**
   * Route through the runtime's same-origin proxy when running in the browser,
   * for official-data hosts that aren't browser-CORS-safe (SEC XBRL, H.15, …).
   * In Node it's a no-op (Node has no CORS rule) — the request goes direct, so a
   * provider can pass its own `User-Agent` in `init` for the Node path. The
   * proxy only exists while `zframes serve` / `vite dev` is running; in a static
   * deploy a proxied fetch 404s and the caller surfaces its empty/error state.
   */
  proxied?: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = "zframes (+https://github.com/zentryhq/zframes)";

export async function fetchJson<T>(
  url: string,
  schema?: ZodType<T>,
  { timeoutMs = DEFAULT_TIMEOUT_MS, init, proxied }: FetchJsonOptions = {},
): Promise<T> {
  const headers = new Headers(init?.headers);
  // Browsers forbid setting User-Agent (it's silently dropped); only bother in
  // Node/CLI runtimes, where a descriptive UA avoids anonymous-scraper throttling.
  if (typeof document === "undefined" && !headers.has("User-Agent")) {
    headers.set("User-Agent", USER_AGENT);
  }
  // In the browser, a proxied request becomes a same-origin call to the local
  // runtime, which relays the real host. In Node, fetch the target directly.
  const target =
    proxied && typeof document !== "undefined"
      ? `${DASHBOARD_PROXY_ROUTE}?url=${encodeURIComponent(url)}`
      : url;
  const res = await fetch(target, {
    ...init,
    headers,
    signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  const body = (await res.json()) as unknown;
  return schema ? schema.parse(body) : (body as T);
}
