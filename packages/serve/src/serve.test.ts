import { lookup } from "node:dns/promises";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { handleProxy, handleSpecRead, handleSpecWrite } from "./serve";

// A representative slice of real fleet hosts for the fixtures below. A LOCAL
// list on purpose: the relay has no default allowlist and this package may not
// import the fleet's manifest (serve depends on spec alone), so the tests
// bring their own — exactly what any real mount does.
const PROXY_ALLOW_HOSTS = new Set([
  "data.sec.gov",
  "www.sec.gov",
  "api.fiscaldata.treasury.gov",
  "api.nasdaq.com",
  "cdn.finra.org",
  "fred.stlouisfed.org",
  "www.bankofengland.co.uk",
  "www.rba.gov.au",
  "www.fhfa.gov",
]);

// `handleProxy` resolves every hop before fetching it (the private-address
// guard), and this suite is hermetic: fetch is stubbed, so DNS must be too, or
// every test would ride the machine's resolver. Public by default (a TEST-NET-3
// documentation address); the guard's own suite overrides per test.
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "203.0.113.10", family: 4 }]),
}));
const lookupMock = lookup as unknown as Mock;

// The handlers take the structural ReqLike/ResLike (not Node's http types), so
// tiny fakes are all the tests need. These aliases pull the param types off the
// exported handlers without re-declaring the internal interfaces.
type WriteReq = Parameters<typeof handleSpecWrite>[0];
type ProxyReq = Parameters<typeof handleProxy>[0];
type ProxyRes = Parameters<typeof handleProxy>[1];
type ProxyOpts = NonNullable<Parameters<typeof handleProxy>[2]>;

