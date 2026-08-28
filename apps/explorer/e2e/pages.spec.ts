import { expect, test } from "@playwright/test";
import { SEEDED_BOARD } from "./seeded";

test("landing renders its hero and site chrome", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("header")).toBeVisible();
});

test("boards page lists the seeded curated boards", async ({ page }) => {
  await page.goto("/boards");
  await expect(
    page.locator(`a[href*="/dashboard/${SEEDED_BOARD}"]`).first(),
  ).toBeVisible();
});

test("frames page serves its heading server-side", async ({ page }) => {
  await page.goto("/frames");
  await expect(page.locator("h1")).toBeVisible();
});

test("llms.txt derives frames and the seeded boards", async ({ request }) => {
  const res = await request.get("/llms.txt");
  expect(res.ok()).toBe(true);
  const text = await res.text();
  expect(text).toContain(SEEDED_BOARD);
});
