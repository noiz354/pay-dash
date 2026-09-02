import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Reports builder journey (ADR-0020): the preview serves the app's real
// rows (46 ledger rows, 5 batches, 11 customers — deterministic seed), every
// control runs a real query, and Export CSV downloads exactly what the
// preview shows. The prototype's invented rows, its 1,248-row claim, its
// USD amounts and its handler-less buttons must be gone.
test.describe.configure({ mode: "serial" });

test.describe("Reports builder", () => {
  test("serves the real ledger, not the invented preview", async ({ page }) => {
    await page.goto("/en/reports/builder");
    await expect(page.getByRole("heading", { name: /Custom Reports/ })).toBeVisible();

    // The prototype's invented artifacts are gone.
    await expect(page.getByText("1,248")).toHaveCount(0);
    await expect(page.getByText("txn_1Nj8V2")).toHaveCount(0);
    await expect(page.getByText("Amount (USD)")).toHaveCount(0);
    await expect(page.getByText("sarah.jenkins@example.com")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Schedule" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Apply" })).toHaveCount(0);

    // The real count and real IDR money.
    await expect(page.getByText("46 of 46 rows")).toBeVisible();
    await expect(page.locator("td", { hasText: "Rp " }).first()).toBeVisible();

    // Real ids, linked to the real detail pages.
    const firstId = page.getByRole("link", { name: /^txn_/ }).first();
    await expect(firstId).toBeVisible();
    expect(await firstId.getAttribute("href")).toMatch(/^\/en\/transactions\//);
  });

  test("switching the data source re-queries", async ({ page }) => {
    await page.goto("/en/reports/builder");
    await expect(page.getByText("Transaction ID").first()).toBeVisible();

    await page.getByLabel("Customers").check();
    await expect(page.getByText("Lifetime Value")).toBeVisible();
    await expect(page.getByText("46 of 46 rows")).toHaveCount(0);
    await expect(page.getByText("11 of 11 rows")).toBeVisible();

    await page.getByLabel("Payouts").check();
    await expect(page.getByText("5 of 5 rows")).toBeVisible();
    await expect(page.getByText("BATCH-").first()).toBeVisible();
  });

  test("filters narrow the preview live", async ({ page }) => {
    await page.goto("/en/reports/builder");
    await expect(page.getByText("46 of 46 rows")).toBeVisible();

    // The status filter select shares its name with a column checkbox —
    // address it by id.
    await page.locator("#report-status").selectOption("REFUNDED");
    await expect(page.getByText("2 of 46 rows")).toBeVisible();

    await page.locator("#report-status").selectOption("");
    await page.getByLabel("Start date").fill("2026-09-01");
    await expect(page.getByText("2 of 46 rows")).not.toBeVisible();
    await expect(page.getByText(" of 46 rows").first()).toBeVisible();

    // The 7D preset fills both date inputs.
    await page.getByRole("button", { name: "7D" }).click();
    await expect(page.getByLabel("Start date")).not.toHaveValue("");
    await expect(page.getByLabel("End date")).not.toHaveValue("");

    // Reset restores the full set.
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByText("46 of 46 rows")).toBeVisible();
  });

  test("column checkboxes drive the preview", async ({ page }) => {
    await page.goto("/en/reports/builder");
    const emailHeader = page.getByRole("columnheader", { name: "Customer Email" });
    await expect(emailHeader).toBeVisible();

    await page.getByLabel("Customer Email", { exact: true }).uncheck();
    await expect(emailHeader).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Transaction ID" })).toBeVisible();

    await page.getByLabel("Customer Email", { exact: true }).check();
    await expect(emailHeader).toBeVisible();
  });

  test("export csv downloads exactly the filtered rows", async ({ page }) => {
    await page.goto("/en/reports/builder");
    await page.locator("#report-status").selectOption("REFUNDED");
    await expect(page.getByText("2 of 46 rows")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^kinetic-transactions-\d{4}-\d{2}-\d{2}\.csv$/);

    const content = readFileSync(await download.path(), "utf8").trim();
    const [header, ...body] = content.split("\n");
    // Default selected columns for transactions.
    expect(header).toBe(
      "reference_id,created_at,amount,status,customer_email"
    );
    expect(body).toHaveLength(2);
    for (const line of body) {
      expect(line.split(",").length).toBe(5);
      expect(line.startsWith("txn_")).toBe(true);
    }
  });

  test("zero matches show the empty state and disable export", async ({ page }) => {
    await page.goto("/en/reports/builder");
    await page.getByLabel(/Amount min/).fill("999999999999");
    await expect(page.getByText("No rows match these filters")).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeDisabled();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByText("46 of 46 rows")).toBeVisible();
  });
});