// `handleProxy` allows NOTHING unless its mount names hosts, so every relay
// test has to bring a list. These run against the in-repo fleet's list, which
// is what the CLI and vite mounts pass today; the empty default is covered
// on its own below, since "a fresh install reaches nothing" is a behaviour in
// its own right rather than a gap in the fixtures.
const relay = (req: ProxyReq, res: ProxyRes, opts: ProxyOpts = {}) =>
  handleProxy(req, res, { allowHosts: PROXY_ALLOW_HOSTS, ...opts });

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
    await relay(makeProxyReq(proxyUrl("https://data.sec.gov/x"), "POST"), res);
    await res.done;
    expect(res.statusCode).toBe(405);
  });

  it("returns 400 when ?url= is missing", async () => {
    const res = makeRes();
    await relay(makeProxyReq("/__zframes/proxy"), res);
    await res.done;
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for a non-https target", async () => {
    const res = makeRes();
    await relay(makeProxyReq(proxyUrl("http://data.sec.gov/x")), res);
    await res.done;
    expect(res.statusCode).toBe(400);
  });

  it("returns 403 for a host not on the allowlist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await relay(makeProxyReq(proxyUrl("https://evil.com/x")), res);
    await res.done;
    expect(res.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── The mount owns the allowlist ───────────────────────────────────────────
  // zframes ships frames and the assembly layer, not a decision about which
  // third party a board calls. The relay therefore starts from NOTHING and each
  // mount names what it may reach, which in the shipped CLI is derived from the
  // manifests of the adapters the operator installed. These three tests are that
  // posture: without them a future refactor could quietly reintroduce a
  // compiled-in default and no other test would notice.

  it("relays nothing at all when the mount names no hosts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    // Deliberately NOT the `relay` fixture: no allowHosts, which is exactly
    // what a fresh install with no adapters looks like. Even the most
    // uncontroversial official source is unreachable.
    await handleProxy(makeProxyReq(proxyUrl("https://data.sec.gov/x")), res);
    await res.done;
    expect(res.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reaches only the hosts its own mount named", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => `{"ok":1}`,
    });
    vi.stubGlobal("fetch", fetchMock);

    const named = makeRes();
    await handleProxy(
      makeProxyReq(proxyUrl("https://one.example.com/x")),
      named,
      {
        allowHosts: ["one.example.com"],
      },
    );
    await named.done;
    expect(named.statusCode).toBe(200);

    // A host another mount would allow is still refused here: the list is
    // per-mount, never a union of everything anyone ever authorised.
    const other = makeRes();
    await handleProxy(makeProxyReq(proxyUrl("https://data.sec.gov/x")), other, {
      allowHosts: ["one.example.com"],
    });
    await other.done;
    expect(other.statusCode).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a redirect off the mount's list without reading the body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 302,
        headers: {
          get: (name: string) =>
            name === "location" ? "https://data.sec.gov/x" : null,
        },
        text: async () => "should never be read",
      })
      .mockResolvedValue({
        status: 200,
        headers: { get: () => "application/json" },
        text: async () => `{"leaked":1}`,
      });
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await handleProxy(
      makeProxyReq(proxyUrl("https://one.example.com/x")),
      res,
      {
        allowHosts: ["one.example.com"],
      },
    );
    await res.done;
    expect(res.statusCode).toBe(403);
    // One call: the hop was refused before it was ever fetched.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.body).not.toContain("leaked");
  });

  it("relays an allowlisted host's status + body, and sends a browser UA by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => `{"x":1}`,
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await relay(makeProxyReq(proxyUrl("https://data.sec.gov/x")), res);
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
    await relay(makeProxyReq(proxyUrl("https://data.sec.gov/x")), res, {
      userAgent: "zframes (test@example.com)",
    });
    await res.done;
    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toBe(
      "zframes (test@example.com)",
    );
  });

  it("keeps the browser UA for api.nasdaq.com even under --contact", async () => {
    // Nasdaq's bot mitigation DROPS a non-browser User-Agent — no status, no
    // body, just a hang. So an operator who passes --contact for the SEC's
    // fair-access policy would silently lose every Nasdaq card, with nothing in
    // the logs but timeouts. The courtesy UA is narrowed to hosts that asked.
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => `{}`,
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await relay(
      makeProxyReq(proxyUrl("https://api.nasdaq.com/api/quote/NVDA/info")),
      res,
      { userAgent: "zframes (test@example.com)" },
    );
    await res.done;
    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toContain(
      "Mozilla/5.0",
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
    await relay(makeProxyReq(proxyUrl("https://data.sec.gov/x")), res);
    await res.done;
    expect(res.statusCode).toBe(502);
  });

  // The central-bank FX hosts answer CSV, not JSON. They are covered
  // host-by-host (rather than by reading the set) so widening the allowlist is
  // always a visible test change, and each is paired with a lookalike that must
  // still be refused — `hostname` is matched exactly, so no subdomain,
  // suffix-glued or userinfo-prefixed variant may sneak in behind a real entry.
  const CSV_FX_HOSTS = [
    // FRED's keyless fredgraph.csv path (Fed H.10 dailies, incl. USD/THB).
    {
      host: "fred.stlouisfed.org",
      url: "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXTHUS&cosd=2026-07-01",
      csv: "observation_date,DEXTHUS\n2026-07-01,33.3100\n",
      contentType: "application/csv",
    },
    // Bank of England IADB CSV (daily GBP spot back to 1975).
    {
      host: "www.bankofengland.co.uk",
      url: "https://www.bankofengland.co.uk/boeapps/database/_iadb-FromShowColumns.asp?csv.x=yes&SeriesCodes=XUDLUSS&CSVF=TN&UsingCodes=Y",
      csv: "DATE,XUDLUSS\n02 Jan 1975,2.3359\n",
      contentType: "application/csv",
    },
    // RBA F11.1 (23 AUD pairs); it serves the CSV as octet-stream.
    {
      host: "www.rba.gov.au",
      url: "https://www.rba.gov.au/statistics/tables/csv/f11.1-data.csv",
      csv: "F11.1  EXCHANGE RATES\nTitle,A$1=USD\n",
      contentType: "application/octet-stream",
    },
  ] as const;

  for (const { host, url, csv, contentType } of CSV_FX_HOSTS) {
    it(`relays CSV from ${host} verbatim with its upstream content-type`, async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        headers: { get: () => contentType },
        text: async () => csv,
      });
      vi.stubGlobal("fetch", fetchMock);
      const res = makeRes();
      await relay(makeProxyReq(proxyUrl(url)), res);
      await res.done;
      expect(res.statusCode).toBe(200);
      // CSV must survive untouched — the relay never parses the body as JSON.
      expect(res.body).toBe(csv);
      expect(res.headers["content-type"]).toBe(contentType);
      expect(fetchMock.mock.calls[0][0]).toBe(url);
    });
  }

  // Lookalikes of the three hosts above: an attacker-controlled subdomain, a
  // suffix-glued domain, and a domain that merely embeds the real one.
  const CSV_FX_NEAR_MISSES = [
    "https://evil.fred.stlouisfed.org/graph/fredgraph.csv?id=DEXTHUS",
    "https://fred.stlouisfed.org.evil.com/graph/fredgraph.csv?id=DEXTHUS",
    "https://stlouisfed.org/graph/fredgraph.csv?id=DEXTHUS",
    "https://bankofengland.co.uk/boeapps/database/_iadb-FromShowColumns.asp",
    "https://www.bankofengland.co.uk.evil.com/boeapps/database/x.asp",
    "https://rba.gov.au/statistics/tables/csv/f11.1-data.csv",
    "https://www.rba.gov.au.evil.com/statistics/tables/csv/f11.1-data.csv",
    // userinfo trick: the allowlisted name sits before the `@`, so the real
    // host is `evil.com` and must be refused.
    "https://fred.stlouisfed.org@evil.com/graph/fredgraph.csv",
  ];

  for (const url of CSV_FX_NEAR_MISSES) {
    it(`returns 403 for the lookalike host ${new URL(url).hostname}`, async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const res = makeRes();
      await relay(makeProxyReq(proxyUrl(url)), res);
      await res.done;
      expect(res.statusCode).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it("returns 502 when the upstream fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await relay(makeProxyReq(proxyUrl("https://data.sec.gov/x")), res);
    await res.done;
    expect(res.statusCode).toBe(502);
  });
});

