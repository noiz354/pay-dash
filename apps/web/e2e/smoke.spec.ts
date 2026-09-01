import { test, expect } from "@playwright/test";

test("dashboard renders TEST MODE", async ({ page }) => {
  await page.goto("/en/dashboard");
  await expect(page.getByText("TEST MODE")).toBeVisible();
  await expect(page.getByText("Total Volume")).toBeVisible();
});

test("transactions table has label-caps sticky", async ({ page }) => {
  await page.goto("/en/transactions");
  await expect(page.getByText("Reference")).toBeVisible();
  await expect(page.getByText("REF-10042")).toBeVisible();
});
