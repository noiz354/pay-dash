import { expect, test } from "@playwright/test";

// Dashboard home (ADR-0012): profile-derived greeting, balance strip that
// mirrors /balance, URL-driven chart range, derived bank setup step, and
// quick actions that open the intent they promise.
test.describe.configure({ mode: "serial" });

test.describe("Dashboard", () => {
  test("greets the merchant from the profile, not an invented person", async ({ page }) => {
    await page.goto("/en/dashboard");
    await expect(page.getByRole("heading", { name: "Welcome back, Acme" })).toBeVisible();
    // The prototype's hard-coded persona must be gone.
    await expect(page.getByText("Welcome back, Sarah")).toHaveCount(0);
  });

  test("the balance strip mirrors /balance exactly", async ({ page }) => {
    await page.goto("/en/dashboard");
    const strip = page.getByTestId("balance-strip-available");
    await expect(strip).toHaveText(/Rp \d/);
    const stripValue = await strip.innerText();

    // The strip is a door to the page it mirrors.
    await page.getByRole("link", { name: "View balance & history" }).click();
    await expect(page).toHaveURL(/\/en\/balance$/);
    const pageValue = await page.getByTestId("balance-available").innerText();
    expect(pageValue).toBe(stripValue);
  });

  test("the bank setup step is derived from the verified account and locked", async ({ page }) => {
    await page.goto("/en/dashboard");
    await expect(page.getByText("Connect Bank Account")).toBeVisible();
    await expect(page.getByText("Linked · **** 1234")).toBeVisible();
    // A derived step has no checkbox — the truth lives in the payout store.
    await expect(page.getByLabel("Mark Connect Bank Account as not done")).toHaveCount(0);
    // The ring counts it as done without the operator ever ticking it.
    await expect(page.getByRole("progressbar").first()).toBeVisible();
  });

  test("the analytics range lives in the URL", async ({ page }) => {
    await page.goto("/en/dashboard");
    await expect(page.getByText("Daily volume — last 7 days (IDR)")).toBeVisible();

    await page.getByRole("link", { name: "30 days" }).click();
    await expect(page).toHaveURL(/range=30d/);
    await expect(page.getByText("Daily volume — last 30 days (IDR)")).toBeVisible();

    await page.getByRole("link", { name: "90 days" }).click();
    await expect(page).toHaveURL(/range=90d/);
    await expect(page.getByText("Daily volume — last 90 days (IDR)")).toBeVisible();
  });

  test("chart series can be toggled, but the last one stays visible", async ({ page }) => {
    await page.goto("/en/dashboard");
    const failed = page.getByRole("button", { name: "Failed" });
    await failed.click();
    await expect(failed).toHaveAttribute("aria-pressed", "false");

    const total = page.getByRole("button", { name: "Volume" });
    const succeeded = page.getByRole("button", { name: "Succeeded" });
    await total.click();
    await succeeded.click();
    await total.click(); // hiding the last active series is a no-op
    await expect(total).toHaveAttribute("aria-pressed", "true");
  });

  test("quick actions open the intent they promise", async ({ page }) => {
    await page.goto("/en/dashboard");
    // Invoices are derived, not authored (ADR-0008) — the tile must not
    // promise a creation flow it cannot keep.
    await expect(page.getByRole("link", { name: "Create Invoice" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Invoices" })).toBeVisible();

    // "Add Customer" deep-links straight into the create dialog.
    await page.getByRole("link", { name: "Add Customer" }).click();
    await expect(page).toHaveURL(/\/en\/customers\?new=1/);
    await expect(page.getByRole("dialog")).toContainText("Add customer");
  });

  test("metric tiles drill into the pre-filtered ledger", async ({ page }) => {
    await page.goto("/en/dashboard");
    await page.getByRole("link", { name: /Failure Rate/ }).click();
    await expect(page).toHaveURL(/\/en\/transactions\?status=FAILED&range=7d/);
  });
});
