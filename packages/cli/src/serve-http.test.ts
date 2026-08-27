import { once } from "node:events";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { connect, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setProviders, type ResolvedTarget } from "@zframes/store/store";
import {
  resolveInstallation,
  type Installation,
} from "@zframes/plugins/registry";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequestHandler } from "./serve";

// `zframes serve` is the ONLY published artifact and the one command every user
// runs, yet until this file nothing had ever answered a request through it:
// serve-args.test.ts deliberately stops at the branches that return before
// `listen`. This file drives the real routing over a real node:http server on an
// OS-assigned ephemeral port and pins the contracts a user notices when they
// break — all of them about a wrong number on screen or a lost dashboard:
//
//  * the spec READ route is what the app boots from. It must stream the file's
//    bytes verbatim (a re-serialisation would silently rewrite a hand-edited
//    file) with `no-store` (or a Save is followed by a reload showing the OLD
//    board), and 404 — not 500, not the SPA's index.html — when the file is gone.
//  * the WRITE route is the only path by which a human's edits reach disk, and
//    the only place the CLI can DESTROY work. Pinned: a good PUT round-trips
//    (including multi-byte text), a malformed body is refused with the previous
//    file intact, and the CSRF/method guards keep a stray request from writing.
//    (The body-assembly defect that corrupts a multi-byte character straddling
//    a chunk boundary belongs to the shared handler, not to this route, and is
//    pinned once, at its own layer: packages/serve/src/serve-body-proxy.test.ts.)
//  * the four STATIC tiers in order (bundle → the current dashboard's own
//    sibling folder → SPA fallback → 404), because tier 2 is how a dashboard's
//    local images and any JSON a frame reads load, and the ordering is what stops
//    a dashboard folder from shadowing the runtime's own JS.
//  * `/__zframes/*` must never fall through to the SPA: an unknown reserved
//    route returning `index.html` hands the browser HTML where it expects JSON,
//    which surfaces as a frame stuck loading forever rather than a clean error.
//  * path traversal on both static roots — the process runs on a developer's
//    machine with their whole home directory reachable from `dir + "/../.."`.
//  * the SWITCHER, whose failure mode is the worst one available: if the
//    write route keeps pointing at the PREVIOUS dashboard after a switch, the
//    user edits board B and overwrites board A. Both directions are pinned, plus
//    the loopback / canSwitch / validation refusals.
//  * and finally the COMPOSITION — `serve(argv)` deriving those options and
//    binding them. Every test above constructs the handler itself, so on its own
//    this file leaves the argv → handler link unobserved, and serve-args.test.ts
//    stops one branch earlier (its fs mock forces the bundle probe to fail).
//    Nothing then notices `--contact` never reaching the proxy's User-Agent, the
//    requested `--port` never reaching `listen`, or the bind host widening from
//    127.0.0.1 to 0.0.0.0 — which would put a route that WRITES TO DISK on the
//    network. The last describe below reaches it; see its comment for the seams.
//
// Hermetic: a tmpdir bundle fixture (packages/cli/runtime/ is gitignored and
// ABSENT in CI, so nothing here may depend on it), a tmpdir XDG_CONFIG_HOME for
// every store read, port 0 for the bind, and no network — the one proxy test
// stubs global fetch and asserts the non-allowlisted case never reaches it.
// The zAI (`/__zframes/ask`, `/__zframes/agents`) and keyed-account routes'
// BEHAVIOUR is out of scope on purpose: they shell out / read credentials and
// are covered in their own packages. Their loopback guard IS pinned here,
// though — it is this file's routing layer that mounts it, and it precedes any
// shell-out, so a rebound Host is refused before handleAsk ever spawns.

/** The real fetch, captured before any test stubs the global. */
const httpFetch: typeof fetch = globalThis.fetch.bind(globalThis);

const READ_ROUTE = "/__zframes/dashboard.json";
const WRITE_ROUTE = "/__zframes/dashboard";
const LIST_ROUTE = "/__zframes/dashboards";
const SWITCH_ROUTE = "/__zframes/switch";
const PROXY_ROUTE = "/__zframes/proxy";
const PROVIDERS_ROUTE = "/__zframes/providers";
const AGENTS_ROUTE = "/__zframes/agents";
const ASK_ROUTE = "/__zframes/ask";

const JSON_HEADERS = { "content-type": "application/json" };

let root: string;
let bundleDir: string;
let xdg: string;
const servers: Server[] = [];

/**
 * Start a real http server on an ephemeral port around the handler under test.
 * Returns the base URL; every server is closed (connections included, or
 * keep-alive would stall the close) in afterEach.
 */
