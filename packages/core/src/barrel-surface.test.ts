// @vitest-environment jsdom
//
// Pins the root @zframes/core barrel's runtime surface: it is the stable
// public API for every frame/app consumer (including the spec kernel names it
// re-exports), so a refactor must not silently drop an export. Intentional
// changes: update the snapshot (`pnpm vitest run -u`).
import { expect, it } from "vitest";

it("root @zframes/core barrel surface is pinned", async () => {
  const core = await import("@zframes/core");
  expect(Object.keys(core).sort()).toMatchSnapshot();
});
