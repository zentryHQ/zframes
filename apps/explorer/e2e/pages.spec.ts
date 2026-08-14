import { expect, test } from "@playwright/test";
import { SEEDED_BOARD } from "./seeded";

test("landing renders with the demo-data pill", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  // The site-wide demo-data label (AppShell) — the mock-only posture made visible.
  await expect(page.getByText("Demo data").first()).toBeVisible();
});

test("gallery lists the seeded curated boards", async ({ page }) => {
  await page.goto("/gallery");
  await expect(
    page.locator(`a[href*="/dashboard/${SEEDED_BOARD}"]`).first(),
  ).toBeVisible();
});

test("catalogue serves its heading server-side", async ({ page }) => {
  await page.goto("/catalogue");
  await expect(page.locator("h1")).toBeVisible();
});

test("llms.txt derives frames and the seeded boards", async ({ request }) => {
  const res = await request.get("/llms.txt");
  expect(res.ok()).toBe(true);
  const text = await res.text();
  expect(text).toContain(SEEDED_BOARD);
});