async function start(opts: {
  target: ResolvedTarget;
  contact?: string;
  canSwitch?: boolean;
  installation?: Installation;
}): Promise<string> {
  const server = createServer(createRequestHandler({ bundleDir, ...opts }));
  servers.push(server);
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * A hand-written HTTP/1.1 request. Needed for two things `fetch` cannot do:
 * send a path the WHATWG URL parser would normalise (`/../etc/passwd`) or
 * reject (`/%zz`), and forge a non-loopback `Host` — the last of which also
 * needs a body, hence `bodyChunks`.
 */
async function rawRequest(
  base: string,
  init: {
    method?: string;
    path: string;
    host?: string;
    headers?: Record<string, string>;
    bodyChunks?: Buffer[];
  },
): Promise<RawResponse> {
  const port = Number(new URL(base).port);
  const socket = connect(port, "127.0.0.1");
  const received: Buffer[] = [];
  socket.on("data", (d: Buffer) => received.push(d));
  // The server may answer and close before the last chunk is written (e.g. a
  // 403 that never reads the body), so subscribe to "close" NOW — awaiting it
  // only after the writes would miss the event and hang.
  const closed = once(socket, "close");
  socket.on("error", () => {}); // a write into an already-closed socket
  await once(socket, "connect");

  const chunks = init.bodyChunks ?? [];
  const headers: Record<string, string> = {
    host: init.host ?? `127.0.0.1:${port}`,
    connection: "close",
    ...init.headers,
  };
  if (chunks.length > 0) {
    headers["content-length"] = String(
      chunks.reduce((n, c) => n + c.byteLength, 0),
    );
  }
  const head = [
    `${init.method ?? "GET"} ${init.path} HTTP/1.1`,
    ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
    "",
    "",
  ].join("\r\n");
  socket.write(head);
  for (const chunk of chunks) socket.write(chunk);

  await closed;
  const raw = Buffer.concat(received).toString("utf8");
  const split = raw.indexOf("\r\n\r\n");
  const head_ = raw.slice(0, split === -1 ? raw.length : split);
  const [statusLine, ...headerLines] = head_.split("\r\n");
  const parsed: Record<string, string> = {};
  for (const line of headerLines) {
    const at = line.indexOf(":");
    if (at > 0) {
      parsed[line.slice(0, at).trim().toLowerCase()] = line
        .slice(at + 1)
        .trim();
    }
  }
  return {
    status: Number(statusLine.split(" ")[1]),
    headers: parsed,
    body: split === -1 ? "" : raw.slice(split + 4),
  };
}

/** Write a dashboard spec (pretty, trailing newline — what `init`/Save emit). */
function writeSpec(file: string, spec: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
}

/** A store dashboard: dashboards/<name>/dashboard.json + a sibling asset. */
function storeDashboard(name: string, title: string): string {
  const file = join(xdg, "zframes", "dashboards", name, "dashboard.json");
  writeSpec(file, { version: "0.1.0", title, frames: [] });
  writeFileSync(join(dirname(file), "note.txt"), `sibling-of-${name}`, "utf8");
  return file;
}

/**
 * One schema-valid frame instance. `id` and `position` are both REQUIRED by
 * DashboardSpecSchema — a body missing either is refused by the write route's
 * schema gate, so every PUT body in this file that is meant to SUCCEED has to
 * carry them (the editor always emits both).
 */
function validFrame(id = "clock-1") {
  return {
    id,
    frame: "clock",
    config: {},
    position: { x: 0, y: 0, w: 3, h: 2 },
  };
}

/** The path target a plain `zframes serve ./dashboard.json` resolves to. */
function pathTarget(
  spec: unknown = { version: "0.1.0", title: "P", frames: [] },
): {
  target: ResolvedTarget;
  file: string;
} {
  const file = join(root, "board", "dashboard.json");
  writeSpec(file, spec);
  return { target: { kind: "path", file }, file };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "zf-serve-http-"));
  xdg = join(root, "xdg");
  mkdirSync(xdg, { recursive: true });
  vi.stubEnv("XDG_CONFIG_HOME", xdg);

  // The prebuilt bundle fixture. `packages/cli/runtime/` is gitignored and
  // absent in CI, so the tiers below are exercised against this instead.
  bundleDir = join(root, "bundle");
  mkdirSync(join(bundleDir, "assets"), { recursive: true });
  writeFileSync(
    join(bundleDir, "index.html"),
    "<!doctype html><title>zframes-bundle</title>",
    "utf8",
  );
  writeFileSync(
    join(bundleDir, "assets", "app.js"),
    "console.log('bundle-asset');",
    "utf8",
  );
});

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((closed) => server.close(() => closed()));
  }
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("serve — the spec read route (how the app boots)", () => {
  it("streams the file's bytes verbatim, no-store", async () => {
    const file = join(root, "board", "dashboard.json");
    // Deliberately NOT prettified: if the route ever parsed + re-stringified,
    // a user's hand-edited file would come back reformatted and their next
    // Save would land the rewritten shape.
    const bytes = '{"version":"0.1.0",   "title":"Verbatim",\n "frames":[]}\n';
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes, "utf8");

    const base = await start({ target: { kind: "path", file } });
    const res = await httpFetch(`${base}${READ_ROUTE}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(bytes);
    expect(res.headers.get("content-type")).toBe("application/json");
    // Without no-store the browser re-shows the pre-Save board on reload.
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("404s a missing spec instead of falling through to the SPA", async () => {
    const base = await start({
      target: { kind: "path", file: join(root, "board", "gone.json") },
    });
    const res = await httpFetch(`${base}${READ_ROUTE}`);
    expect(res.status).toBe(404);
    // The killer would be 200 + index.html: the app would try to JSON.parse
    // HTML and show a parse error rather than "couldn't load your dashboard".
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.text()).not.toContain("zframes-bundle");
  });

  it("answers HEAD but refuses other methods with 405", async () => {
    const { target } = pathTarget();
    const base = await start({ target });

    const head = await httpFetch(`${base}${READ_ROUTE}`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("cache-control")).toBe("no-store");

    for (const method of ["DELETE", "PATCH"]) {
      const res = await httpFetch(`${base}${READ_ROUTE}`, { method });
      expect(res.status).toBe(405);
    }
  });
});

describe("serve — the writeback PUT (the only path that can destroy work)", () => {
  it("round-trips an edited spec, multi-byte text included", async () => {
    const { target, file } = pathTarget();
    const base = await start({ target });

    const edited = {
      version: "0.1.0",
      title: "ทองคำ 🪙 board",
      frames: [validFrame()],
    };
    const put = await httpFetch(`${base}${WRITE_ROUTE}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(edited),
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ ok: true, file });

    // On disk: pretty-printed with a trailing newline (the file stays
    // hand-editable and diffable after a Save).
    expect(readFileSync(file, "utf8")).toBe(
      `${JSON.stringify(edited, null, 2)}\n`,
    );
    // And through the read route the app reloads with — byte-for-byte.
    const back = await httpFetch(`${base}${READ_ROUTE}`);
    expect(await back.json()).toEqual(edited);
  });

  it("refuses a malformed body and leaves the previous spec on disk", async () => {
    const good = { version: "0.1.0", title: "Keep me", frames: [] };
    const { target, file } = pathTarget(good);
    const base = await start({ target });
    const before = readFileSync(file, "utf8");

    const res = await httpFetch(`${base}${WRITE_ROUTE}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: '{"title": "truncated', // a half-sent editor payload
    });
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
    // The whole point: a bad write must not cost the user their dashboard.
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  // Was a KNOWN BUG pin: the route used to validate only that the body was
  // JSON, so any of these replaced a working dashboard and answered 200. There
  // is no backup and no undo, so this is the one write path that can lose real
  // work — it now refuses with 400 and leaves the file untouched.
  it.each([
    ["not an object at all", '"not a dashboard at all"'],
    ["an object with no frames", JSON.stringify({ title: "no frames here" })],
    [
      "frames not being an array",
      JSON.stringify({ title: "t", frames: "clock" }),
    ],
    [
      "a frame missing its name",
      JSON.stringify({ title: "t", frames: [{ config: {} }] }),
    ],
    [
      "a position with a non-numeric coordinate",
      JSON.stringify({
        title: "t",
        frames: [{ frame: "clock", config: {}, position: { x: "left" } }],
      }),
    ],
  ])(
    "refuses schema-invalid JSON (%s) without touching the file",
    async (_label, body) => {
      const { target, file } = pathTarget({
        version: "0.1.0",
        title: "Keep me",
        frames: [{ frame: "clock", config: {} }],
      });
      const before = readFileSync(file, "utf8");
      const base = await start({ target });

      const res = await httpFetch(`${base}${WRITE_ROUTE}`, {
        method: "PUT",
        headers: JSON_HEADERS,
        body,
      });

      expect(res.status).toBe(400);
      const payload = (await res.json()) as {
        ok: boolean;
        error: string;
        issues: string[];
      };
      expect(payload.ok).toBe(false);
      // The message has to name the cause, since it surfaces in the editor's
      // save-failed alert — "invalid JSON" would send the user hunting a syntax
      // error that isn't there.
      expect(payload.error).toContain("not a valid dashboard spec");
      // Actionable field paths, in `zframes lint`'s wording.
      expect(payload.issues.length).toBeGreaterThan(0);
      expect(payload.issues.every((i) => /^[\w.[\]()-]+: .+/.test(i))).toBe(
        true,
      );
      // The whole point: the user's board is still there, byte for byte.
      expect(readFileSync(file, "utf8")).toBe(before);
    },
  );

  it("still accepts a valid spec after the schema gate (the gate is not a wall)", async () => {
    const { target, file } = pathTarget({
      version: "0.1.0",
      title: "Keep me",
      frames: [{ frame: "clock", config: {} }],
    });
    const base = await start({ target });

    // A minimal-but-valid spec: proves the gate admits real saves, so a
    // regression that rejected everything could not hide behind the tests above.
    const next = {
      version: "0.2.0",
      title: "Edited board",
      frames: [validFrame("clock-edited")],
    };
    const res = await httpFetch(`${base}${WRITE_ROUTE}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(next),
    });

    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    // Written as the client sent it — the schema gate must not materialise
    // defaults into the user's hand-readable file.
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(next);
    expect(readFileSync(file, "utf8")).toBe(
      `${JSON.stringify(next, null, 2)}\n`,
    );
  });

  it("requires a JSON content-type and a PUT/POST, without touching disk", async () => {
    const { target, file } = pathTarget();
    const base = await start({ target });
    const before = readFileSync(file, "utf8");

    // The CSRF guard: a cross-origin form post can only send these types, and
    // a JSON content-type forces a preflight it can't satisfy.
    for (const contentType of [
      "text/plain",
      "application/x-www-form-urlencoded",
      "multipart/form-data",
    ]) {
      const res = await httpFetch(`${base}${WRITE_ROUTE}`, {
        method: "PUT",
        headers: { "content-type": contentType },
        body: '{"version":"0.1.0","title":"attacker","frames":[]}',
      });
      expect(res.status).toBe(415);
    }
    // GET on the write route is a 405, NOT a static-tier fall-through.
    const get = await httpFetch(`${base}${WRITE_ROUTE}`);
    expect(get.status).toBe(405);
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("accepts POST as well as PUT (both spellings the editor may use)", async () => {
    const { target, file } = pathTarget();
    const base = await start({ target });
    const res = await httpFetch(`${base}${WRITE_ROUTE}`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: '{"version":"0.1.0","title":"posted","frames":[]}',
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(readFileSync(file, "utf8")).title).toBe("posted");
  });
});

