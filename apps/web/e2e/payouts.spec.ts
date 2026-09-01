import { expect, test } from "@playwright/test";

// Payouts journey: index → batch detail → upload → schedule.
test.describe("Payouts", () => {
  test("the payouts index renders instead of 404-ing", async ({ page }) => {
    await page.goto("/en/payouts");
    await expect(page.getByRole("heading", { name: "Payouts", level: 1 })).toBeVisible();
    await expect(page.getByText("Batch history")).toBeVisible();
  });

  test("summary cards show parsed money, not broken literals", async ({ page }) => {
    await page.goto("/en/payouts");
    await expect(page.getByText("Pending disbursements")).toBeVisible();
    await expect(page.getByText(/^,\d/)).toHaveCount(0);
  });

  test("a summary card deep-links into a filtered list", async ({ page }) => {
    await page.goto("/en/payouts");
    await page.getByRole("link", { name: /Needs attention/ }).click();
    await expect(page).toHaveURL(/status=FAILED/);
  });

  test("filters live in the URL and can be cleared", async ({ page }) => {
    await page.goto("/en/payouts");
    await page.getByLabel("Filter batches by status").selectOption("PAID");
    await expect(page).toHaveURL(/status=PAID/);
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/en\/payouts$/);
  });

  test("a batch row routes to its detail page", async ({ page }) => {
    await page.goto("/en/payouts");
    await page.getByTestId("batch-row-BATCH-2026-08-012").click();
    await expect(page).toHaveURL(/\/en\/payouts\/BATCH-2026-08-012/);
    await expect(page.getByRole("heading", { name: /Affiliate commissions/ })).toBeVisible();
    await expect(page.getByText("Recipients")).toBeVisible();
  });

  test("failed recipients explain themselves and can be retried", async ({ page }) => {
    await page.goto("/en/payouts/BATCH-2026-08-012");
    await expect(page.getByText("Account name mismatch")).toBeVisible();
    await page.getByRole("button", { name: "Retry Rizky Pratama" }).click();
    await expect(page.getByText(/paid on retry/i)).toBeVisible();
  });

  test("releasing a batch is gated behind a confirmation", async ({ page }) => {
    await page.goto("/en/payouts/BATCH-2026-08-014?send=1");
    const release = page.getByRole("button", { name: /^Release / });
    await release.click();
    await expect(page.getByText(/Confirm the amount|Confirm before releasing/i)).toBeVisible();
    await page.getByRole("checkbox").first().click();
    await release.click();
    await expect(page.getByText(/recipients paid|paid,/i)).toBeVisible();
  });

  test("an unknown batch renders the not-found state", async ({ page }) => {
    await page.goto("/en/payouts/BATCH-NOPE");
    await expect(page.getByText("Batch not found")).toBeVisible();
    await page.getByRole("link", { name: "Back to payouts" }).click();
    await expect(page).toHaveURL(/\/en\/payouts$/);
  });

  test("the bulk page parses pasted recipients and previews them", async ({ page }) => {
    await page.goto("/en/payouts/bulk");
    await page.getByLabel("…or paste rows directly").fill(
      "Budi,BCA,12345678,250000\nBroken,BCA,12,100"
    );
    await expect(page.getByText("1 valid")).toBeVisible();
    await expect(page.getByText("1 invalid")).toBeVisible();
    await page.getByRole("button", { name: "Rejected" }).click();
    await expect(page.getByText(/not an 8–20 digit account number/)).toBeVisible();
  });

  test("creating a batch requires a name and routes to the new batch", async ({ page }) => {
    await page.goto("/en/payouts/bulk");
    await page.getByLabel("…or paste rows directly").fill("Budi,BCA,12345678,250000");
    await page.getByRole("button", { name: /Create batch/ }).click();
    await expect(page.getByText("Give the batch a recognisable name")).toBeVisible();
    await page.getByLabel("Batch name").fill("Playwright batch");
    await page.getByRole("button", { name: /Create batch/ }).click();
    await expect(page).toHaveURL(/\/en\/payouts\/BATCH-/);
  });

  test("the create dialog opens from ?new=1", async ({ page }) => {
    await page.goto("/en/payouts?new=1");
    await expect(page.getByRole("dialog")).toContainText("New payout batch");
  });

  test("payout settings save is disabled until the form is dirty", async ({ page }) => {
    await page.goto("/en/payouts/settings");
    const save = page.getByRole("button", { name: "Save Changes" });
    await expect(save).toBeDisabled();
    await page.getByRole("radio", { name: "Monthly" }).click();
    await expect(save).toBeEnabled();
    await expect(page.getByLabel("Day of the month")).toBeVisible();
    await save.click();
    await expect(page.getByText("Payout schedule saved.")).toBeVisible();
  });

  test("an unverified account cannot be chosen as the destination", async ({ page }) => {
    await page.goto("/en/payouts/settings");
    await page.getByRole("button", { name: "Change" }).click();
    await expect(page.getByLabel(/Bank Negara Indonesia/)).toBeDisabled();
  });

  test("the breadcrumb links back to the payouts index", async ({ page }) => {
    await page.goto("/en/payouts/bulk");
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Payouts" }).click();
    await expect(page).toHaveURL(/\/en\/payouts$/);
  });
});
