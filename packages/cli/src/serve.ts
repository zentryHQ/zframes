import { existsSync, statSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sirv from "sirv";
import {
  DASHBOARD_PROXY_ROUTE,
  DASHBOARD_READ_ROUTE,
  DASHBOARD_WRITE_ROUTE,
  handleProxy,
  handleSpecRead,
  handleSpecWrite,
} from "@zframes/core/serve";
import {
  DASHBOARD_LIST_ROUTE,
  DASHBOARD_SWITCH_ROUTE,
} from "@zframes/core/routes";
import {
  dashboardPath,
  dashboardsDir,
  isValidName,
  listDashboards,
  resolveServeTarget,
  type ResolvedTarget,
} from "@zframes/core/store";
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
  isLocalRequest,
} from "@zframes/core/account";
import { catalogueSummary } from "@zframes/core/catalogue";
import { frameMetas } from "@zframes/frames/schemas";

const DEFAULT_PORT = 37263;
const MAX_SWITCH_BODY_BYTES = 100_000;

// Built once: the compact frame catalogue handed to the zAI ask route so the
// embedded assistant knows what frames exist and what each does, version-matched
// to this build (see handleAsk → buildPrompt).
const FRAME_CATALOGUE = catalogueSummary(frameMetas);

interface ServeArgs {
  /** The positional dashboard arg (store name or path); undefined → resolve a default. */
  file?: string;
  port: number;
  contact?: string;
}

function parseArgs(args: string[]): ServeArgs | { error: string } {
  let file: string | undefined;
  let port = DEFAULT_PORT;
  let contact = process.env.ZFRAMES_CONTACT;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--port" || a === "-p") {
      port = Number(args[++i]);
    } else if (a.startsWith("--port=")) {
      port = Number(a.slice("--port=".length));
    } else if (a === "--contact") {
      contact = args[++i];
    } else if (a.startsWith("--contact=")) {
      contact = a.slice("--contact=".length);
    } else if (!a.startsWith("-")) {
      file = a;
    } else {
      return { error: `unknown option "${a}"` };
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: "--port must be an integer between 1 and 65535" };
  }
  return { file, port, contact };
}

function isFile(file: string): boolean {
  return existsSync(file) && statSync(file).isFile();
}

/** Send a JSON body with a status (no-store — the switcher state is live). */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

