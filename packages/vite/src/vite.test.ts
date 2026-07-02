import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DASHBOARD_PROXY_ROUTE,
  DASHBOARD_READ_ROUTE,
  DASHBOARD_WRITE_ROUTE,
} from "@zframes/serve/serve";
import { AGENTS_LIST_ROUTE, ASK_ROUTE } from "@zframes/zai/agent";
import {
  ACCOUNT_CREDENTIALS_ROUTE,
  ACCOUNT_PORTFOLIO_ROUTE,
} from "@zframes/account/account";
import { dashboardWriteback } from "./vite";

// dashboardWriteback is pure composition — route registration over the
// serve/zai/account handlers plus the store-default target resolution. These
// tests pin the composition invariants; the handlers' own behaviour is covered
// in their home packages (serve.test.ts, agent-http.test.ts, account.test.ts).

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
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
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
      resolve();
    },
    done,
  };
}

const SPEC = { version: "0.0.1", title: "t", frames: [] };

let root: string;
let xdgHome: string;
let prevXdg: string | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "zf-vite-root-"));
  xdgHome = mkdtempSync(join(tmpdir(), "zf-vite-xdg-"));
  prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = xdgHome;
});

afterEach(() => {
  process.env.XDG_CONFIG_HOME = prevXdg;
  rmSync(root, { recursive: true, force: true });
  rmSync(xdgHome, { recursive: true, force: true });
});

describe("dashboardWriteback", () => {
  it("is a serve-only plugin", () => {
    const plugin = dashboardWriteback();
    expect(plugin.name).toBe("zframes:dashboard-writeback");
    expect(plugin.apply).toBe("serve");
  });

  it("registers the full route table, read before write", () => {
    const { routes } = register(dashboardWriteback(), root);
    const paths = routes.map(([p]) => p);
    expect(paths).toEqual([
      DASHBOARD_READ_ROUTE,
      DASHBOARD_WRITE_ROUTE,
      DASHBOARD_PROXY_ROUTE,
      AGENTS_LIST_ROUTE,
      ASK_ROUTE,
      ACCOUNT_PORTFOLIO_ROUTE,
      ACCOUNT_CREDENTIALS_ROUTE,
    ]);
    // Connect matches by prefix and the write route is a prefix of the read
    // route, so read MUST be registered first or GETs hit the write handler.
    expect(paths.indexOf(DASHBOARD_READ_ROUTE)).toBeLessThan(
      paths.indexOf(DASHBOARD_WRITE_ROUTE),
    );
  });

  it("serves an explicit file, resolved against the Vite root", async () => {
    writeFileSync(join(root, "my-dash.json"), JSON.stringify(SPEC));
    const { handler } = register(
      dashboardWriteback({ file: "my-dash.json" }),
      root,
    );
    const res = makeRes();
    handler(DASHBOARD_READ_ROUTE)({ method: "GET" }, res, () => {});
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!)).toEqual(SPEC);
  });

  it("falls back to the store's default dashboard when no file is given", async () => {
    // Store layout: dashboards/<name>/dashboard.json + config.json {default}.
    const dashDir = join(xdgHome, "zframes", "dashboards", "crypto");
    mkdirSync(dashDir, { recursive: true });
    writeFileSync(
      join(dashDir, "dashboard.json"),
      JSON.stringify({ ...SPEC, title: "store-default" }),
    );
    writeFileSync(
      join(xdgHome, "zframes", "config.json"),
      JSON.stringify({ default: "crypto" }),
    );
    const { handler } = register(dashboardWriteback(), root);
    const res = makeRes();
    handler(DASHBOARD_READ_ROUTE)({ method: "GET" }, res, () => {});
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).title).toBe("store-default");
  });

  it("resolves the target per request, so a mid-session default switch is picked up", async () => {
    for (const name of ["one", "two"]) {
      const dir = join(xdgHome, "zframes", "dashboards", name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "dashboard.json"),
        JSON.stringify({ ...SPEC, title: name }),
      );
    }
    const configFile = join(xdgHome, "zframes", "config.json");
    writeFileSync(configFile, JSON.stringify({ default: "one" }));
    const { handler } = register(dashboardWriteback(), root);

    const first = makeRes();
    handler(DASHBOARD_READ_ROUTE)({ method: "GET" }, first, () => {});
    await first.done;
    expect(JSON.parse(first.body!).title).toBe("one");

    writeFileSync(configFile, JSON.stringify({ default: "two" }));
    const second = makeRes();
    handler(DASHBOARD_READ_ROUTE)({ method: "GET" }, second, () => {});
    await second.done;
    expect(JSON.parse(second.body!).title).toBe("two");
  });

  it("write route round-trips the spec to the explicit file", async () => {
    const file = join(root, "dashboard.json");
    writeFileSync(file, JSON.stringify(SPEC));
    const { handler } = register(
      dashboardWriteback({ file: "dashboard.json" }),
      root,
    );
    const updated = { ...SPEC, title: "edited" };
    const dataCbs: Array<(c: Buffer) => void> = [];
    const endCbs: Array<() => void> = [];
    const req = {
      method: "PUT",
      headers: { "content-type": "application/json" },
      on(event: string, cb: (...a: unknown[]) => void) {
        if (event === "data") dataCbs.push(cb as (c: Buffer) => void);
        if (event === "end") endCbs.push(cb as () => void);
        return req;
      },
      destroy() {
        return req;
      },
    };
    const res = makeRes();
    handler(DASHBOARD_WRITE_ROUTE)(req, res, () => {});
    dataCbs.forEach((f) => f(Buffer.from(JSON.stringify(updated))));
    endCbs.forEach((f) => f());
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(readFileSync(file, "utf8")).title).toBe("edited");
  });

  it("proxy route refuses a non-allowlisted host without touching the network", async () => {
    const { handler } = register(dashboardWriteback(), root);
    const res = makeRes();
    handler(DASHBOARD_PROXY_ROUTE)(
      {
        method: "GET",
        url: `/?url=${encodeURIComponent("https://evil.example/x")}`,
      },
      res,
      () => {},
    );
    await res.done;
    expect(res.statusCode).toBe(403);
  });

  it("read and proxy routes pass non-GET methods through to the next middleware", () => {
    const { handler } = register(dashboardWriteback(), root);
    for (const route of [DASHBOARD_READ_ROUTE, DASHBOARD_PROXY_ROUTE]) {
      let nexted = false;
      handler(route)({ method: "POST" }, makeRes(), () => {
        nexted = true;
      });
      expect(nexted).toBe(true);
    }
  });
});
