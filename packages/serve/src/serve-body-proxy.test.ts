import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleProxy, handleSpecWrite } from "./serve";

/**
 * Two contracts of `@zframes/serve`'s Node handlers, neither reachable from the
 * existing `serve.test.ts` (which only ever emits one ASCII `data` chunk):
 *
 * 1. **Request-body assembly across chunk boundaries.** The editor PUTs the
 *    WHOLE spec on Save and the dogfood dashboard is already ~62 KB, so Node
 *    always delivers that body as several `data` events. `handleSpecWrite`
 *    accumulates them with `body += chunk` (serve.ts:127), which decodes each
 *    Buffer independently as UTF-8 — so a multi-byte character (a Thai title,
 *    an emoji in a note frame) straddling a chunk boundary is rewritten to
 *    U+FFFD, still parses as JSON, still answers 200, and overwrites the
 *    user's file. Silent data loss on Save, so the CURRENT behaviour is pinned
 *    below behind KNOWN BUG markers. The fix is a Buffer accumulator plus a
 *    single `Buffer.concat(chunks).toString("utf8")` at `end`; landing it must
 *    flip those assertions. The same `+=` also makes MAX_BODY_BYTES count
 *    UTF-16 code units rather than bytes, pinned here too.
 *
 * 2. **Proxy relay fidelity.** `handleProxy` is what makes CORS-blocked
 *    official sources reachable client-side, and `@zframes/data-primitives`'
 *    `fetchJson` throws off `res.ok` so `TtlCache` can serve stale on a 429 —
 *    which only works if the upstream status reaches the browser verbatim
 *    instead of collapsing to 200. Also pinned: the `application/octet-stream`
 *    content-type fallback, that the target URL's query survives untouched, and
 *    that the relay runs with `redirect: "follow"`. Two more proxy behaviours
 *    are pinned as DEFECTS behind KNOWN BUG markers, so hardening the source
 *    flips them by design: the allowlist is consulted only on the pre-fetch URL
 *    (an allowlisted host with an open redirect has its final, off-allowlist
 *    target relayed verbatim — SSRF), and a `HEAD` is relayed upstream as a
 *    full-body GET.
 *
 * `serve.ts` keeps no module-level mutable state (only constants), so these
 * tests share one static import rather than the `vi.resetModules()` +
 * dynamic-import dance the provider suites need for their cache singletons.
 */

// The handlers take the structural ReqLike/ResLike (not Node's http types), so
// tiny fakes suffice; these aliases pull the param types off the exports.
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

const tmpDirs: string[] = [];

function specFile(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return join(dir, "dashboard.json");
}

/**
 * PUT `text` to `absFile`, delivered as the UTF-8 byte chunks produced by
 * cutting it at `cuts` (byte offsets) — exactly what Node does to a real
 * socket read. Returns the fake response once the handler has ended it.
 */
async function putInChunks(
  absFile: string,
  text: string,
  cuts: number[],
): Promise<FakeRes> {
  const buf = Buffer.from(text, "utf8");
  const bounds = [0, ...cuts, buf.length];
  const res = makeRes();
  const ctl = makeWriteReq();
  handleSpecWrite(ctl.req, res, absFile);
  for (let i = 0; i < bounds.length - 1; i += 1) {
    ctl.emitData(buf.subarray(bounds[i], bounds[i + 1]));
  }
  ctl.emitEnd();
  await res.done;
  return res;
}

/** Byte offset of `needle`'s first UTF-8 byte inside `haystack`. */
function byteIndexOf(haystack: string, needle: string): number {
  const at = Buffer.from(haystack, "utf8").indexOf(Buffer.from(needle, "utf8"));
  expect(at).toBeGreaterThan(-1);
  return at;
}

interface UpstreamOpts {
  status?: number;
  contentType?: string | null;
  body?: string;
  /** Called if the handler reads `upstream.url` / `upstream.redirected`. */
  onFinalUrlRead?: () => void;
}

