import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_PROXY_ROUTE,
  DASHBOARD_READ_ROUTE,
  type ProviderPluginManifest,
} from "@zframes/serve/serve";
import { dashboardWriteback } from "./vite";

/**
 * A minimal mounted plugin whose manifest authorises the upstream below — the
 * relay derives its allowlist from `plugins`, so a mount with none relays
 * nothing and every UA test here would 403 before fetch. Inline (not the real
 * fleet manifest) because this package may not import a provider.
 */
const TEST_PLUGIN: ProviderPluginManifest = {
  id: "test-fleet",
  name: "Test fleet",
  capabilities: ["day-stats"],
  sources: [],
  hosts: [{ host: "data.sec.gov", proxied: true }],
};

/** `dashboardWriteback` options with the test plugin mounted. */
const withPlugin = (
  options: Omit<
    Parameters<typeof dashboardWriteback>[0] & object,
    "plugins"
  > = {},
) => dashboardWriteback({ ...options, plugins: [TEST_PLUGIN] });

// Two things `vite.test.ts` structurally cannot see, pinned here.
//
// 1. The official-data proxy's User-Agent. `serve.test.ts` proves handleProxy
//    FORWARDS whatever UA it is handed, but nothing proved the dev plugin BUILDS
//    one — vite.test.ts's only proxy test is the 403 path, which returns before
//    fetch is ever reached, so the composed header is invisible to it. SEC's
//    fair-access policy answers a non-conforming UA with 403s, so a regression
//    here breaks every SEC/Treasury/FINRA frame under `vite dev` while the
//    identical CLI path (which builds its own UA) keeps working — it reads as a
//    frame bug, not a dev-server bug. These tests pin the exact composed string
//    for all four input combinations (option / env / both / neither).
//
// 2. The legacy last-resort target (`vite.ts` line 94): with no `file` option
//    and a store that yields nothing, the target must be
//    `resolve(root, "src/dashboard.json")` — the branch a fresh clone hits when
//    it runs `pnpm dev` before creating any store dashboard.
//
// The Vite server/middleware fakes mirror vite.test.ts's so both files read the
// same way; the network is stubbed (this suite never touches it) and the store
// home is redirected at a throwaway tmp dir so the developer's real
// `~/.config/zframes` is never consulted.

type Middleware = (req: unknown, res: unknown, next: () => void) => void;

interface FakeServer {
  config: { root: string };
  middlewares: {
    use: (path: string, handler: Middleware) => void;
  };
}

function register(plugin: ReturnType<typeof dashboardWriteback>, root: string) {
  const routes: Array<[string, Middleware]> = [];
  const server: FakeServer = {
    config: { root },
    middlewares: {
      use: (path, handler) => routes.push([path, handler]),
    },
  };
  plugin.configureServer(server);
  const handler = (path: string) => {
    const hit = routes.find(([p]) => p === path);
    if (!hit) throw new Error(`route not registered: ${path}`);
    return hit[1];
  };
  return { routes, handler };
}

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body?: string;
  ended: boolean;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
  done: Promise<void>;
}

function makeRes(): FakeRes {
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  return {
    statusCode: 0,
    headers: {},
    ended: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body) {
      this.body = body;
      this.ended = true;
      resolveDone();
    },
    done,
  };
}

/** An allowlisted official-data target (SEC's XBRL blob — the real user). */
const UPSTREAM =
  "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json";

function proxyReq(target: string) {
  return {
    method: "GET",
    url: `${DASHBOARD_PROXY_ROUTE}?url=${encodeURIComponent(target)}`,
  };
}

/** A minimal Response-like the stubbed global fetch resolves to. */
function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
  };
}

/** Stub the network, run one allowlisted proxy request, return the outgoing UA. */
async function proxyOnce(plugin: ReturnType<typeof dashboardWriteback>) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: 1 }));
  vi.stubGlobal("fetch", fetchMock);
  const { handler } = register(plugin, root);
  const res = makeRes();
  handler(DASHBOARD_PROXY_ROUTE)(proxyReq(UPSTREAM), res, () => {
    throw new Error("proxy route must not fall through for a GET");
  });
  await res.done;
  const ua = fetchMock.mock.calls[0][1].headers["User-Agent"] as string;
  return { fetchMock, res, ua };
}

const SPEC = { version: "0.0.1", title: "t", frames: [] };

let root: string;
let xdgHome: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "zf-vite-ua-root-"));
  xdgHome = mkdtempSync(join(tmpdir(), "zf-vite-ua-xdg-"));
  // Empty store home: getDefault() finds no config.json → the legacy branch.
  vi.stubEnv("XDG_CONFIG_HOME", xdgHome);
  // Never inherit the developer's / CI's contact — each test states its own.
  vi.stubEnv("ZFRAMES_CONTACT", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
  rmSync(xdgHome, { recursive: true, force: true });
});

