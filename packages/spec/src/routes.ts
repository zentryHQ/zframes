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
 * Global-store switcher, answered only when `serve` hosts a *named* store
 * dashboard (not an explicit file path). GET lists the dashboards available to
 * switch among + which is current; POST `{ name }` re-points the running server
 * at another store dashboard so the app can reload into it. Answered by the CLI
 * `serve` process, which owns the mutable current-file pointer — under
 * `vite dev` they're absent, so the app simply hides the switcher.
 */
export const DASHBOARD_LIST_ROUTE = "/__zframes/dashboards";
export const DASHBOARD_SWITCH_ROUTE = "/__zframes/switch";
/**
 * Same-origin relay for official-data hosts that browsers can't fetch directly
 * (no CORS header, or a UA/bot wall). The browser hits this same-origin route
 * (no CORS check); Node fetches the upstream (no CORS rule applies) and streams
 * it back.
 */
export const DASHBOARD_PROXY_ROUTE = "/__zframes/proxy";
/**
 * Keyed-account tier. The signed read relay returns a connected account's
 * portfolio (`?source=binance`); the credential route is the in-app connect
 * form's backend (POST connect / GET status / DELETE disconnect). Both are
 * loopback-only and the secret is held in a local file, never in the spec. The
 * keyless on-chain wallet does NOT use these — it reads public data directly.
 */
export const ACCOUNT_PORTFOLIO_ROUTE = "/__zframes/account/portfolio";
export const ACCOUNT_CREDENTIALS_ROUTE = "/__zframes/account/credentials";
/** GET → which agent runners are installed (drives the zAI orb's visibility). */
export const AGENTS_LIST_ROUTE = "/__zframes/agents";
/** POST { question, agent? } → run the question through a runner, return text. */
export const ASK_ROUTE = "/__zframes/ask";