describe("serve — the static tiers, in order", () => {
  it("serves the bundle, then the dashboard's siblings, then the SPA, then 404", async () => {
    const { target, file } = pathTarget();
    // Tier 2 is how a dashboard's own local images and data files load.
    writeFileSync(
      join(dirname(file), "sidecar.json"),
      '{"note":"today"}',
      "utf8",
    );
    const base = await start({ target });

    // 1. bundle assets, and "/" → index.html
    const asset = await httpFetch(`${base}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("console.log('bundle-asset');");
    const index = await httpFetch(`${base}/`);
    expect(index.status).toBe(200);
    expect(await index.text()).toContain("zframes-bundle");

    // 2. siblings of the current dashboard
    const sidecar = await httpFetch(`${base}/sidecar.json`);
    expect(sidecar.status).toBe(200);
    expect(await sidecar.text()).toBe('{"note":"today"}');

    // 3. SPA fallback for an extension-less client route
    const spa = await httpFetch(`${base}/some/deep/route`);
    expect(spa.status).toBe(200);
    expect(await spa.text()).toContain("zframes-bundle");

    // 4. a missing ASSET is a 404, not HTML — a <script src> that resolved to
    //    index.html would fail with a syntax error instead of a clean 404.
    const missing = await httpFetch(`${base}/assets/nope.js`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toContain("zframes-bundle");
  });

  it("lets the bundle win when a dashboard folder holds the same filename", async () => {
    // A dashboard folder is user-controlled: if it were tried FIRST, a stray
    // index.html or assets/app.js next to dashboard.json would shadow the
    // runtime itself and the app would never boot.
    const { target, file } = pathTarget();
    writeFileSync(join(dirname(file), "index.html"), "SIBLING-INDEX", "utf8");
    mkdirSync(join(dirname(file), "assets"), { recursive: true });
    writeFileSync(
      join(dirname(file), "assets", "app.js"),
      "SIBLING-ASSET",
      "utf8",
    );
    const base = await start({ target });

    expect(await (await httpFetch(`${base}/`)).text()).toContain(
      "zframes-bundle",
    );
    expect(await (await httpFetch(`${base}/assets/app.js`)).text()).toBe(
      "console.log('bundle-asset');",
    );
  });

  it("405s a write method aimed at a static path", async () => {
    const { target } = pathTarget();
    const base = await start({ target });
    for (const method of ["POST", "PUT", "DELETE"]) {
      const res = await httpFetch(`${base}/assets/app.js`, { method });
      expect(res.status).toBe(405);
    }
  });

  it("400s a path it cannot percent-decode", async () => {
    const { target } = pathTarget();
    const base = await start({ target });
    // `%zz` is not a valid escape; decodeURIComponent throws. Sent raw because
    // fetch's URL parser would not let this through.
    const res = await rawRequest(base, { path: "/%zz" });
    expect(res.status).toBe(400);
    expect(res.body).toBe("");
  });
});

describe("serve — /__zframes/ never falls through to the SPA", () => {
  it("404s an unknown reserved route with an empty body", async () => {
    const { target } = pathTarget();
    const base = await start({ target });
    for (const path of [
      "/__zframes/nope",
      "/__zframes/dashboard.json.bak",
      "/__zframes/",
    ]) {
      const res = await rawRequest(base, { path });
      expect(res.status).toBe(404);
      // An SPA fall-through here would hand the runtime's fetch() HTML where
      // it expects JSON — a frame stuck loading rather than a clean error.
      expect(res.body).toBe("");
    }
  });

  it("404s even when a real file sits under the reserved prefix", async () => {
    // Proof the prefix guard wins over the static tiers, rather than the file
    // simply not existing.
    mkdirSync(join(bundleDir, "__zframes"), { recursive: true });
    writeFileSync(join(bundleDir, "__zframes", "leak.txt"), "LEAKED", "utf8");
    const { target } = pathTarget();
    const base = await start({ target });

    const res = await httpFetch(`${base}/__zframes/leak.txt`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("LEAKED");
  });
});

describe("serve — path traversal on both static roots", () => {
  it("refuses to escape the bundle or the dashboard folder", async () => {
    // `root` is the parent of BOTH static roots (bundle/ and board/), so a
    // single `../` escape reaches this file — on a real machine that same hop
    // reaches the user's home directory.
    writeFileSync(join(root, "secret.txt"), "TOP-SECRET", "utf8");
    const { target } = pathTarget();
    const base = await start({ target });

    for (const path of [
      "/../secret.txt",
      "/../../secret.txt",
      "/assets/../../secret.txt",
      "/%2e%2e/secret.txt", // sirv decodes with decodeURI, so %2e → "."
      "/....//secret.txt",
      "/board/../../secret.txt",
    ]) {
      const res = await rawRequest(base, { path });
      expect(res.body).not.toContain("TOP-SECRET");
      expect(res.status).toBe(404);
    }

    // `%2f` survives sirv's decodeURI (it only decodes unreserved characters),
    // so this one never looks like a traversal to the filesystem lookup: it
    // misses both roots and lands on the SPA fallback. Asserted as index.html
    // rather than merely "not 200", so a real escape here could not hide behind
    // a loosened expectation.
    const encoded = await rawRequest(base, { path: "/..%2fsecret.txt" });
    expect(encoded.status).toBe(200);
    expect(encoded.body).toContain("zframes-bundle");
    expect(encoded.body).not.toContain("TOP-SECRET");
  });

  it("refuses to read the dashboard's own siblings out of their folder", async () => {
    // Tier 2's root is the CURRENT dashboard's folder. A sibling lookup that
    // escaped it would expose the neighbouring dashboards in the store (and,
    // one hop further, anything in the user's config home).
    const alpha = storeDashboard("alpha", "Alpha");
    storeDashboard("beta", "Beta");
    writeFileSync(join(xdg, "zframes", "credentials.json"), "SECRET-KEY");
    const base = await start({
      target: { kind: "store", name: "alpha", file: alpha },
    });

    for (const path of [
      "/../beta/note.txt",
      "/../../credentials.json",
      "/%2e%2e/beta/note.txt",
    ]) {
      const res = await rawRequest(base, { path });
      expect(res.body).not.toContain("sibling-of-beta");
      expect(res.body).not.toContain("SECRET-KEY");
    }
    // Control: alpha's OWN sibling is reachable, so the assertions above are
    // about the escape and not about tier 2 being broken.
    expect(await (await httpFetch(`${base}/note.txt`)).text()).toBe(
      "sibling-of-alpha",
    );
  });
});

describe("serve — the in-app dashboard switcher", () => {
  /** Two store dashboards, `alpha` the default and the one being served. */
  function twoDashboards() {
    const alpha = storeDashboard("alpha", "Alpha");
    const beta = storeDashboard("beta", "Beta");
    writeFileSync(
      join(xdg, "zframes", "config.json"),
      `${JSON.stringify({ default: "alpha" }, null, 2)}\n`,
      "utf8",
    );
    return { alpha, beta };
  }

  it("lists the store dashboards, flagging the current one and the default", async () => {
    twoDashboards();
    const base = await start({
      target: {
        kind: "store",
        name: "alpha",
        file: join(xdg, "zframes", "dashboards", "alpha", "dashboard.json"),
      },
    });

    const res = await httpFetch(`${base}${LIST_ROUTE}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      current: "alpha",
      canSwitch: true,
      dashboards: [
        { name: "alpha", title: "Alpha", isDefault: true },
        { name: "beta", title: "Beta", isDefault: false },
      ],
    });
  });

  it("re-points read, write AND the sibling root — the previous board is untouched", async () => {
    const { alpha, beta } = twoDashboards();
    const base = await start({
      target: { kind: "store", name: "alpha", file: alpha },
    });
    const alphaBefore = readFileSync(alpha, "utf8");

    // Before the switch: alpha's spec and alpha's own sibling asset.
    expect((await (await httpFetch(`${base}${READ_ROUTE}`)).json()).title).toBe(
      "Alpha",
    );
    expect(await (await httpFetch(`${base}/note.txt`)).text()).toBe(
      "sibling-of-alpha",
    );

    const switched = await httpFetch(`${base}${SWITCH_ROUTE}`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "beta" }),
    });
    expect(switched.status).toBe(200);
    expect(await switched.json()).toEqual({ ok: true, name: "beta" });

    // Read follows the new target...
    expect((await (await httpFetch(`${base}${READ_ROUTE}`)).json()).title).toBe(
      "Beta",
    );
    // ...so does the sibling root: each store dashboard has its OWN folder, so
    // a stale root would serve beta's board alpha's brief and images.
    expect(await (await httpFetch(`${base}/note.txt`)).text()).toBe(
      "sibling-of-beta",
    );
    // ...and so does the list route's `current`.
    expect(
      (await (await httpFetch(`${base}${LIST_ROUTE}`)).json()).current,
    ).toBe("beta");

    // The data-loss shape: a Save after switching must land in beta, and must
    // NOT overwrite alpha.
    const write = await httpFetch(`${base}${WRITE_ROUTE}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        version: "0.1.0",
        title: "Beta edited",
        frames: [],
      }),
    });
    expect(await write.json()).toEqual({ ok: true, file: beta });
    expect(JSON.parse(readFileSync(beta, "utf8")).title).toBe("Beta edited");
    expect(readFileSync(alpha, "utf8")).toBe(alphaBefore);
  });

  it("refuses an unknown name, an invalid name, and keeps serving the current board", async () => {
    const { alpha } = twoDashboards();
    const base = await start({
      target: { kind: "store", name: "alpha", file: alpha },
    });

    const unknown = await httpFetch(`${base}${SWITCH_ROUTE}`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "ghost" }),
    });
    expect(unknown.status).toBe(404);
    // Never creates the file it was asked to switch to.
    expect((await unknown.json()).ok).toBe(false);

    for (const name of ["../beta", "/etc/passwd", "Alpha", "", 42, null]) {
      const res = await httpFetch(`${base}${SWITCH_ROUTE}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name }),
      });
      expect(res.status).toBe(400);
    }

    const malformed = await httpFetch(`${base}${SWITCH_ROUTE}`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: "{not json",
    });
    expect(malformed.status).toBe(400);

    // Through all of that, the served dashboard never moved.
    expect((await (await httpFetch(`${base}${READ_ROUTE}`)).json()).title).toBe(
      "Alpha",
    );
    expect(await (await httpFetch(`${base}/note.txt`)).text()).toBe(
      "sibling-of-alpha",
    );
  });

  it("requires POST and a JSON content-type", async () => {
    const { alpha } = twoDashboards();
    const base = await start({
      target: { kind: "store", name: "alpha", file: alpha },
    });

    expect((await httpFetch(`${base}${SWITCH_ROUTE}`)).status).toBe(405);
    const wrongType = await httpFetch(`${base}${SWITCH_ROUTE}`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ name: "beta" }),
    });
    expect(wrongType.status).toBe(415);
  });

  it("rejects a non-loopback Host on both switcher routes (DNS rebinding)", async () => {
    const { alpha } = twoDashboards();
    const base = await start({
      target: { kind: "store", name: "alpha", file: alpha },
    });

    const list = await rawRequest(base, {
      path: LIST_ROUTE,
      host: "dashboard.evil.example",
    });
    expect(list.status).toBe(403);
    // The list leaks the names of every dashboard on the machine.
    expect(list.body).not.toContain("alpha");

    const switched = await rawRequest(base, {
      method: "POST",
      path: SWITCH_ROUTE,
      host: "dashboard.evil.example",
      headers: JSON_HEADERS,
      bodyChunks: [Buffer.from('{"name":"beta"}')],
    });
    expect(switched.status).toBe(403);
    // And the served board did not move — verified from a loopback request.
    expect((await (await httpFetch(`${base}${READ_ROUTE}`)).json()).title).toBe(
      "Alpha",
    );
  });

  it("turns switching off for an explicit-path serve", async () => {
    // `zframes serve ./dashboard.json` has nothing to switch among; the app
    // reads `canSwitch` to decide whether the header title is a button.
    twoDashboards();
    const { target } = pathTarget();
    const base = await start({ target });

    const list = await httpFetch(`${base}${LIST_ROUTE}`);
    expect(list.status).toBe(200);
    // Even though the store holds two dashboards, a path serve exposes none.
    expect(await list.json()).toEqual({
      current: null,
      canSwitch: false,
      dashboards: [],
    });

    const res = await httpFetch(`${base}${SWITCH_ROUTE}`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "beta" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("only available");
  });
});

