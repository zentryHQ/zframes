import { expect, test } from "@playwright/test";
import { SEEDED_BOARD } from "./seeded";

// Demo data renders by default (MockMarketDataProvider), so these pass with no
// upstream market API in the loop — the same posture the site ships with.

test("a curated board renders its frames, none as error cards", async ({
  page,
}) => {
  await page.goto(`/dashboard/${SEEDED_BOARD}`);
  // Cards are .zf-frame; containers render .zf-group instead, so assert a
  // healthy floor rather than an exact count.
  await expect
    .poll(() => page.locator(".zf-frame, .zf-group").count(), {
      timeout: 60_000,
    })
    .toBeGreaterThan(10);
  await expect(page.locator(".zf-frame--error")).toHaveCount(0);
});

test("the embed route renders bare with its demo-data badge", async ({
  page,
}) => {
  await page.goto(`/embed/${SEEDED_BOARD}`);
  await expect
    .poll(() => page.locator(".zf-frame, .zf-group").count(), {
      timeout: 60_000,
    })
    .toBeGreaterThan(10);
  // Third-party iframes can't read the live opt-in flag, so the badge is the
  // honesty label — it must be there.
  await expect(page.getByText("Demo data").first()).toBeVisible();
});