export function serve(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if ("error" in parsed) {
    console.error(`✗ ${parsed.error}`);
    console.error(
      "usage: zframes serve [name|dashboard.json] [--port <n>] [--contact <email>]",
    );
    return Promise.resolve(1);
  }

  const target = resolveServeTarget(parsed.file, process.cwd());
  if ("error" in target) {
    console.error(`✗ ${target.error}`);
    return Promise.resolve(1);
  }

  // The dashboard the server currently hosts. Mutable: the in-app switcher
  // (POST /__zframes/switch) re-points it among store dashboards, and the
  // read/write/ask routes always act on whatever it points at right now.
  let current: ResolvedTarget = target;
  // Switching is offered only when serving from the store — store dashboards
  // share the stable `dashboards/` sibling root, so the sirv instance below
  // stays correct across switches. An explicit path serves exactly one file.
  const canSwitch = target.kind === "store";
  const siblingRoot =
    target.kind === "store" ? dashboardsDir() : resolve(target.file, "..");

  // The prebuilt runtime ships next to dist/ (see scripts/build-runtime.mjs).
  const bundleDir = fileURLToPath(new URL("../runtime", import.meta.url));
  if (!existsSync(join(bundleDir, "index.html"))) {
    console.error(`✗ runtime bundle missing at ${bundleDir}`);
    console.error("  run `pnpm build:cli` to build it.");
    return Promise.resolve(1);
  }

  // Static serving via sirv (MIME, ETag, range, traversal safety). `dev: true`
  // re-stats per request so a saved sibling file or a rebuilt bundle is never
  // served stale — the right trade for a localhost live-editing tool. Three
  // roots tried in order: bundle assets, then sibling files next to the
  // dashboard, then the bundle's index.html as the SPA fallback.
  const serveBundle = sirv(bundleDir, { dev: true });
  const serveSiblings = sirv(siblingRoot, { dev: true });
  const serveSpa = sirv(bundleDir, { dev: true, single: true });

  // POST /__zframes/switch { name } → re-point `current` at another store
  // dashboard. Loopback-guarded (defeats DNS-rebinding, which the JSON
  // content-type/CSRF check alone can't) and bounded; `isValidName` forbids
  // "/"/".." so there is no path-traversal vector, and the target must already
  // exist in the store — switching never creates a file.
  function handleSwitch(req: IncomingMessage, res: ServerResponse): void {
    if (!isLocalRequest(req)) {
      sendJson(res, 403, { ok: false, error: "loopback only" });
      return;
    }
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    if (!canSwitch) {
      sendJson(res, 409, {
        ok: false,
        error: "switching is only available when serving from the store",
      });
      return;
    }
    if (
      !String(req.headers["content-type"] ?? "").includes("application/json")
    ) {
      res.statusCode = 415;
      res.end();
      return;
    }
    let body = "";
    let aborted = false;
    req.on("data", (chunk: Buffer) => {
      if (aborted) return;
      body += chunk;
      if (body.length > MAX_SWITCH_BODY_BYTES) {
        aborted = true;
        res.statusCode = 413;
        res.end();
        req.destroy();
      }
    });
    req.on("end", () => {
      if (aborted) return;
      let name: unknown;
      try {
        name = (JSON.parse(body || "{}") as { name?: unknown }).name;
      } catch {
        sendJson(res, 400, { ok: false, error: "invalid JSON body" });
        return;
      }
      if (typeof name !== "string" || !isValidName(name)) {
        sendJson(res, 400, { ok: false, error: "invalid dashboard name" });
        return;
      }
      const file = dashboardPath(name);
      if (!isFile(file)) {
        sendJson(res, 404, {
          ok: false,
          error: `no dashboard named "${name}" in the store`,
        });
        return;
      }
      current = { kind: "store", name, file };
      sendJson(res, 200, { ok: true, name });
    });
  }

  return new Promise<number>((done) => {
    const server = createServer((req, res) => {
      const rawPath = (req.url ?? "/").split("?")[0];
      let path: string;
      try {
        path = decodeURIComponent(rawPath);
      } catch {
        res.statusCode = 400;
        res.end();
        return;
      }

      // 1. Reserved routes — the spec read/write contract (shared with dev). All
      //    spec routes act on `current.file`, so a mid-session switch is picked
      //    up by the very next request.
      if (path === DASHBOARD_READ_ROUTE) {
        if (req.method === "GET" || req.method === "HEAD") {
          void handleSpecRead(current.file, res);
        } else {
          res.statusCode = 405;
          res.end();
        }
        return;
      }
      if (path === DASHBOARD_WRITE_ROUTE) {
        handleSpecWrite(req, res, current.file);
        return;
      }
      // Global-store switcher: list available dashboards + which is current, and
      // switch among them. Both only meaningful when serving from the store, and
      // both loopback-guarded (the list leaks dashboard names — keep it local).
      if (path === DASHBOARD_LIST_ROUTE) {
        if (!isLocalRequest(req)) {
          sendJson(res, 403, { ok: false, error: "loopback only" });
          return;
        }
        if (req.method === "GET" || req.method === "HEAD") {
          sendJson(res, 200, {
            current: current.kind === "store" ? current.name : null,
            canSwitch,
            dashboards: canSwitch
              ? listDashboards().map((e) => ({
                  name: e.name,
                  title: e.title,
                  isDefault: e.isDefault,
                }))
              : [],
          });
        } else {
          res.statusCode = 405;
          res.end();
        }
        return;
      }
      if (path === DASHBOARD_SWITCH_ROUTE) {
        handleSwitch(req, res);
        return;
      }
      // The zAI orb's keyless agent bridge (opt-in, shells to a local CLI).
      if (path === AGENTS_LIST_ROUTE) {
        if (req.method === "GET") {
          void handleAgents(res);
        } else {
          res.statusCode = 405;
          res.end();
        }
        return;
      }
      if (path === ASK_ROUTE) {
        handleAsk(req, res, current.file, FRAME_CATALOGUE);
        return;
      }
      // Keyed-account tier: signed portfolio read relay + the in-app connect
      // form's credential API. Loopback-only; the secret stays in a local file.
      if (path === ACCOUNT_PORTFOLIO_ROUTE) {
        void handleAccountPortfolio(req, res);
        return;
      }
      if (path === ACCOUNT_CREDENTIALS_ROUTE) {
        void handleAccountCredentials(req, res);
        return;
      }
      // Same-origin relay for official-data hosts that browsers can't fetch
      // directly (no CORS / UA wall). Host-allowlisted inside handleProxy.
      if (path === DASHBOARD_PROXY_ROUTE) {
        void handleProxy(req, res, {
          userAgent: parsed.contact ? `zframes (${parsed.contact})` : undefined,
        });
        return;
      }
      if (path.startsWith("/__zframes/")) {
        res.statusCode = 404;
        res.end();
        return;
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        res.statusCode = 405;
        res.end();
        return;
      }

      // 2. Bundle assets ("/" → index.html, hashed /assets/*) → 3. sibling
      //    files next to the dashboard (e.g. /daily-analysis.json, local
      //    images) → 4. SPA fallback to the bundle's index.html.
      serveBundle(req, res, () =>
        serveSiblings(req, res, () =>
          serveSpa(req, res, () => {
            res.statusCode = 404;
            res.end();
          }),
        ),
      );
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `✗ port ${parsed.port} is already in use — pass --port <n> or stop the other server`,
        );
      } else {
        console.error(`✗ server error: ${err.message}`);
      }
      done(1);
    });

    // Loopback only: the writeback endpoint writes to disk, so this is a
    // local-only tool and must never be exposed on the network.
    server.listen(parsed.port, "127.0.0.1", () => {
      // Bind to loopback, but show `localhost` — friendlier and click-through
      // in terminals (it resolves to 127.0.0.1 either way).
      const url = `http://localhost:${parsed.port}`;
      const label =
        target.kind === "store"
          ? `"${target.name}" from your store`
          : target.file;
      console.log(`⚡ zframes is live at ${url}`);
      console.log(
        `   serving ${label} — live editing on; drag, resize, then Save writes back.`,
      );
      if (canSwitch && listDashboards().length > 1) {
        console.log(
          "   switch dashboards from the header dropdown in the app.",
        );
      }
    });
  });
}
