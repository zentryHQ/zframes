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
  /** Spec file to read/write, relative to the Vite project root. */
  file?: string;
  /** HTTP route the editor PUTs to. */
  route?: string;
  /**
   * Contact for the official-data proxy's `User-Agent` (SEC fair-access policy).
   * Defaults to `ZFRAMES_CONTACT`, else a browser UA the sources accept.
   */
  contact?: string;
}

export function dashboardWriteback(options: DashboardWritebackOptions = {}) {
  const file = options.file ?? "src/dashboard.json";
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
      const target = () => resolve(server.config.root, file);
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
        handleAsk(req, res, target());
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
