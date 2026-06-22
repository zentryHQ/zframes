/**
 * The `/__zframes/*` routes the runtime reserves — the single source of truth
 * for both the Node servers that ANSWER them (`./serve`, `./agent`, `./vite`)
 * and the browser code that CALLS them (the runtime app, `./fetch`).
 *
 * This module exists precisely because `./serve` and `./agent` import `node:*`
 * builtins: the browser bundle can import these route strings without dragging
 * in `node:fs` / `node:child_process`. So it stays pure — no React, no Node, no
 * other imports. Don't add any; that's the whole point of the split.
 */

/** Route the app FETCHES its spec from (GET). */
export const DASHBOARD_READ_ROUTE = "/__zframes/dashboard.json";
/** Route the editor SAVES its spec to (PUT/POST). */
export const DASHBOARD_WRITE_ROUTE = "/__zframes/dashboard";
/**
 * Same-origin relay for official-data hosts that browsers can't fetch directly
 * (no CORS header, or a UA/bot wall). The browser hits this same-origin route
 * (no CORS check); Node fetches the upstream (no CORS rule applies) and streams
 * it back.
 */
export const DASHBOARD_PROXY_ROUTE = "/__zframes/proxy";
/** GET → which agent runners are installed (drives the zAI orb's visibility). */
export const AGENTS_LIST_ROUTE = "/__zframes/agents";
/** POST { question, agent? } → run the question through a runner, return text. */
export const ASK_ROUTE = "/__zframes/ask";
