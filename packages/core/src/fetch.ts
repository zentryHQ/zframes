import type { ZodType } from "zod";

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
}

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT = "zframes (+https://github.com/zentryhq/zframes)";

export async function fetchJson<T>(
  url: string,
  schema?: ZodType<T>,
  { timeoutMs = DEFAULT_TIMEOUT_MS, init }: FetchJsonOptions = {},
): Promise<T> {
  const headers = new Headers(init?.headers);
  // Browsers forbid setting User-Agent (it's silently dropped); only bother in
  // Node/CLI runtimes, where a descriptive UA avoids anonymous-scraper throttling.
  if (typeof document === "undefined" && !headers.has("User-Agent")) {
    headers.set("User-Agent", USER_AGENT);
  }
  const res = await fetch(url, {
    ...init,
    headers,
    signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  const body = (await res.json()) as unknown;
  return schema ? schema.parse(body) : (body as T);
}
