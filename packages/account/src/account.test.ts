import { describe, expect, it } from "vitest";
import {
  binanceHoldings,
  isLocalRequest,
  maskKey,
  signBinance,
} from "./account";

type LocalReq = Parameters<typeof isLocalRequest>[0];
const req = (headers: Record<string, string>): LocalReq =>
  ({ headers }) as unknown as LocalReq;

describe("signBinance", () => {
  it("is a deterministic 64-char hex HMAC", () => {
    const sig = signBinance("timestamp=1&recvWindow=5000", "secret");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(signBinance("timestamp=1&recvWindow=5000", "secret")).toBe(sig);
  });

  it("differs for a different secret or a different query", () => {
    const base = signBinance("timestamp=1", "secret");
    expect(signBinance("timestamp=1", "other")).not.toBe(base);
    expect(signBinance("timestamp=2", "secret")).not.toBe(base);
  });
});

describe("maskKey", () => {
  it("keeps only the last 4 chars", () => {
    expect(maskKey("abcdef123456")).toBe("…3456");
  });
  it("fully masks short keys", () => {
    expect(maskKey("abcd")).toBe("…");
    expect(maskKey("ab")).toBe("…");
  });
});

describe("binanceHoldings", () => {
  it("sums free+locked, drops zeros, values stablecoins", () => {
    const holdings = binanceHoldings({
      balances: [
        { asset: "BTC", free: "0.5", locked: "0.1" },
        { asset: "USDT", free: "100", locked: "0" },
        { asset: "ETH", free: "0", locked: "0" },
      ],
    });
    expect(holdings).toEqual([
      { symbol: "BTC", amount: 0.6, valueUsd: undefined },
      { symbol: "USDT", amount: 100, valueUsd: 100 },
    ]);
  });

  it("tolerates a missing balances array", () => {
    expect(binanceHoldings({})).toEqual([]);
  });
});

describe("isLocalRequest", () => {
  it("accepts loopback hosts", () => {
    expect(isLocalRequest(req({ host: "localhost:37263" }))).toBe(true);
    expect(isLocalRequest(req({ host: "127.0.0.1:37263" }))).toBe(true);
  });

  it("rejects non-loopback hosts (DNS-rebinding guard)", () => {
    expect(isLocalRequest(req({ host: "evil.example.com" }))).toBe(false);
  });

  it("rejects a loopback host with a foreign Origin", () => {
    expect(
      isLocalRequest(
        req({ host: "localhost:37263", origin: "http://evil.example.com" }),
      ),
    ).toBe(false);
  });

  it("accepts a matching loopback Origin", () => {
    expect(
      isLocalRequest(
        req({ host: "localhost:37263", origin: "http://localhost:37263" }),
      ),
    ).toBe(true);
  });
});
