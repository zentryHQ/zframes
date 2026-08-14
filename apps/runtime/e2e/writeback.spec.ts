import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { FIXTURE, SERVED_DASHBOARD } from "./playwright.config";

const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));

// The full editing loop the runtime exists for: enter customise mode, remove a
// card, Save — and the human-readable dashboard.json on disk is what changed.
// GridStack drags can't be synthesized, so the mutation is a card removal (a
// plain button) rather than a drag.
test("customise → remove a card → Save writes dashboard.json", async ({
  page,
}) => {
  await page.goto("/");
  // Scoped to the board grid — the palette's drag-in tiles carry the class too.
  await expect(page.locator(".grid-stack > .grid-stack-item")).toHaveCount(
    fixture.frames.length,
    { timeout: 30_000 },
  );

  await page.getByRole("button", { name: "Customize" }).click();
  // The gear/delete pills are decorated onto a card on HOVER only (they were a
  // customise-mode fps sink when always-on), so hover before looking for one.
  // The LAST card, not the first: a top-row card's delete pill can sit under
  // the sticky editor bar, which intercepts the click.
  const card = page.locator(".grid-stack > .grid-stack-item").last();
  await card.hover();
  await card.locator('button[title="Remove frame"]').click();
  await page.getByRole("button", { name: /^Save/ }).click();

  await expect
    .poll(
      () => JSON.parse(readFileSync(SERVED_DASHBOARD, "utf8")).frames.length,
      { timeout: 15_000 },
    )
    .toBe(fixture.frames.length - 1);
});
