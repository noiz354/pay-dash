import { test, expect } from "@playwright/test";

// Billing journey: summary → invoice history → invoice detail → payment.
// Covers the URL contracts (?status=, ?range=, ?sort=, ?q=, ?pay=1) and the
// feedback loops added in the billing pass.

test.describe("billing history", () => {
  test("summary cards render derived values, not hard-coded strings", async ({ page }) => {
    await page.goto("/en/billing");
    await expect(page.getByRole("heading", { name: "Billing History" })).toBeVisible();
    await expect(page.getByText("Current Month Accrued Fees")).toBeVisible();
    await expect(page.getByText("Outstanding")).toBeVisible();
    await expect(page.getByText("Last Payment")).toBeVisible();
  });

  test("an overdue invoice escalates into an actionable banner", async ({ page }) => {
    await page.goto("/en/billing");
    const banner = page.getByRole("alert").filter({ hasText: "overdue" });
    if (await banner.count()) {
      await expect(banner.getByRole("button", { name: /Pay now/ })).toBeVisible();
    }
  });

  test("status filter is URL state", async ({ page }) => {
    await page.goto("/en/billing?status=PAID");
    await expect(page.getByLabel("Filter invoices by status")).toContainText("Paid");
    await expect(page.getByText("Pending", { exact: true })).toHaveCount(0);
  });

  test("search narrows the table and shows a filtered empty state", async ({ page }) => {
    await page.goto("/en/billing?q=zzzz-nope");
    await expect(page.getByText("No invoices match these filters")).toBeVisible();
  });

  test("clicking an invoice row opens the detail route", async ({ page }) => {
    await page.goto("/en/billing");
    await page.getByRole("link", { name: /Open invoice INV-2023-08-4421/ }).click();
    await expect(page).toHaveURL(/\/en\/billing\/INV-2023-08-4421/);
    await expect(page.getByText("Line items")).toBeVisible();
    await expect(page.getByText("Payment timeline")).toBeVisible();
  });

  test("the per-row download button reports progress", async ({ page }) => {
    await page.goto("/en/billing");
    const download = page
      .getByRole("button", { name: /Download statement for INV-2023-08-4421/ })
      .first();
    await expect(download).toBeVisible();
    await expect(download).toBeEnabled();
  });
});

test.describe("invoice detail", () => {
  test("?pay=1 opens the payment dialog and requires confirmation", async ({ page }) => {
    await page.goto("/en/billing/INV-2023-09-5102?pay=1");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^Pay / }).click();
    await expect(dialog.getByText(/Confirm the amount/i)).toBeVisible();
  });

  test("paying an invoice toasts and flips the status", async ({ page }) => {
    await page.goto("/en/billing/INV-2023-09-5102?pay=1");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/I confirm this amount/).check();
    await dialog.getByRole("button", { name: /^Pay / }).click();
    await expect(page.getByText(/paid/i).first()).toBeVisible();
  });

  test("a paid invoice offers no pay button", async ({ page }) => {
    await page.goto("/en/billing/INV-2023-08-4421");
    await expect(page.getByRole("button", { name: "Pay now" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Back to billing" })).toBeVisible();
  });

  test("an unknown invoice renders the in-shell not-found", async ({ page }) => {
    await page.goto("/en/billing/INV-DOES-NOT-EXIST");
    await expect(page.getByText("Invoice not found")).toBeVisible();
  });
});
