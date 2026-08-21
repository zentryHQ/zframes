// The `id` on a source credit is the one string that crosses every boundary in
// this repo: the card chrome matches it to decide which provider to credit, a
// generating agent writes it into `dashboard.json` as a card's `source`, and the
// provider-plugin manifests that will replace this record pin it to a dashed,
// lowercase shape. So the shape is an invariant, not a style preference: a
// credit whose id the manifest contract would reject is a credit that cannot
// survive the move to installed adapters.
import { describe, expect, it } from "vitest";
import { SOURCES, sourceField } from "./shared";

/** The manifest contract's rule (see spec's provider-plugin CreditSchema). */
const MANIFEST_ID = /^[a-z0-9][a-z0-9-]*$/;

describe("SOURCES ids", () => {
  it("every id is a shape the plugin manifest contract accepts", () => {
    const bad = Object.values(SOURCES)
      .map((source) => source.id)
      .filter((id) => !MANIFEST_ID.test(id));
    expect(bad).toEqual([]);
  });

  it("derives the dashed form from a camelCase key", () => {
    expect(SOURCES.nyFed.id).toBe("ny-fed");
    expect(SOURCES.secEdgar.id).toBe("sec-edgar");
    expect(SOURCES.alternativeMe.id).toBe("alternative-me");
  });

  it("leaves a single-word key untouched", () => {
    expect(SOURCES.treasury.id).toBe("treasury");
    expect(SOURCES.fred.id).toBe("fred");
  });

  it("has no duplicate ids, since the chrome matches on one", () => {
    const ids = Object.values(SOURCES).map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The venues a card can PIN are the only ids already written into user
  // dashboards, so their derivation must be the identity. If a fourth venue
  // joins the enum, this fails until it has a credit whose id matches it: the
  // chrome would otherwise credit the first-declared source instead of the
  // pinned one.
  it("keeps every pinnable venue id identical to its enum value", () => {
    const pinnable = sourceField().unwrap().options as readonly string[];
    const ids = Object.values(SOURCES).map((source) => source.id);
    for (const venue of pinnable) {
      expect(ids).toContain(venue);
    }
  });
});
