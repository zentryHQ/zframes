import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DASHBOARD_READ_ROUTE,
  DASHBOARD_WRITE_ROUTE,
  handleSpecRead,
  handleSpecWrite,
} from "@zframes/core/serve";

const DEFAULT_PORT = 5179;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

interface ServeArgs {
  file: string;
  port: number;
}

function parseArgs(args: string[]): ServeArgs | { error: string } {
  let file = "dashboard.json";
  let port = DEFAULT_PORT;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--port" || a === "-p") {
      port = Number(args[++i]);
    } else if (a.startsWith("--port=")) {
      port = Number(a.slice("--port=".length));
    } else if (!a.startsWith("-")) {
      file = a;
    } else {
      return { error: `unknown option "${a}"` };
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: "--port must be an integer between 1 and 65535" };
  }
  return { file, port };
}

/** Resolve a URL path inside `rootDir`, or null if it escapes (traversal). */
function resolveWithin(rootDir: string, decodedPath: string): string | null {
  const rel = decodedPath === "/" ? "/index.html" : decodedPath;
  const abs = resolve(rootDir, `.${rel}`);
  if (abs !== rootDir && !abs.startsWith(rootDir + sep)) return null;
  return abs;
}

function sendFile(absPath: string, res: import("node:http").ServerResponse) {
  res.statusCode = 200;
  res.setHeader(
    "content-type",
    MIME[extname(absPath).toLowerCase()] ?? "application/octet-stream",
  );
  createReadStream(absPath).pipe(res);
}

/** Serve `decodedPath` from `rootDir` if it resolves to a real file within it. */
function tryStatic(
  rootDir: string,
  decodedPath: string,
  res: import("node:http").ServerResponse,
): boolean {
  const abs = resolveWithin(rootDir, decodedPath);
  if (!abs) return false;
  try {
    if (!statSync(abs).isFile()) return false;
  } catch {
    return false;
  }
  sendFile(abs, res);
  return true;
}

export function serve(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if ("error" in parsed) {
    console.error(`✗ ${parsed.error}`);
    console.error("usage: zframes serve [dashboard.json] [--port <n>]");
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

      // 2. Bundle assets (index.html at "/", hashed /assets/*).
      if (tryStatic(bundleDir, path, res)) return;
      // 3. Sibling files next to dashboard.json (e.g. /daily-analysis.json,
      //    local image assets) — never the bundle's job.
      if (path !== "/" && tryStatic(userDir, path, res)) return;
      // 4. SPA fallback.
      sendFile(join(bundleDir, "index.html"), res);
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
      const url = `http://127.0.0.1:${parsed.port}`;
      console.log(`▸ zframes serving ${parsed.file} on ${url}`);
      console.log("  live editing on — drag, resize, then Save writes back.");
    });
  });
}