describe("dashboardWriteback proxy User-Agent", () => {
  it("composes a polite contact UA from the `contact` option", async () => {
    const { fetchMock, res, ua } = await proxyOnce(
      withPlugin({ contact: "me@x.com" }),
    );
    // The exact string SEC's fair-access policy is checked against.
    expect(ua).toBe("zframes (me@x.com)");
    // …and the request really was relayed to the allowlisted upstream.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(UPSTREAM);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(`{"ok":1}`);
  });

  it("takes the contact from ZFRAMES_CONTACT when the option is absent", async () => {
    vi.stubEnv("ZFRAMES_CONTACT", "env@zentry.com");
    const { ua } = await proxyOnce(withPlugin());
    expect(ua).toBe("zframes (env@zentry.com)");
  });

  it("lets the explicit option win over ZFRAMES_CONTACT", async () => {
    vi.stubEnv("ZFRAMES_CONTACT", "env@zentry.com");
    const { ua } = await proxyOnce(
      withPlugin({ contact: "option@zentry.com" }),
    );
    expect(ua).toBe("zframes (option@zentry.com)");
    expect(ua).not.toContain("env@zentry.com");
  });

  it("sends no UA of its own when neither is set, so the browser default applies", async () => {
    const { ua } = await proxyOnce(withPlugin());
    // handleProxy's PROXY_DEFAULT_UA — a real desktop Chrome UA the official
    // hosts accept. The failure this guards: interpolating an absent contact
    // into the template, which would ship `zframes (undefined)` and earn 403s.
    expect(ua).toMatch(/^Mozilla\/5\.0 /);
    expect(ua).not.toContain("undefined");
    expect(ua).not.toContain("zframes");
  });

  it("keeps the proxy UA independent of the dashboard-read routes", async () => {
    // Same plugin instance serves both; a contact must not leak into the spec
    // routes, and the proxy must still carry it after a read.
    writeFileSync(join(root, "d.json"), JSON.stringify(SPEC));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const { handler } = register(
      withPlugin({ file: "d.json", contact: "both@x.com" }),
      root,
    );
    const read = makeRes();
    handler(DASHBOARD_READ_ROUTE)({ method: "GET" }, read, () => {});
    await read.done;
    expect(JSON.parse(read.body!)).toEqual(SPEC);
    expect(fetchMock).not.toHaveBeenCalled(); // reads are pure fs

    const res = makeRes();
    handler(DASHBOARD_PROXY_ROUTE)(proxyReq(UPSTREAM), res, () => {});
    await res.done;
    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toBe(
      "zframes (both@x.com)",
    );
  });
});

describe("dashboardWriteback legacy target fallback", () => {
  it("resolves <root>/src/dashboard.json when the store is empty", async () => {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, "src", "dashboard.json"),
      JSON.stringify({ ...SPEC, title: "legacy-in-repo" }),
    );
    const { handler } = register(dashboardWriteback(), root);
    const res = makeRes();
    handler(DASHBOARD_READ_ROUTE)({ method: "GET" }, res, () => {});
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).title).toBe("legacy-in-repo");
  });

  it("falls through to the legacy path when the default names a missing dashboard", async () => {
    // A default pointing at a dashboard that isn't on disk (renamed/deleted)
    // must not 404 the dev server — findDashboardFile() returns null and the
    // legacy in-repo spec takes over.
    mkdirSync(join(xdgHome, "zframes"), { recursive: true });
    writeFileSync(
      join(xdgHome, "zframes", "config.json"),
      JSON.stringify({ default: "ghost" }),
    );
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, "src", "dashboard.json"),
      JSON.stringify({ ...SPEC, title: "legacy-after-missing-default" }),
    );
    const { handler } = register(dashboardWriteback(), root);
    const res = makeRes();
    handler(DASHBOARD_READ_ROUTE)({ method: "GET" }, res, () => {});
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).title).toBe("legacy-after-missing-default");
  });

  it("404s the read route, naming the legacy path, when no spec exists anywhere", async () => {
    const { handler } = register(dashboardWriteback(), root);
    const res = makeRes();
    handler(DASHBOARD_READ_ROUTE)({ method: "GET" }, res, () => {});
    await res.done;
    expect(res.statusCode).toBe(404);
    // The 404 body carries the ENOENT for the exact file that was attempted,
    // which pins the last-resort target rather than "some missing file".
    expect(JSON.parse(res.body!).error).toContain(
      join(root, "src", "dashboard.json"),
    );
  });
});