describe("serve — the loopback guard on every side-effect route (DNS rebinding)", () => {
  // The JSON content-type/method guard stops an ORDINARY cross-origin write
  // (the browser preflights it and gets no CORS headers back), but it does not
  // stop DNS rebinding: a page whose hostname has been rebound to 127.0.0.1
  // reaches the server SAME-ORIGIN, so no preflight fires and the response body
  // is readable. The only thing that distinguishes such a request is its `Host`
  // header, still the attacker's name — which is exactly what isLocalRequest
  // rejects. The switcher routes were already guarded (see the switcher
  // describe); these four are the rest of the side-effect surface: the spec
  // READ (leaks the local board), the spec WRITE (overwrites it on disk), and
  // the zAI `agents`/`ask` pair (recon for, then invocation of, the user's
  // authenticated local agent CLI). A rebound Host must 403 before any of them
  // runs — for `ask` that means before it ever shells out.

  it("403s the spec read on a non-loopback Host, without leaking the spec", async () => {
    const { target } = pathTarget({
      version: "0.1.0",
      title: "Local-Only Board",
      frames: [],
    });
    const base = await start({ target });

    const res = await rawRequest(base, {
      path: READ_ROUTE,
      host: "dashboard.evil.example",
    });
    expect(res.status).toBe(403);
    expect(res.body).not.toContain("Local-Only Board");
    // Control: the same route on loopback still serves, so this pins the guard
    // and not a broken route.
    expect((await (await httpFetch(`${base}${READ_ROUTE}`)).json()).title).toBe(
      "Local-Only Board",
    );
  });

  it("403s the spec write on a non-loopback Host, leaving the file untouched", async () => {
    const { target, file } = pathTarget();
    const base = await start({ target });
    const before = readFileSync(file, "utf8");

    const res = await rawRequest(base, {
      method: "PUT",
      path: WRITE_ROUTE,
      host: "dashboard.evil.example",
      headers: JSON_HEADERS,
      bodyChunks: [
        Buffer.from('{"version":"0.1.0","title":"attacker","frames":[]}'),
      ],
    });
    expect(res.status).toBe(403);
    // The whole point of guarding the write: a rebound page cannot rewrite the
    // operator's dashboard.
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("403s the zAI agents recon route on a non-loopback Host", async () => {
    const { target } = pathTarget();
    const base = await start({ target });

    const res = await rawRequest(base, {
      path: AGENTS_ROUTE,
      host: "dashboard.evil.example",
    });
    expect(res.status).toBe(403);
  });

  it("403s the zAI ask route on a non-loopback Host, before it shells out", async () => {
    // The guard is the first statement in the branch, so a rebound POST is
    // refused before handleAsk reads the body or spawns any agent CLI — the
    // reason this assertion is safe to make with no agent installed and no
    // child-process stub.
    const { target } = pathTarget();
    const base = await start({ target });

    const res = await rawRequest(base, {
      method: "POST",
      path: ASK_ROUTE,
      host: "dashboard.evil.example",
      headers: JSON_HEADERS,
      bodyChunks: [Buffer.from('{"question":"run something for me"}')],
    });
    expect(res.status).toBe(403);
  });
});

describe("serve — the official-data proxy is wired, allowlisted, and UA-tagged", () => {
  it("passes --contact through as the upstream User-Agent", async () => {
    // SEC fair-access: the whole reason `--contact` exists. It is threaded
    // handler → handleProxy → upstream request, and a break is invisible
    // locally (frames keep working) until a source starts rejecting the CLI.
    const upstream = vi.fn<
      (
        url: string,
        init: { headers: Record<string, string> },
      ) => Promise<Response>
    >(
      async () =>
        new Response('{"ok":true}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", upstream);

    const { target } = pathTarget();
    const base = await start({
      target,
      contact: "ops@example.com",
      // The fleet has to be MOUNTED for its hosts to be relayable at all —
      // the allowlist derives from the installation's manifests.
      installation: resolveInstallation(["keyless"]),
    });
    const url = "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json";
    const res = await httpFetch(
      `${base}${PROXY_ROUTE}?url=${encodeURIComponent(url)}`,
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ok":true}');
    expect(upstream).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = upstream.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(init.headers["User-Agent"]).toBe("zframes (ops@example.com)");
  });

  it("refuses a non-allowlisted host without making a request", async () => {
    const upstream = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", upstream);
    const { target } = pathTarget();
    const base = await start({
      target,
      installation: resolveInstallation(["keyless"]),
    });

    const res = await httpFetch(
      `${base}${PROXY_ROUTE}?url=${encodeURIComponent("https://evil.example/x")}`,
    );
    expect(res.status).toBe(403);
    // Not an open proxy: the local server must never relay to an arbitrary
    // (or internal) host on a page's behalf.
    expect(upstream).not.toHaveBeenCalled();
  });

  it("relays NOTHING on a bare install — even a fleet host is refused", async () => {
    // The posture itself: with no plugins installed (the tmpdir store is
    // empty, so the handler's default resolution lands on the demo fallback),
    // the derived allowlist is empty and a host the fleet WOULD authorise is
    // still a 403 with no upstream request. A regression here means the CLI
    // has grown back a compiled-in opinion about reachable third parties.
    const upstream = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", upstream);
    const { target } = pathTarget();
    const base = await start({ target });

    const res = await httpFetch(
      `${base}${PROXY_ROUTE}?url=${encodeURIComponent("https://data.sec.gov/x")}`,
    );
    expect(res.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("serve — the providers route names what this installation mounts", () => {
  it("answers the demo fallback on a bare install", async () => {
    const { target } = pathTarget();
    const base = await start({ target });
    const res = await httpFetch(`${base}${PROVIDERS_ROUTE}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      plugins: [{ id: "demo", name: "Demo data", synthetic: true }],
    });
  });

  it("answers the installed plugins, in mount order, flags included", async () => {
    const { target } = pathTarget();
    const base = await start({
      target,
      installation: resolveInstallation(["keyless", "binance"]),
    });
    const body = (await (
      await httpFetch(`${base}${PROVIDERS_ROUTE}`)
    ).json()) as {
      plugins: Array<Record<string, unknown>>;
    };
    expect(body.plugins.map((p) => p.id)).toEqual(["keyless", "binance"]);
    expect(body.plugins[0].synthetic).toBeUndefined();
    expect(body.plugins[1].requiresCredentials).toBe(true);
  });

  it("is GET-only", async () => {
    const { target } = pathTarget();
    const base = await start({ target });
    const res = await httpFetch(`${base}${PROVIDERS_ROUTE}`, {
      method: "POST",
    });
    expect(res.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// The composition: serve(argv) → createRequestHandler(options) → listen
// ---------------------------------------------------------------------------
//
// Everything above builds the handler itself, which leaves the argv → options
// object unobserved. To reach it, `./serve` is re-imported ONCE with the three
// seams stubbed that otherwise stop `serve()` from being driven in-process — the
// module under test is the real one, only its edges are faked:
//
//  * `node:http` — `createServer` records the handler it is given and returns a
//    fake server whose `listen` records `(port, host)` and binds nothing. That
//    is what makes `--port` and the loopback-only host observable, and it means
//    no test here ever tries to take the CLI's real 37263.
//  * `node:fs` — the `runtime/index.html` bundle probe is forced PRESENT (the
//    inverse of serve-args.test.ts, which forces it absent to stop before the
//    bind). `packages/cli/runtime/` is gitignored and missing in CI, where
//    `serve()` would otherwise exit 1 and never compose anything. Every other
//    path falls through to the real fs, so the store lookups below are genuine.
//  * `sirv` — records the roots it is constructed with, which is how the
//    `bundleDir` field becomes observable at all, and serves nothing. The tiers
//    themselves are covered above against the real sirv.
//
// The recorded handler is then wrapped in a REAL server (the top-level
// `createServer` import resolved before `vi.doMock`, so it is the genuine one)
// and driven over HTTP exactly like every other test in this file.

/** Where `serve()` looks for the vendored runtime — `../runtime` from src/. */
const RUNTIME_DIR = fileURLToPath(new URL("../runtime", import.meta.url));

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const captured: {
  handler?: Handler;
  /** The static roots `createRequestHandler` handed to sirv, in order. */
  roots: string[];
  listen?: { port: number; host: string };
} = { roots: [] };

/** The `serve` from the re-imported copy of the module, loaded once. */
let composedServe: ((args: string[]) => Promise<number>) | undefined;

async function loadComposedServe(): Promise<
  (args: string[]) => Promise<number>
> {
  if (composedServe) return composedServe;

  vi.resetModules();
  vi.doMock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    return {
      ...actual,
      default: actual,
      existsSync: (p: Parameters<typeof actual.existsSync>[0]) =>
        String(p).replace(/\\/g, "/").endsWith("/runtime/index.html") ||
        actual.existsSync(p),
    };
  });
  vi.doMock("node:http", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:http")>();
    return {
      ...actual,
      default: actual,
      createServer: (handler: Handler) => {
        captured.handler = handler;
        return {
          on: () => {},
          listen: (port: number, host: string, ready: () => void) => {
            captured.listen = { port, host };
            ready();
          },
        };
      },
    };
  });
  vi.doMock("sirv", () => ({
    default: (dir: string) => {
      captured.roots.push(dir);
      return (_req: IncomingMessage, _res: ServerResponse, next: () => void) =>
        next();
    },
  }));

  ({ serve: composedServe } = await import("./serve"));
  return composedServe!;
}

interface Composed {
  /** A real server wrapped around the handler `serve()` handed createServer. */
  base: string;
  /** `[bundle, siblings-of-the-target, spa-fallback]`, as sirv received them. */
  roots: string[];
  /** `server.listen(port, host)`, as `serve()` called it. */
  listen: { port: number; host: string };
  /** What `serve()` printed to stdout once it was listening. */
  logs: string;
}

/** Run the real `serve(argv)` against the stubbed seams and expose the result. */
async function runComposedServe(argv: string[]): Promise<Composed> {
  const serve = await loadComposedServe();
  captured.handler = undefined;
  captured.listen = undefined;
  captured.roots.length = 0;
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  // Deliberately not awaited: `serve()`'s promise resolves only on a server
  // error, and `createServer` runs synchronously inside the promise executor —
  // which is what makes the handler available on the very next line.
  void serve(argv);

  const handler = captured.handler;
  if (!handler || !captured.listen) {
    throw new Error(
      `serve(${JSON.stringify(argv)}) refused before listen: ${errSpy.mock.calls
        .map((c: unknown[]) => c.join(" "))
        .join("\n")}`,
    );
  }
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    roots: [...captured.roots],
    listen: captured.listen,
    logs: logSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n"),
  };
}

/** An upstream stub for the proxy route; returns the User-Agent it was sent. */
function stubUpstream() {
  const upstream = vi.fn<
    (
      url: string,
      init: { headers: Record<string, string> },
    ) => Promise<Response>
  >(async () => new Response('{"ok":true}', { status: 200 }));
  vi.stubGlobal("fetch", upstream);
  return async (base: string): Promise<string> => {
    upstream.mockClear();
    const res = await httpFetch(
      `${base}${PROXY_ROUTE}?url=${encodeURIComponent("https://data.sec.gov/x")}`,
    );
    expect(res.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    return upstream.mock.calls[0][1].headers["User-Agent"];
  };
}

describe("serve — what argv actually composes into the running server", () => {
  it("binds the store target, its bundle dir, --contact and --port together", async () => {
    storeDashboard("mine", "Mine");
    // The relay allowlist derives from the INSTALLED plugins, so the fleet has
    // to be installed in the (tmpdir) store for its hosts to be relayable.
    setProviders(["keyless"]);
    const userAgentFor = stubUpstream();

    const composed = await runComposedServe([
      "mine",
      "--contact",
      "ops@example.com",
      "--port",
      "37270",
    ]);

    // bundleDir → tiers 1 and 4; the dashboard's own folder → tier 2. Swapping
    // them would serve the runtime out of the user's dashboard folder (and the
    // dashboard's images out of the bundle), which is the whole static contract.
    expect(composed.roots).toEqual([
      RUNTIME_DIR,
      join(xdg, "zframes", "dashboards", "mine"),
      RUNTIME_DIR,
    ]);
    // Asserted as a path, not just as "the same constant this test computed",
    // so it stays in lockstep with where scripts/build-runtime.mjs writes it.
    expect(RUNTIME_DIR.replace(/\\/g, "/")).toMatch(/packages\/cli\/runtime$/);

    // The requested port must reach the bind, and the bind must stay on
    // loopback: this server answers a route that WRITES TO DISK, so 0.0.0.0
    // would hand every machine on the network the user's dashboard file.
    expect(composed.listen).toEqual({ port: 37270, host: "127.0.0.1" });
    // ...and the URL printed for the user to click matches the port bound.
    expect(composed.logs).toContain("http://localhost:37270");
    expect(composed.logs).toContain('"mine" from your store');
    // The consent surface: what's mounted and what the relay may reach are
    // printed at every start, not only at install time.
    expect(composed.logs).toContain("data: keyless");
    expect(composed.logs).toContain("relay may reach");

    // `target` reached the spec routes: the positional resolved to the store
    // dashboard, not to a cwd fallback.
    const read = await httpFetch(`${composed.base}${READ_ROUTE}`);
    expect((await read.json()).title).toBe("Mine");

    // `canSwitch` reached the switcher, so the header offers the chooser.
    const list = await httpFetch(`${composed.base}${LIST_ROUTE}`);
    expect(await list.json()).toEqual({
      current: "mine",
      canSwitch: true,
      dashboards: [{ name: "mine", title: "Mine", isDefault: false }],
    });

    // And `contact` reached handleProxy's upstream request — the SEC
    // fair-access UA, whose absence is invisible locally (frames keep working)
    // right up until an official source starts refusing the CLI.
    expect(await userAgentFor(composed.base)).toBe("zframes (ops@example.com)");
  });

  it("turns switching off for a path serve, and defaults the port to 37263", async () => {
    // A store exists and holds a dashboard, so "exposes none" below is about
    // the path serve rather than about an empty store.
    storeDashboard("mine", "Mine");
    const { file } = pathTarget({
      version: "0.1.0",
      title: "Local",
      frames: [],
    });

    const composed = await runComposedServe([file]);

    expect(composed.roots).toEqual([RUNTIME_DIR, dirname(file), RUNTIME_DIR]);
    expect(composed.listen).toEqual({ port: 37263, host: "127.0.0.1" });
    expect(composed.logs).toContain("http://localhost:37263");
    expect(composed.logs).toContain(file);
    // Nothing installed in this store → the bare install serves the demo, and
    // says so out loud.
    expect(composed.logs).toContain("DEMO data");

    const read = await httpFetch(`${composed.base}${READ_ROUTE}`);
    expect((await read.json()).title).toBe("Local");
    const list = await httpFetch(`${composed.base}${LIST_ROUTE}`);
    expect(await list.json()).toEqual({
      current: null,
      canSwitch: false,
      dashboards: [],
    });
  });

  it("threads every --contact spelling, and the env default, into the proxy UA", async () => {
    storeDashboard("mine", "Mine");
    // Installed so the relayed host is authorised at all (see the test above).
    setProviders(["keyless"]);
    const userAgentFor = stubUpstream();

    for (const { env, argv, ua } of [
      {
        argv: ["--contact", "flag@example.com"],
        ua: "zframes (flag@example.com)",
      },
      {
        argv: ["--contact=glued@example.com"],
        ua: "zframes (glued@example.com)",
      },
      // `ZFRAMES_CONTACT` is the "set it once in your shell" spelling the docs
      // offer; it is read in parseArgs, so nothing else would notice it going.
      { env: "env@example.com", argv: [], ua: "zframes (env@example.com)" },
      // An explicit flag must win over the env, or a user cannot override the
      // contact for a single run.
      {
        env: "env@example.com",
        argv: ["--contact", "flag@example.com"],
        ua: "zframes (flag@example.com)",
      },
    ]) {
      vi.stubEnv("ZFRAMES_CONTACT", env);
      const composed = await runComposedServe(["mine", ...argv]);
      expect(await userAgentFor(composed.base)).toBe(ua);
    }

    // No contact anywhere: the proxy falls back to a browser UA the official
    // hosts accept, NOT an empty or literal-"undefined" header (SEC 403s both),
    // which is why `contact` is optional rather than defaulted in the CLI.
    vi.stubEnv("ZFRAMES_CONTACT", undefined);
    const bare = await runComposedServe(["mine"]);
    const fallback = await userAgentFor(bare.base);
    expect(fallback).toMatch(/^Mozilla\/5\.0 /);
    expect(fallback).not.toContain("zframes");
  });
});
