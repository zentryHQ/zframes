/**
 * Pins the keyless plugin manifest's credits equal to the frame catalogue's
 * `SOURCES` record.
 *
 * Two lists describe the same fact while the migration is in flight. `SOURCES`
 * (`packages/frames/src/schemas/shared.ts`) is what 245 frame-meta declarations
 * reference today and what the card chrome credits from; the manifest's
 * `sources` is what a per-installation catalogue will read once adapters are
 * operator-installed. Either can be edited alone, and both directions fail
 * quietly. A credit added to `SOURCES` but not the manifest is an upstream that
 * vanishes from the AI catalogue the moment the fleet is unbundled. A credit
 * whose `id` drifts between the two repoints the chrome onto the wrong provider,
 * or onto none, and a card that credits the wrong source is worse than a card
 * that credits nothing.
 *
 * The ids are also the reason this cannot be eyeballed: `SOURCES` keys are
 * camelCase for readable property access in frame metas, while a manifest id is
 * dashed and lowercase because it lands in `dashboard.json`. `withSourceIds`
 * derives one from the other; this test is what proves the derivation still
 * lines the two lists up.
 *
 * It lives in repo-level `tests/` because it must import both sides at once:
 * ESLint's layer DAG forbids `@zframes/frames` from inside `providers-keyless`
 * (a React-free data leaf must never pull in presentation code), so relative
 * imports from here are the only place the two can meet. Same reason as
 * `keyless-proxy-hosts.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { KEYLESS_MANIFEST } from "../packages/providers-keyless/src/manifest";
import { sourceCreditsOf } from "../packages/spec/src/provider-plugin";
import { SOURCES } from "../packages/frames/src/schemas/shared";

const manifestCredits = sourceCreditsOf([KEYLESS_MANIFEST]);
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

describe("keyless manifest ↔ frame catalogue credits", () => {
  it("covers exactly the same source ids", () => {
    expect(manifestCredits.map((credit) => credit.id).sort()).toEqual(
      Object.values(SOURCES)
        .map((source) => source.id)
        .sort(),
    );
  });

  // Name and url are what the chrome renders, so a divergence here is a
  // user-visible mislabel rather than a routing bug.
  it("agrees on every credit's display name and url", () => {
    const manifest = [...manifestCredits]
      .sort(byId)
      .map(({ id, name, url }) => ({
        id,
        name,
        url,
      }));
    const catalogue = Object.values(SOURCES)
      .map(({ id, name, url }) => ({ id, name, url }))
      .sort(byId);
    expect(manifest).toEqual(catalogue);
  });
});
