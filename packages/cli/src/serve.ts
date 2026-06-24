import { existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
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

const DEFAULT_PORT = 37263;

interface ServeArgs {
  file: string;
  port: number;
  contact?: string;
}

function parseArgs(args: string[]): ServeArgs | { error: string } {
  let file = "dashboard.json";
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

export function serve(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if ("error" in parsed) {
    console.error(`✗ ${parsed.error}`);
    console.error(
      "usage: zframes serve [dashboard.json] [--port <n>] [--contact <email>]",
    );
    return Promise.resolve(1);
  }

  const file = resolve(process.cwd(), parsed.file);
  if (!existsSync(file) || !statSync(file).isFile()) {
    console.error(`✗ no dashboard.json at ${parsed.file}`);
    console.error("  pass a path, or run from a directory that has one.");
    return Promise.resolve(1);
  }
  const userDir = resolve(file, "..");

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
  // roots tried in order: bundle assets, then sibling files next to
  // dashboard.json, then the bundle's index.html as the SPA fallback.
  const serveBundle = sirv(bundleDir, { dev: true });
  const serveSiblings = sirv(userDir, { dev: true });
  const serveSpa = sirv(bundleDir, { dev: true, single: true });

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

      // 1. Reserved routes — the spec read/write contract (shared with dev).
      if (path === DASHBOARD_READ_ROUTE) {
        if (req.method === "GET" || req.method === "HEAD") {
          void handleSpecRead(file, res);
        } else {
          res.statusCode = 405;
          res.end();
        }
        return;
      }
      if (path === DASHBOARD_WRITE_ROUTE) {
        handleSpecWrite(req, res, file);
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
        handleAsk(req, res, file);
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
      //    files next to dashboard.json (e.g. /daily-analysis.json, local
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
      console.log(`⚡ zframes is live at ${url}`);
      console.log(
        `   serving ${parsed.file} — live editing on; drag, resize, then Save writes back.`,
      );
    });
  });
}