/**
 * The allowlist authorises NAMES; DNS decides where a name actually goes, and
 * once mounts derive their allowlists from installed plugin manifests the name
 * is the plugin author's. So every hop must also RESOLVE entirely into public
 * address space before it is fetched — otherwise a manifest naming an innocent
 * hostname whose A record points at the cloud metadata address turns the relay
 * into a reader for the operator's own network. These tests override the
 * module-level DNS mock per test.
 */
describe("handleProxy (resolved-address guard)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses an allowlisted name that resolves to a private address", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    lookupMock.mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);
    const res = makeRes();
    await handleProxy(
      makeProxyReq(proxyUrl("https://rebind.example.com/x")),
      res,
      { allowHosts: ["rebind.example.com"] },
    );
    await res.done;
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain("private");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when ANY resolved record is private (the rebinding shape)", async () => {
    // One public record beside the metadata address is not "mostly fine" — a
    // resolver races them, so the mixed answer is exactly what an attack
    // looks like and poisons the whole host.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    lookupMock.mockResolvedValueOnce([
      { address: "203.0.113.7", family: 4 },
      { address: "169.254.169.254", family: 4 },
    ]);
    const res = makeRes();
    await handleProxy(
      makeProxyReq(proxyUrl("https://rebind.example.com/x")),
      res,
      { allowHosts: ["rebind.example.com"] },
    );
    await res.done;
    expect(res.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a unique-local IPv6 record", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    lookupMock.mockResolvedValueOnce([{ address: "fd00::1", family: 6 }]);
    const res = makeRes();
    await handleProxy(
      makeProxyReq(proxyUrl("https://ula.example.com/x")),
      res,
      { allowHosts: ["ula.example.com"] },
    );
    await res.done;
    expect(res.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("relays a host resolving to a public IPv6 address only", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => `{"ok":1}`,
    });
    vi.stubGlobal("fetch", fetchMock);
    lookupMock.mockResolvedValueOnce([
      { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 },
    ]);
    const res = makeRes();
    await handleProxy(makeProxyReq(proxyUrl("https://v6.example.com/x")), res, {
      allowHosts: ["v6.example.com"],
    });
    await res.done;
    expect(res.statusCode).toBe(200);
  });

  it("refuses a private IPv4 literal without consulting DNS", async () => {
    // A manifest can't carry one (HostSchema refuses it), but a hand-written
    // mount could — and a literal needs no resolver to be judged.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    lookupMock.mockClear();
    const res = makeRes();
    await handleProxy(makeProxyReq(proxyUrl("https://192.168.7.7/x")), res, {
      allowHosts: ["192.168.7.7"],
    });
    await res.done;
    expect(res.statusCode).toBe(403);
    expect(lookupMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a redirect hop that resolves private, even when allowlisted", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 302,
        headers: {
          get: (name: string) =>
            name === "location" ? "https://two.example.com/y" : null,
        },
        text: async () => "unread",
      })
      .mockResolvedValue({
        status: 200,
        headers: { get: () => "application/json" },
        text: async () => `{"leaked":1}`,
      });
    vi.stubGlobal("fetch", fetchMock);
    // Entry resolves public, the hop resolves into RFC1918 — consumed in
    // lookup order.
    lookupMock
      .mockResolvedValueOnce([{ address: "203.0.113.7", family: 4 }])
      .mockResolvedValueOnce([{ address: "192.168.1.9", family: 4 }]);
    const res = makeRes();
    await handleProxy(
      makeProxyReq(proxyUrl("https://one.example.com/x")),
      res,
      {
        allowHosts: ["one.example.com", "two.example.com"],
      },
    );
    await res.done;
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain("two.example.com");
    // Only the entry hop was fetched; the poisoned hop never was.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.body).not.toContain("leaked");
  });

  it("answers 502 when the name does not resolve at all", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    lookupMock.mockRejectedValueOnce(
      Object.assign(new Error("getaddrinfo ENOTFOUND gone.example.com"), {
        code: "ENOTFOUND",
      }),
    );
    const res = makeRes();
    await handleProxy(
      makeProxyReq(proxyUrl("https://gone.example.com/x")),
      res,
      { allowHosts: ["gone.example.com"] },
    );
    await res.done;
    // The same 502 the fetch itself would have answered for a dead name.
    expect(res.statusCode).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
