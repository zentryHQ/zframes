import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleProxy,
  handleSpecRead,
  handleSpecWrite,
} from "./serve";

// The handlers take the structural ReqLike/ResLike (not Node's http types), so
// tiny fakes are all the tests need. These aliases pull the param types off the
// exported handlers without re-declaring the internal interfaces.
type WriteReq = Parameters<typeof handleSpecWrite>[0];
type ProxyReq = Parameters<typeof handleProxy>[0];

interface FakeRes {
  statusCode: number;
  headers: Record<string, string>;
  body?: string;
  ended: boolean;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
  /** Resolves when the handler calls res.end(). */
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

/** A controllable write request — call the handler, then drive data/end. */
function makeWriteReq(
  opts: { method?: string; contentType?: string | null } = {},
) {
  const { method = "PUT", contentType = "application/json" } = opts;
  const dataCbs: Array<(c: Buffer) => void> = [];
  const endCbs: Array<() => void> = [];
  let destroyed = false;
  const req = {
    method,
    headers: contentType == null ? {} : { "content-type": contentType },
    on(event: string, cb: (...a: unknown[]) => void) {
      if (event === "data") dataCbs.push(cb as (c: Buffer) => void);
      if (event === "end") endCbs.push(cb as () => void);
      return req;
    },
    destroy() {
      destroyed = true;
      return req;
    },
  };
  return {
    req: req as unknown as WriteReq,
    emitData: (c: Buffer) => dataCbs.forEach((f) => f(c)),
    emitEnd: () => endCbs.forEach((f) => f()),
    get destroyed() {
      return destroyed;
    },
  };
}

function makeProxyReq(url: string, method = "GET"): ProxyReq {
  return {
    method,
    url,
    headers: {},
    on() {},
    destroy() {},
  } as unknown as ProxyReq;
}

function proxyUrl(target: string): string {
  return `/__zframes/proxy?url=${encodeURIComponent(target)}`;
}

describe("handleSpecRead", () => {
  it("returns 200 with the file verbatim, no-store, JSON content-type", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zf-read-"));
    const file = join(dir, "dashboard.json");
    const contents = `{"title":"t","frames":[]}`;
    writeFileSync(file, contents, "utf8");
    const res = makeRes();
    await handleSpecRead(file, res);
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toBe(contents);
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns 404 for a missing file", async () => {
    const res = makeRes();
    await handleSpecRead(join(tmpdir(), "zf-does-not-exist-xyz.json"), res);
    await res.done;
    expect(res.statusCode).toBe(404);
  });

  it("returns 500 for a non-ENOENT read error (path is a directory)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zf-read-dir-"));
    const res = makeRes();
    await handleSpecRead(dir, res); // EISDIR, not ENOENT
    await res.done;
    expect(res.statusCode).toBe(500);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("handleSpecWrite", () => {
  it("rejects non-PUT/POST methods with 405", async () => {
    const res = makeRes();
    const { req } = makeWriteReq({ method: "GET" });
    handleSpecWrite(req, res, "/unused");
    await res.done;
    expect(res.statusCode).toBe(405);
  });

  it("rejects a missing JSON content-type with 415 (CSRF guard)", async () => {
    const res = makeRes();
    const { req } = makeWriteReq({ contentType: null });
    handleSpecWrite(req, res, "/unused");
    await res.done;
    expect(res.statusCode).toBe(415);
  });

  it("rejects text/plain with 415", async () => {
    const res = makeRes();
    const { req } = makeWriteReq({ contentType: "text/plain" });
    handleSpecWrite(req, res, "/unused");
    await res.done;
    expect(res.statusCode).toBe(415);
  });

  it("writes a valid spec reformatted (2-space + trailing newline) and 200s", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zf-write-"));
    const file = join(dir, "dashboard.json");
    const res = makeRes();
    const ctl = makeWriteReq();
    handleSpecWrite(ctl.req, res, file);
    ctl.emitData(Buffer.from(`{"title":"t","frames":[]}`));
    ctl.emitEnd();
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(readFileSync(file, "utf8")).toBe(
      `{\n  "title": "t",\n  "frames": []\n}\n`,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns 400 on malformed JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "zf-write-bad-"));
    const res = makeRes();
    const ctl = makeWriteReq();
    handleSpecWrite(ctl.req, res, join(dir, "d.json"));
    ctl.emitData(Buffer.from("not json"));
    ctl.emitEnd();
    await res.done;
    expect(res.statusCode).toBe(400);
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns 413 and destroys the request when the body exceeds the cap", async () => {
    const res = makeRes();
    const ctl = makeWriteReq();
    handleSpecWrite(ctl.req, res, "/unused");
    ctl.emitData(Buffer.alloc(2_000_001, 0x61)); // > MAX_BODY_BYTES
    await res.done;
    expect(res.statusCode).toBe(413);
    expect(ctl.destroyed).toBe(true);
    ctl.emitEnd(); // aborted → no write, no throw
    expect(res.statusCode).toBe(413);
  });
});

describe("handleProxy (SSRF allowlist)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects non-GET/HEAD with 405", async () => {
    const res = makeRes();
    await handleProxy(
      makeProxyReq(proxyUrl("https://data.sec.gov/x"), "POST"),
      res,
    );
    await res.done;
    expect(res.statusCode).toBe(405);
  });

  it("returns 400 when ?url= is missing", async () => {
    const res = makeRes();
    await handleProxy(makeProxyReq("/__zframes/proxy"), res);
    await res.done;
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for a non-https target", async () => {
    const res = makeRes();
    await handleProxy(makeProxyReq(proxyUrl("http://data.sec.gov/x")), res);
    await res.done;
    expect(res.statusCode).toBe(400);
  });

  it("returns 403 for a host not on the allowlist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await handleProxy(makeProxyReq(proxyUrl("https://evil.com/x")), res);
    await res.done;
    expect(res.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("relays an allowlisted host's status + body, and sends a browser UA by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => `{"x":1}`,
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await handleProxy(makeProxyReq(proxyUrl("https://data.sec.gov/x")), res);
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(`{"x":1}`);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(res.headers["cache-control"]).toBe("no-store");
    const ua = fetchMock.mock.calls[0][1].headers["User-Agent"];
    expect(ua).toContain("Mozilla/5.0");
  });

  it("forwards a caller-supplied contact UA", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => `{}`,
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await handleProxy(makeProxyReq(proxyUrl("https://data.sec.gov/x")), res, {
      userAgent: "zframes (test@example.com)",
    });
    await res.done;
    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toBe(
      "zframes (test@example.com)",
    );
  });

  it("returns 502 when the upstream body exceeds the size cap", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => "x".repeat(16_000_001), // > PROXY_MAX_BYTES
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await handleProxy(makeProxyReq(proxyUrl("https://data.sec.gov/x")), res);
    await res.done;
    expect(res.statusCode).toBe(502);
  });

  it("returns 502 when the upstream fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await handleProxy(makeProxyReq(proxyUrl("https://data.sec.gov/x")), res);
    await res.done;
    expect(res.statusCode).toBe(502);
  });
});
