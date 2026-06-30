import { resolve } from "node:path";
// Imported by the package subpath (not a relative "./serve") so that when Vite's
// config loader runs this file through Node, the extensionless relative import
// doesn't fail — `@zframes/core/serve` resolves via the exports map and pulls in
// a module with only built-in imports. Same contract the CLI's `serve` uses.
import {
  DASHBOARD_PROXY_ROUTE,
  DASHBOARD_READ_ROUTE,
  DASHBOARD_WRITE_ROUTE,
  handleProxy,
  handleSpecRead,
  handleSpecWrite,
} from "@zframes/core/serve";
import {
  AGENTS_LIST_ROUTE,
  ASK_ROUTE,
  handleAgents,
  handleAsk,
} from "@zframes/core/agent";
import {
  ACCOUNT_CREDENTIALS_ROUTE,
  ACCOUNT_PORTFOLIO_ROUTE,
  handleAccountCredentials,
  handleAccountPortfolio,
} from "@zframes/core/account";
// Store lookup, by package subpath (not relative "./store") for the same
// Vite-Node-loader reason the serve import above is — lets `vite dev` resolve
// the same default dashboard the CLI's no-arg `serve` does.
import { findDashboardFile, getDefault } from "@zframes/core/store";

/**
 * Dev-only Vite plugin that serves the dashboard spec to the in-browser app and
 * persists its edits straight back to the spec file. The app FETCHES the spec
 * from the read route and the editor PUTs the full spec JSON to the write route;
 * both hit the exact same read/write contract the CLI's `serve` ships (see
 * `./serve`), so `vite dev` dogfoods precisely what users run.
 *
 * Only active under `vite` / `vite dev` (apply: "serve"). Typed loosely (returns
 * a structural Vite Plugin) so @zframes/core needn't depend on vite — the host
 * already does.
 */
export interface DashboardWritebackOptions {
  /**
   * Explicit spec file to read/write, relative to the Vite project root. When
   * omitted (the default), the plugin resolves the store's default dashboard
   * (global-default-first, exactly like the CLI's no-arg `serve`), falling back
   * to the legacy in-repo `src/dashboard.json` only if the store is empty.
   */
  file?: string;
  /** HTTP route the editor PUTs to. */
  route?: string;
  /**
   * Contact for the official-data proxy's `User-Agent` (SEC fair-access policy).
   * Defaults to `ZFRAMES_CONTACT`, else a browser UA the sources accept.
   */
  contact?: string;
  /**
   * Compact frame catalogue (from `catalogueSummary`) injected into every zAI
   * prompt so the assistant can answer questions about what frames exist and do.
   * The host passes it (built from `@zframes/frames` metas) — core stays
   * decoupled from the frame set.
   */
  catalogue?: string;
}

export function dashboardWriteback(options: DashboardWritebackOptions = {}) {
  const explicitFile = options.file;
  const writeRoute = options.route ?? DASHBOARD_WRITE_ROUTE;
  const contact = options.contact ?? process.env.ZFRAMES_CONTACT;
  const proxyUserAgent = contact ? `zframes (${contact})` : undefined;

  return {
    name: "zframes:dashboard-writeback",
    apply: "serve" as const,
    configureServer(server: {
      config: { root: string };
      middlewares: {
        use: (
          path: string,
          handler: (req: any, res: any, next: () => void) => void,
        ) => void;
      };
    }) {
      // Resolve per request (not once) so editing the store default mid-session
      // is picked up: explicit `file` wins, else the store's default dashboard,
      // else the legacy in-repo spec — the dev mirror of `resolveServeTarget`.
      const target = () => {
        if (explicitFile) return resolve(server.config.root, explicitFile);
        const def = getDefault();
        if (def) {
          const stored = findDashboardFile(def);
          if (stored) return stored;
        }
        return resolve(server.config.root, "src/dashboard.json");
      };
      // Read route is registered first: connect matches by prefix, and the
      // write route is a prefix of the read route ("/__zframes/dashboard" ⊂
      // "/__zframes/dashboard.json"), so the read middleware must win the GET.
      server.middlewares.use(DASHBOARD_READ_ROUTE, (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        void handleSpecRead(target(), res);
      });
      server.middlewares.use(writeRoute, (req, res) => {
        handleSpecWrite(req, res, target());
      });
      // Same-origin official-data proxy — the dev mirror of the CLI serve route,
      // so frames needing CORS-blocked sources work identically under vite dev.
      server.middlewares.use(DASHBOARD_PROXY_ROUTE, (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        void handleProxy(req, res, { userAgent: proxyUserAgent });
      });
      // The zAI orb's keyless agent bridge — same contract the CLI's `serve`
      // ships, so `vite dev` dogfoods it too. Hidden when no runner is found.
      server.middlewares.use(AGENTS_LIST_ROUTE, (req, res, next) => {
        if (req.method !== "GET") return next();
        void handleAgents(res);
      });
      server.middlewares.use(ASK_ROUTE, (req, res) => {
        handleAsk(req, res, target(), options.catalogue);
      });
      // Keyed-account tier — signed portfolio read relay + the in-app connect
      // form's credential API; the dev mirror of the CLI serve routes.
      server.middlewares.use(ACCOUNT_PORTFOLIO_ROUTE, (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        void handleAccountPortfolio(req, res);
      });
      server.middlewares.use(ACCOUNT_CREDENTIALS_ROUTE, (req, res) => {
        void handleAccountCredentials(req, res);
      });
    },
  };
}
