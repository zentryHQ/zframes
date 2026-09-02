import { describe, expect, it } from "vitest";
import { assembleDigest, SYNTHETIC_DIGEST_NOTE } from "./screen-context";

// The digest is what grounds every zAI answer, so the demo-data disclosure
// (B-47) is asserted here rather than left to the header badge the agent can't
// see. The rest of the digest — provider calls, per-capability blocks — is
// exercised through the orb; what matters at this seam is that a simulated
// board is never described in the language of a live one.

const structure = ['- price-chart "BTC" [BTC]', "- fear-greed"];
const readings = [
  "Prices: BTC $60,000.00 (+1.2%)",
  "Fear & Greed: 55 (Neutral)",
];

describe("assembleDigest", () => {
  it("labels a live board's readings as live and adds no marker", () => {
    const digest = assembleDigest(structure, readings);
    expect(digest).toContain("Frames on the dashboard:");
    expect(digest).toContain("Live readings right now:");
    expect(digest).not.toContain(SYNTHETIC_DIGEST_NOTE);
    expect(digest).not.toMatch(/simulated/i);
  });

  it("marks a demo board as simulated, at the top and on the readings heading", () => {
    const digest = assembleDigest(structure, readings, true);
    // Top of the digest: truncation eats the tail, so the disclosure leads.
    expect(digest?.startsWith(SYNTHETIC_DIGEST_NOTE)).toBe(true);
    expect(digest).toContain("SIMULATED demo data");
    expect(digest).toContain(
      "Simulated readings right now (demo data, NOT live market values):",
    );
    // The live wording must be gone entirely — two headings for one board is
    // exactly how a fabricated number gets read as real.
    expect(digest).not.toContain("Live readings right now");
    // Still carries the numbers, just honestly labelled.
    expect(digest).toContain("Prices: BTC $60,000.00 (+1.2%)");
  });

  it("keeps the marker when there are frames but no readings yet", () => {
    const digest = assembleDigest(structure, [], true);
    expect(digest?.startsWith(SYNTHETIC_DIGEST_NOTE)).toBe(true);
    expect(digest).toContain("Frames on the dashboard:");
  });

  it("returns null with nothing to describe, marker or not", () => {
    expect(assembleDigest([], [])).toBeNull();
    expect(assembleDigest([], [], true)).toBeNull();
  });

  it("truncates a huge digest but keeps the disclosure at the front", () => {
    const fat = Array.from(
      { length: 4000 },
      (_, i) => `- frame-${i} [SYM${i}]`,
    );
    const digest = assembleDigest(fat, readings, true);
    expect(digest?.length).toBeLessThanOrEqual(10_000);
    expect(digest?.startsWith(SYNTHETIC_DIGEST_NOTE)).toBe(true);
  });
});
