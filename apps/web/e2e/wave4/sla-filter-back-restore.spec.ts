import { test, expect } from "@playwright/test";
import { loginAs, waitForLoadingComplete } from "../test-utils";

// Gate 2 — the SLA filter's URL contract in a real browser: the filtered view
// is server-rendered from `?sla=`, survives a full page reload (shareability),
// and coming **back** from a detail page restores the exact filtered view —
// chip and rows — instead of resetting the operator's triage state.

test.describe("Wave 4 gate 2 — SLA filter → detail → back restores state", () => {
  test("filter → open detail → back keeps URL, chip and rows", async ({ page }) => {
    await loginAs(page, "rina", "/en/transactions?sla=OVERDUE");
    await waitForLoadingComplete(page);

    // The filtered view renders with its chip and overdue rows.
    const chip = page.getByRole("listitem").filter({ hasText: "SLA: Overdue" });
    await expect(chip).toBeVisible();
    const rows = page.locator('a[href*="/transactions/txn_"]');
    await expect(rows.first()).toBeVisible();
    await expect(page.getByTestId("sla-badge-overdue").first()).toBeVisible();

    // Walk into a detail page…
    await rows.first().click();
    await expect(page.locator("h1")).toContainText("txn_");

    // …and come back: the URL state (not the default view) is restored.
    await page.goBack();
    await waitForLoadingComplete(page);
    await expect(page).toHaveURL(/sla=OVERDUE/);
    await expect(page.getByRole("listitem").filter({ hasText: "SLA: Overdue" })).toBeVisible();
    await expect(page.locator('a[href*="/transactions/txn_"]').first()).toBeVisible();

    // A refresh (or a shared link) lands on the same slice — full round trip.
    await page.reload();
    await waitForLoadingComplete(page);
    await expect(page).toHaveURL(/sla=OVERDUE/);
    await expect(page.getByRole("listitem").filter({ hasText: "SLA: Overdue" })).toBeVisible();
  });
});