/** A minimal Response-like the stubbed global fetch resolves to. */
function upstreamResponse(opts: UpstreamOpts = {}) {
  const { status = 200, contentType = "application/json", body = "{}" } = opts;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? contentType : null,
    },
    get url() {
      opts.onFinalUrlRead?.();
      return "https://evil.example.com/exfil";
    },
    get redirected() {
      opts.onFinalUrlRead?.();
      return true;
    },
    text: async () => body,
  };
}

function stubFetch(opts: UpstreamOpts = {}) {
  const fetchMock = vi.fn().mockResolvedValue(upstreamResponse(opts));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

describe("handleSpecWrite body assembly across data chunks", () => {
  it("reassembles a multi-chunk ASCII spec byte-identically", async () => {
    // ~80 KB, like the real dogfood dashboard: several socket reads, always.
    const spec = {
      version: "1.0.0",
      title: "big board",
      // `id` and `position` are both required by DashboardSpecSchema, which the
      // write route now enforces before touching the file — so a body meant to
      // SUCCEED has to be a genuinely valid spec, not merely valid JSON.
      frames: Array.from({ length: 400 }, (_, i) => ({
        id: `note-${i}`,
        frame: "note",
        position: { x: i % 4, y: Math.floor(i / 4), w: 3, h: 2 },
        config: {
          text: `frame ${i} ${"lorem ipsum dolor sit amet ".repeat(6)}`,
        },
      })),
    };
    const text = JSON.stringify(spec);
    expect(Buffer.byteLength(text, "utf8")).toBeGreaterThan(64 * 1024);
    const file = specFile("zf-chunk-ascii-");
    const n = Buffer.byteLength(text, "utf8");
    const res = await putInChunks(file, text, [
      Math.floor(n / 4),
      Math.floor(n / 2),
      Math.floor((3 * n) / 4),
    ]);
    expect(res.statusCode).toBe(200);
    const onDisk = readFileSync(file, "utf8");
    expect(JSON.parse(onDisk)).toEqual(spec);
    expect(onDisk.endsWith("\n")).toBe(true);
  });

  it("round-trips Thai + emoji when no character is split (control)", async () => {
    const spec = { title: "ราคาทองคำ 🪙", frames: [] };
    const text = JSON.stringify(spec);
    const file = specFile("zf-chunk-whole-");
    // Cut on an ASCII boundary (the comma before "frames") — safe by luck of
    // where the bytes fall, which is exactly why the bug below is intermittent.
    const res = await putInChunks(file, text, [byteIndexOf(text, `,"frames"`)]);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(spec);
  });

  it("corrupts a 3-byte Thai character split across two chunks", async () => {
    const title = "ราคาทองคำ 🪙";
    const text = JSON.stringify({ title, frames: [] });
    const file = specFile("zf-chunk-thai-");
    // Cut 1 byte into "ร" (3 UTF-8 bytes): chunk 1 ends mid-character.
    const res = await putInChunks(file, text, [byteIndexOf(text, "ร") + 1]);

    // KNOWN BUG: `body += chunk` (serve.ts:127) decodes each chunk on its own,
    // so the straddling character becomes U+FFFD runs (1 for the truncated
    // head, 2 for the orphaned continuation bytes), the corrupted spec still
    // parses, and the user's file is overwritten with a 200 — should be a
    // Buffer accumulator decoded once at `end`, so the title round-trips
    // verbatim. Pinned so the suite stays green; fixing the source must flip
    // this assertion.
    expect(res.statusCode).toBe(200);
    const written = JSON.parse(readFileSync(file, "utf8")) as {
      title: string;
    };
    expect(written.title).not.toBe(title);
    expect(written.title).toContain("�");
    // Exactly the split character is destroyed; every other byte survives.
    expect(written.title.replace(/�+/g, "")).toBe("าคาทองคำ 🪙");
  });

  it("corrupts a 4-byte emoji split across two chunks", async () => {
    const title = "Gold 🪙";
    const text = JSON.stringify({ title, frames: [] });
    const file = specFile("zf-chunk-emoji-");
    // Cut 2 bytes into 🪙 (4 UTF-8 bytes), splitting it down the middle.
    const res = await putInChunks(file, text, [byteIndexOf(text, "🪙") + 2]);

    // KNOWN BUG: same `body += chunk` defect as above — the emoji is replaced
    // by U+FFFD and the write still 200s. Should round-trip "Gold 🪙" byte for
    // byte. Pinned so the suite stays green; fixing the source must flip this
    // assertion.
    expect(res.statusCode).toBe(200);
    const written = JSON.parse(readFileSync(file, "utf8")) as {
      title: string;
    };
    expect(written.title).not.toBe(title);
    expect(written.title.replace(/�+/g, "")).toBe("Gold ");
  });

  it("measures the 2 MB body cap in UTF-16 units, not bytes", async () => {
    const res = makeRes();
    const ctl = makeWriteReq();
    handleSpecWrite(ctl.req, res, specFile("zf-cap-"));
    // 2 × 1,000,000 Thai characters = 2,000,000 UTF-16 units but 6,000,000
    // UTF-8 bytes — three times MAX_BODY_BYTES.
    const half = Buffer.from("ก".repeat(1_000_000), "utf8");
    expect(half.length).toBe(3_000_000);
    ctl.emitData(half);
    ctl.emitData(half);

    // KNOWN BUG: the cap compares `body.length` (decoded UTF-16 code units)
    // against MAX_BODY_BYTES, so a 6 MB non-ASCII upload sails past a 2 MB
    // byte cap instead of being cut off with 413 + req.destroy(). Should count
    // bytes (the natural consequence of buffering chunks). Pinned so the suite
    // stays green; fixing the source must flip this assertion.
    expect(res.ended).toBe(false);
    expect(ctl.destroyed).toBe(false);
    ctl.emitEnd();
    await res.done;
    expect(res.statusCode).toBe(400); // reached JSON.parse, not the 413 guard
  });
});

describe("handleProxy upstream status relay", () => {
  async function relay(status: number, body: string): Promise<FakeRes> {
    stubFetch({ status, body });
    const res = makeRes();
    await handleProxy(makeProxyReq(proxyUrl("https://data.sec.gov/x")), res);
    await res.done;
    return res;
  }

  it("relays a 429 (rate limit) so TtlCache can serve stale", async () => {
    const res = await relay(429, `{"error":"slow down"}`);
    expect(res.statusCode).toBe(429);
    expect(res.body).toBe(`{"error":"slow down"}`);
  });

  it("relays a 404 rather than collapsing it to 200", async () => {
    const res = await relay(404, "not found");
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe("not found");
  });

  it("relays a 500 rather than collapsing it to 200", async () => {
    const res = await relay(500, "boom");
    expect(res.statusCode).toBe(500);
    expect(res.body).toBe("boom");
  });

  it("falls back to application/octet-stream with no upstream type", async () => {
    stubFetch({ contentType: null, body: "raw-bytes" });
    const res = makeRes();
    await handleProxy(
      makeProxyReq(proxyUrl("https://cdn.finra.org/f.txt")),
      res,
    );
    await res.done;
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.body).toBe("raw-bytes");
  });

  it("passes a non-JSON upstream content-type through unchanged", async () => {
    stubFetch({ contentType: "text/csv; charset=utf-8", body: "a,b\n1,2" });
    const res = makeRes();
    await handleProxy(
      makeProxyReq(proxyUrl("https://cdn.finra.org/f.csv")),
      res,
    );
    await res.done;
    expect(res.headers["content-type"]).toBe("text/csv; charset=utf-8");
  });
});

