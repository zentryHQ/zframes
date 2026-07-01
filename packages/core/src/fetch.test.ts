import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fetchJson, fetchText } from "./fetch";

// A minimal stand-in for the Response shape request()/fetchJson/fetchText use:
// only `.ok`, `.status`, `.json()`, `.text()` are touched.
interface FakeResponseInit {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}

function fakeResponse({
  ok = true,
  status = 200,
  json,
  text = "",
}: FakeResponseInit = {}) {
  return {
    ok,
    status,
    json: async () => json,
    text: async () => text,
  } as unknown as Response;
}

/** Stub globalThis.fetch with a spy that resolves to `res`, return the spy. */
function stubFetch(res: Response) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Pull the (url, init) pair the stubbed fetch was called with. */
function callArgs(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

describe("fetchJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed JSON body on a 200", async () => {
    const fetchMock = stubFetch(fakeResponse({ json: { a: 1, b: "two" } }));
    const out = await fetchJson<{ a: number; b: string }>(
      "https://x.test/data",
    );
    expect(out).toEqual({ a: 1, b: "two" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(callArgs(fetchMock).url).toBe("https://x.test/data");
  });

  it("validates a matching body through a Zod schema (returns the parsed value)", async () => {
    stubFetch(fakeResponse({ json: { price: 42, symbol: "BTC" } }));
    const schema = z.object({ price: z.number(), symbol: z.string() });
    const out = await fetchJson("https://x.test/q", schema);
    expect(out).toEqual({ price: 42, symbol: "BTC" });
  });

  it("throws when the body does not match the Zod schema", async () => {
    stubFetch(fakeResponse({ json: { price: "not-a-number" } }));
    const schema = z.object({ price: z.number(), symbol: z.string() });
    await expect(fetchJson("https://x.test/q", schema)).rejects.toThrow();
  });

  it("does not validate when no schema is passed (returns the raw body as-is)", async () => {
    // A body that would fail any strict schema still comes back untouched.
    stubFetch(fakeResponse({ json: { unexpected: true } }));
    const out = await fetchJson<Record<string, unknown>>("https://x.test/raw");
    expect(out).toEqual({ unexpected: true });
  });

  it("throws a labelled error including the url and status on a non-2xx response", async () => {
    stubFetch(fakeResponse({ ok: false, status: 429 }));
    await expect(
      fetchJson("https://api.test/rate", z.unknown()),
    ).rejects.toThrow("https://api.test/rate failed: 429");
  });

  it("throws on a 500 with the exact status in the message", async () => {
    stubFetch(fakeResponse({ ok: false, status: 500 }));
    await expect(fetchJson("https://api.test/boom")).rejects.toThrow(
      "https://api.test/boom failed: 500",
    );
  });

  it("sets a descriptive User-Agent header on the outgoing Node request", async () => {
    const fetchMock = stubFetch(fakeResponse({ json: {} }));
    await fetchJson("https://x.test/ua");
    const { init } = callArgs(fetchMock);
    const headers = new Headers(init.headers);
    expect(headers.get("User-Agent")).toBe(
      "zframes (+https://github.com/zentryhq/zframes)",
    );
  });

  it("does not overwrite a caller-supplied User-Agent in init", async () => {
    const fetchMock = stubFetch(fakeResponse({ json: {} }));
    await fetchJson("https://x.test/ua", undefined, {
      init: { headers: { "User-Agent": "custom-agent/1.0" } },
    });
    const { init } = callArgs(fetchMock);
    const headers = new Headers(init.headers);
    expect(headers.get("User-Agent")).toBe("custom-agent/1.0");
  });

  it("treats proxied:true as a no-op in Node — fetches the raw target, not the proxy route", async () => {
    const fetchMock = stubFetch(fakeResponse({ json: {} }));
    await fetchJson("https://data.sec.gov/xbrl", undefined, { proxied: true });
    const { url } = callArgs(fetchMock);
    expect(url).toBe("https://data.sec.gov/xbrl");
    expect(url).not.toContain("/__zframes/proxy");
  });

  it("passes through the caller's init (method/body) to fetch", async () => {
    const fetchMock = stubFetch(fakeResponse({ json: {} }));
    await fetchJson("https://x.test/post", undefined, {
      init: { method: "POST", body: '{"q":1}' },
    });
    const { init } = callArgs(fetchMock);
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"q":1}');
  });
});

describe("fetchText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the raw response body as a string", async () => {
    const xml = "<rss><item>hi</item></rss>";
    stubFetch(fakeResponse({ text: xml }));
    const out = await fetchText("https://feed.test/rss");
    expect(out).toBe(xml);
  });

  it("throws the labelled error on a non-2xx response", async () => {
    stubFetch(fakeResponse({ ok: false, status: 404, text: "" }));
    await expect(fetchText("https://feed.test/gone")).rejects.toThrow(
      "https://feed.test/gone failed: 404",
    );
  });

  it("sets the Node User-Agent header for text fetches too", async () => {
    const fetchMock = stubFetch(fakeResponse({ text: "ok" }));
    await fetchText("https://feed.test/rss");
    const { init } = callArgs(fetchMock);
    const headers = new Headers(init.headers);
    expect(headers.get("User-Agent")).toBe(
      "zframes (+https://github.com/zentryhq/zframes)",
    );
  });

  it("treats proxied:true as a no-op in Node for text fetches", async () => {
    const fetchMock = stubFetch(fakeResponse({ text: "ok" }));
    await fetchText("https://cdn.finra.org/short.txt", { proxied: true });
    expect(callArgs(fetchMock).url).toBe("https://cdn.finra.org/short.txt");
  });
});

describe("fetchJson — timeout & abort signal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("aborts via a default 10s AbortSignal.timeout when none is given", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = stubFetch(fakeResponse({ json: {} }));
    await fetchJson("https://x.test/a");
    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    // The timed-out signal is the exact one handed to fetch.
    expect(callArgs(fetchMock).init.signal).toBe(
      timeoutSpy.mock.results[0].value,
    );
  });

  it("honours a custom timeoutMs", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    stubFetch(fakeResponse({ json: {} }));
    await fetchJson("https://x.test/a", undefined, { timeoutMs: 500 });
    expect(timeoutSpy).toHaveBeenCalledWith(500);
  });

  it("uses a caller-supplied signal verbatim and skips the timeout", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const controller = new AbortController();
    const fetchMock = stubFetch(fakeResponse({ json: {} }));
    await fetchJson("https://x.test/a", undefined, {
      init: { signal: controller.signal },
    });
    expect(callArgs(fetchMock).init.signal).toBe(controller.signal);
    expect(timeoutSpy).not.toHaveBeenCalled();
  });
});

describe("fetchJson — proxied (browser path)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rewrites a proxied request to the same-origin proxy route when document exists", async () => {
    // Simulate a browser so request() takes the proxy-rewrite branch.
    vi.stubGlobal("document", {});
    const fetchMock = stubFetch(fakeResponse({ json: { ok: 1 } }));
    const target = "https://data.sec.gov/xbrl?x=1";
    await fetchJson(target, undefined, { proxied: true });
    expect(callArgs(fetchMock).url).toBe(
      `/__zframes/proxy?url=${encodeURIComponent(target)}`,
    );
  });

  it("does NOT rewrite when proxied is unset, even in a browser", async () => {
    vi.stubGlobal("document", {});
    const fetchMock = stubFetch(fakeResponse({ json: {} }));
    await fetchJson("https://data.sec.gov/xbrl", undefined, {});
    expect(callArgs(fetchMock).url).toBe("https://data.sec.gov/xbrl");
  });
});
