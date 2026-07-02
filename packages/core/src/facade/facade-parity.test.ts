// @vitest-environment jsdom
//
// Pins the back-compat facade: every @zframes/core/<subpath> shim must
// re-export EXACTLY the runtime surface of the leaf module it wraps. The shims
// are `export *`, which pins nothing by itself — a leaf could drop or rename a
// symbol no in-repo consumer imports and everything would stay green. This
// test is the safety net the repoint pass (facade deletion) stands on.
//
// jsdom env: the editor pair imports GridStack; the Node-only pairs (serve,
// store, vite, agent, account) still see node builtins under jsdom.
import { describe, expect, it } from "vitest";

const PAIRS: Array<[facade: string, leaf: string]> = [
  ["@zframes/core/frame", "@zframes/spec/frame"],
  ["@zframes/core/spec", "@zframes/spec/spec"],
  ["@zframes/core/catalogue", "@zframes/spec/catalogue"],
  ["@zframes/core/routes", "@zframes/spec/routes"],
  ["@zframes/core/fetch", "@zframes/data-primitives/fetch"],
  ["@zframes/core/cache", "@zframes/data-primitives/cache"],
  ["@zframes/core/editor", "@zframes/editor/editor"],
  ["@zframes/core/editor-symbols", "@zframes/editor/editor-symbols"],
  ["@zframes/core/vite", "@zframes/vite/vite"],
  ["@zframes/core/serve", "@zframes/serve/serve"],
  ["@zframes/core/store", "@zframes/store/store"],
  ["@zframes/core/agent", "@zframes/zai/agent"],
  ["@zframes/core/account", "@zframes/account/account"],
];

describe("back-compat facade parity", () => {
  it.each(PAIRS)("%s re-exports exactly %s", async (facade, leaf) => {
    const [facadeMod, leafMod] = await Promise.all([
      import(facade),
      import(leaf),
    ]);
    expect(Object.keys(facadeMod).sort()).toEqual(Object.keys(leafMod).sort());
  });

  // The root barrel is not a shim, but its runtime surface is public API for
  // every consumer — pin it so a refactor can't silently drop an export.
  // Intentional changes: update the snapshot (`pnpm vitest run -u`).
  it("root @zframes/core barrel surface is pinned", async () => {
    const core = await import("@zframes/core");
    expect(Object.keys(core).sort()).toMatchSnapshot();
  });
});
