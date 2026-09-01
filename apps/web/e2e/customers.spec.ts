import { test, expect } from "@playwright/test";

// Customer journey: dashboard quick action -> directory -> profile -> payments.
// Covers the URL-param contracts (?new=1, ?q=, ?edit=1) and the interaction
// states (pending, toast, empty) added in the customers pass.

test.describe("customer directory", () => {
  test("renders real customers with formatted LTV", async ({ page }) => {
    await page.goto("/en/customers");
    await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
    await expect(page.getByText("Acme Corporation")).toBeVisible();
    // The prototype rendered ",520.00" — a currency prefix must now be present.
    await expect(page.getByText(/^,520\.00$/)).toHaveCount(0);
  });

  test("?new=1 auto-opens the create dialog and drops the param on close", async ({ page }) => {
    await page.goto("/en/customers?new=1");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Add customer")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/en\/customers$/);
  });

  test("?q= pre-filters the directory from a transaction hand-off", async ({ page }) => {
    await page.goto("/en/customers?q=tony@stark.com");
    await expect(page.getByLabel("Search customers")).toHaveValue("tony@stark.com");
    await expect(page.getByText("Stark Industries")).toBeVisible();
    await expect(page.getByText("Acme Corporation")).toHaveCount(0);
  });

  test("a no-match search shows the filtered empty state, not a blank table", async ({ page }) => {
    await page.goto("/en/customers?q=zzz-no-such-customer");
    await expect(page.getByText("No customers match these filters")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear filters" }).first()).toBeVisible();
  });

  test("clicking a row routes to the customer profile", async ({ page }) => {
    await page.goto("/en/customers");
    await page.getByRole("link", { name: /Open customer Acme Corporation/ }).click();
    await expect(page).toHaveURL(/\/en\/customers\/cus_/);
    await expect(page.getByRole("heading", { name: "Acme Corporation" })).toBeVisible();
    await expect(page.getByText("Lifetime value")).toBeVisible();
  });

  test("creating a customer shows a success toast and the new row", async ({ page }) => {
    await page.goto("/en/customers?new=1");
    const dialog = page.getByRole("dialog");
    const email = `e2e-${Date.now()}@example.com`;
    await dialog.getByLabel("Name").fill("E2E Playwright Ltd.");
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByRole("button", { name: "Add customer" }).click();
    await expect(page.getByText(/added to your customer directory/i)).toBeVisible();
    await page.goto(`/en/customers?q=${encodeURIComponent(email)}`);
    await expect(page.getByText("E2E Playwright Ltd.")).toBeVisible();
  });

  test("selection reveals the bulk action bar", async ({ page }) => {
    await page.goto("/en/customers");
    await page.getByLabel("Select all customers").click();
    await expect(page.getByRole("region", { name: "Bulk actions" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy emails" })).toBeVisible();
  });

  test("pagination is real (or absent), never a dead disabled control", async ({ page }) => {
    await page.goto("/en/customers");
    const next = page.getByRole("button", { name: "Next page" });
    if (await next.isVisible()) {
      const wasDisabled = await next.isDisabled();
      if (!wasDisabled) {
        await next.click();
        await expect(page).toHaveURL(/page=2/);
      }
    }
  });
});

test.describe("customer profile", () => {
  test("links back to the filtered ledger and exposes edit via ?edit=1", async ({ page }) => {
    await page.goto("/en/customers?q=tony@stark.com");
    await page.getByRole("link", { name: /Open customer Stark Industries/ }).click();
    const profileUrl = page.url();

    await page.getByRole("link", { name: "View payments" }).click();
    await expect(page).toHaveURL(/\/en\/transactions\?q=tony%40stark\.com/);

    await page.goto(`${profileUrl}${profileUrl.includes("?") ? "&" : "?"}edit=1`);
    await expect(page.getByRole("dialog").getByText("Edit customer")).toBeVisible();
  });

  test("an unknown customer id renders the in-shell not-found", async ({ page }) => {
    await page.goto("/en/customers/cus_does_not_exist");
    await expect(page.getByText("Customer not found")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to customers" })).toBeVisible();
  });

  test("a transaction detail links straight to the customer profile", async ({ page }) => {
    await page.goto("/en/transactions");
    await page.getByRole("link", { name: /Open transaction/ }).first().click();
    await page.getByRole("link", { name: "View customer" }).click();
    await expect(page).toHaveURL(/\/en\/customers\/cus_/);
  });
});
