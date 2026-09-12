import { test, expect } from "@playwright/test";
import { loginAs, waitForLoadingComplete } from "../test-utils";

// Gate 6 — the 390px journey: the ledger presents as cards with SLA badges,
// the filter sheet is reachable and writes the same URL contract as desktop,
// and the detail → back round trip restores the filtered view. One viewport,
// the whole mobile triage loop.

test.describe("Wave 4 gate 6 — mobile 390px journey", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("cards → filter sheet → chip → detail → back restores state", async ({ page }) => {
    await loginAs(page, "rina", "/en/transactions?sla=OVERDUE");
    await waitForLoadingComplete(page);

    // Cards render (not the desktop density), each row carrying its overdue badge.
    await expect(page.getByRole("listitem").filter({ hasText: "SLA: Overdue" })).toBeVisible();
    await expect(page.getByTestId("sla-badge-overdue").first()).toBeVisible();
    const details = page.getByText("View details →");
    await expect(details.first()).toBeVisible();

    // The sheet is reachable on mobile and writes the canonical param.
    await page.getByRole("button", { name: /Open filters/i }).click();
    const sheet = page.getByRole("dialog");
    await sheet.waitFor();
    await sheet.getByRole("combobox", { name: /SLA/i }).selectOption("CRITICAL");
    await page.getByRole("button", { name: "Close", exact: true }).click();

    // The chip updates without leaving the URL contract.
    await expect(page.getByRole("listitem").filter({ hasText: "SLA: Critically overdue" })).toBeVisible();
    await expect(page).toHaveURL(/sla=CRITICAL/);

    // Walk into a detail from a card…
    await page.getByText("View details →").first().click();
    await expect(page.locator("h1")).toContainText("txn_");

    // …and back: the filtered view is restored exactly.
    await page.goBack();
    await waitForLoadingComplete(page);
    await expect(page).toHaveURL(/sla=CRITICAL/);
    await expect(page.getByRole("listitem").filter({ hasText: "SLA: Critically overdue" })).toBeVisible();
    await expect(page.getByText("View details →").first()).toBeVisible();
  });
});