describe("handleProxy request shape", () => {
  it("accepts HEAD but relays it upstream as a full-body GET", async () => {
    const fetchMock = stubFetch({ body: `{"ok":1}` });
    const res = makeRes();
    await handleProxy(
      makeProxyReq(proxyUrl("https://data.sec.gov/x"), "HEAD"),
      res,
    );
    await res.done;
    // Only a non-GET/HEAD method is 405 (serve.ts:170), so HEAD passes the guard
    // and reaches the same allowlisted target.
    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://data.sec.gov/x");

    // KNOWN BUG: the upstream init carries no `method` (serve.ts:192), so a HEAD
    // is relayed as a GET — the entire body is pulled from a rate-limited
    // official host and measured against PROXY_MAX_BYTES, so a HEAD of SEC's
    // multi-MB companyfacts blob burns the download and can 502 where a real
    // HEAD would be free — and is then handed to `res.end` (real Node discards
    // it on a HEAD response, so the cost is the wasted fetch, not a
    // spec-violating body on the wire). Should forward `method: req.method` and
    // answer a HEAD with headers only, per RFC 9110. Pinned so the suite stays
    // green; fixing the source must flip these two assertions.
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
    expect(res.body).toBe(`{"ok":1}`);
  });

  it("keeps the target's query string intact", async () => {
    const fetchMock = stubFetch();
    const target =
      "https://api.fiscaldata.treasury.gov/services/api/v1/x?fields=a,b&page[size]=2";
    const res = makeRes();
    await handleProxy(makeProxyReq(proxyUrl(target)), res);
    await res.done;
    expect(res.statusCode).toBe(200);
    // The full query survives the `?url=` decode + URL round-trip verbatim —
    // commas and brackets included, unescaped, exactly as the provider built
    // it (fiscaldata rejects a mangled `fields` / `page[size]`).
    expect(fetchMock.mock.calls[0][0]).toBe(target);
  });

  it("fetches with redirect:follow under an abort timeout", async () => {
    const fetchMock = stubFetch();
    const res = makeRes();
    await handleProxy(makeProxyReq(proxyUrl("https://data.sec.gov/x")), res);
    await res.done;
    const init = fetchMock.mock.calls[0][1];
    expect(init.redirect).toBe("follow");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal.aborted).toBe(false);
    expect(init.headers.Accept).toBe("application/json,text/plain,*/*");
  });

  it("relays an off-allowlist redirect target without re-checking the host", async () => {
    // The stubbed upstream reports it LANDED on an off-allowlist host
    // (`upstream.url` → https://evil.example.com/exfil, `redirected` → true),
    // i.e. the open-redirect case on an allowlisted host.
    let finalUrlRead = false;
    const fetchMock = stubFetch({
      body: `{"leaked":true}`,
      onFinalUrlRead: () => {
        finalUrlRead = true;
      },
    });
    const res = makeRes();
    await handleProxy(
      makeProxyReq(proxyUrl("https://www.sec.gov/redirect?to=evil")),
      res,
    );
    await res.done;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // KNOWN BUG: PROXY_ALLOW_HOSTS is consulted only on the pre-fetch URL
    // (serve.ts:187) and the fetch runs `redirect: "follow"` (serve.ts:197), so
    // the handler never inspects where the request actually landed —
    // `upstream.url` / `upstream.redirected` are never read. An allowlisted host
    // with an open redirect therefore has its FINAL, off-allowlist target
    // fetched and relayed verbatim: an SSRF hole on the repo's only proxy
    // boundary, reachable by any dashboard.json that names such a URL. Should
    // re-check `new URL(upstream.url).hostname` against PROXY_ALLOW_HOSTS (or
    // fetch with `redirect: "manual"` and refuse to follow) and answer 403 with
    // no upstream body. Pinned so the suite stays green; fixing the source must
    // flip all three assertions below — a hardened handler READS the final URL
    // and 403s instead of relaying `{"leaked":true}` with a 200.
    expect(finalUrlRead).toBe(false);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(`{"leaked":true}`);
  });
});
