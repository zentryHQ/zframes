import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { FIXTURE } from "./playwright.config";

const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));

test("serves the spec on the read route", async ({ request }) => {
  const res = await request.get("/__zframes/dashboard.json");
  expect(res.ok()).toBe(true);
  const spec = await res.json();
  expect(spec.title).toBe(fixture.title);
  expect(spec.frames).toHaveLength(fixture.frames.length);
});

test("renders every fixture frame as a card, none as an error card", async ({
  page,
}) => {
  await page.goto("/");
  // Wait on the DOM, never networkidle — the runtime holds a persistent
  // Hyperliquid WebSocket, so networkidle never settles. Scoped to the board
  // grid: the palette's drag-in tiles carry .grid-stack-item too.
  await expect(page.locator(".grid-stack > .grid-stack-item")).toHaveCount(
    fixture.frames.length,
    { timeout: 30_000 },
  );
  await expect(page.locator(".zf-frame--error")).toHaveCount(0);
  // The heading frame's configured text made it to the screen.
  await expect(page.getByText("Playwright fixture board")).toBeVisible();
});
