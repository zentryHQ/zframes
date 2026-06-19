import { readFile, writeFile } from "node:fs/promises";

/**
 * The dashboard read/write contract, shared verbatim by the dev Vite plugin
 * (`./vite`) and the CLI's `serve` http server. Both hand these helpers the
 * same Node `(req, res)` shape, so the in-browser editor's load + save round
 * trip identically whether the app runs under `vite dev` or `zframes serve`.
 *
 * Node-only and React-free (imports just `node:fs/promises`) so the CLI can
 * bundle it with zod as its lone runtime dep.
 */

/** Canonical route the app FETCHES its spec from (GET). */
export const DASHBOARD_READ_ROUTE = "/__zframes/dashboard.json";
/** Canonical route the editor SAVES its spec to (PUT/POST). */
export const DASHBOARD_WRITE_ROUTE = "/__zframes/dashboard";

// Hard cap on the request body — a small spec file, never a large upload.
const MAX_BODY_BYTES = 2_000_000;

// Minimal structural shapes satisfied by both Node's http and Vite's connect
// middleware, so neither this module nor `./vite` needs a node/vite type dep.
interface ReqLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: "data", cb: (chunk: Buffer) => void): unknown;
  on(event: "end", cb: () => void): unknown;
  destroy(): unknown;
}
interface ResLike {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

/**
 * GET the spec: stream the file's bytes verbatim as JSON, `no-store` so a
 * post-save reload always re-reads disk. Validation stays in the renderer, so
 * a malformed file still reaches the browser (which shows a spec-error card).
 * A missing file is a 404 the client renders as its "couldn't load" state.
 */
export async function handleSpecRead(
  absFile: string,
  res: ResLike,
): Promise<void> {
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "application/json");
  try {
    res.statusCode = 200;
    res.end(await readFile(absFile, "utf8"));
  } catch (error) {
    res.statusCode = (error as { code?: string }).code === "ENOENT" ? 404 : 500;
    res.end(JSON.stringify({ ok: false, error: String(error) }));
  }
}

/**
 * PUT/POST the spec: CSRF-guarded (requires a JSON content-type, which forces
 * a CORS preflight a malicious page can't satisfy), size-capped, then
 * parse + re-stringify so the file always lands valid and consistently
 * formatted (2-space, trailing newline). Writes only `absFile` — the request
 * body never names a path, so there is no write-side traversal vector.
 */
export function handleSpecWrite(
  req: ReqLike,
  res: ResLike,
  absFile: string,
): void {
  if (req.method !== "PUT" && req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }
  if (!String(req.headers["content-type"] ?? "").includes("application/json")) {
    res.statusCode = 415;
    res.end();
    return;
  }
  let body = "";
  let aborted = false;
  req.on("data", (chunk: Buffer) => {
    if (aborted) return;
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      aborted = true;
      res.statusCode = 413;
      res.end();
      req.destroy();
    }
  });
  req.on("end", async () => {
    if (aborted) return;
    try {
      const json = JSON.parse(body);
      await writeFile(absFile, `${JSON.stringify(json, null, 2)}\n`, "utf8");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, file: absFile }));
    } catch (error) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: String(error) }));
    }
  });
}
