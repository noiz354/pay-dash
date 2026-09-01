import { test, expect } from "@playwright/test";

// Routing contract for the activated proxy (src/middleware.ts -> src/proxy.ts).
// These are the pass-throughs that regressed while wiring it up, plus the
// public and API paths that must never be swallowed by the locale rewrite.

const OK_PATHS = [
  "/",
  "/api/health",
  "/en",
  "/id",
  "/dashboard",
  "/en/dashboard",
  "/id/dashboard",
  "/transactions",
  "/en/transactions",
  "/customers",
  "/en/customers",
  "/sign-in",
  "/sign-up",
];

for (const path of OK_PATHS) {
  test(`${path} resolves without an error status`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should not error`).toBeLessThan(400);
  });
}

test("an unknown path renders the in-shell 404, not the bare global error", async ({ page }) => {
  await page.goto("/definitely-not-a-page");
  await expect(page.locator("body")).toContainText(/doesn't exist|not found/i);
});

test("bare app routes render default-locale content", async ({ page }) => {
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
});

test("both locale roots land on the app, not on a chooser dead-end", async ({ page }) => {
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en\/dashboard/);
  await page.goto("/id");
  await expect(page.locator("body")).toContainText(/dashboard/i);
});
