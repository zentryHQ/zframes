import { resolve } from "node:path";
// Imported by the package subpath (not a relative "./serve") so that when Vite's
// config loader runs this file through Node, the extensionless relative import
// doesn't fail — `@zframes/core/serve` resolves via the exports map and pulls in
// a module with only built-in imports. Same contract the CLI's `serve` uses.
import {
  DASHBOARD_READ_ROUTE,
  DASHBOARD_WRITE_ROUTE,
  handleSpecRead,
  handleSpecWrite,
} from "@zframes/core/serve";

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
}

export function dashboardWriteback(options: DashboardWritebackOptions = {}) {
  const file = options.file ?? "src/dashboard.json";
  const writeRoute = options.route ?? DASHBOARD_WRITE_ROUTE;

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
    },
  };
}
