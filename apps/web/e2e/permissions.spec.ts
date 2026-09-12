/**
 * Wave 3 E2E Tests — Permission Denial
 * 
 * E2E-011: permission denial
 */

import { test, expect } from "@playwright/test";
import { loginAs, waitForLoadingComplete } from "./test-utils";

// Test suite for permission denial (E2E-011)
test.describe("Permission Denial", () => {
  // E2E-011: Payout approve forbidden for FINANCE_OPERATOR
  test("FINANCE_OPERATOR cannot approve payouts", async ({ page }) => {
    await loginAs(page, "dinda"); // Dinda is FINANCE_OPERATOR
    await page.goto("/payouts");
    await waitForLoadingComplete(page);

    // Create a test payout batch (if none exists)
    const createButton = page.getByRole("button", { name: /Create|New/ });
    if (await createButton.count() > 0) {
      await createButton.first().click();
      await page.waitForTimeout(500);
    }

    // Try to find a PENDING batch
    const pendingBadge = page.getByText("PENDING");
    if (await pendingBadge.count() > 0) {
      // Click on the batch
      await page.getByRole("link").first().click();
      await page.waitForURL("**/payouts/**");
      await waitForLoadingComplete(page);

      // Try to approve (should be disabled or 403)
      const approveButton = page.getByRole("button", { name: /Approve/ });
      
      // Either disabled or click results in error
      if (await approveButton.isDisabled()) {
        // Button is disabled (UI enforcement)
        await expect(approveButton).toBeDisabled();
      } else {
        // Click and expect error
        await approveButton.click();
        await page.waitForTimeout(500);
        
        // Check for error toast or message
        const errorToast = page.getByText(/403|Forbidden|Permission denied/);
        await expect(errorToast).toBeVisible();
      }
    }
  });

  // Test that OWNER can approve
  test("OWNER can approve payouts", async ({ page }) => {
    await loginAs(page, "rina"); // Rina is OWNER
    await page.goto("/payouts");
    await waitForLoadingComplete(page);

    // Create a test payout batch
    const createButton = page.getByRole("button", { name: /Create|New/ });
    if (await createButton.count() > 0) {
      await createButton.first().click();
      await page.waitForTimeout(500);
    }

    // Try to find a PENDING batch
    const pendingBadge = page.getByText("PENDING");
    if (await pendingBadge.count() > 0) {
      // Click on the batch
      await page.getByRole("link").first().click();
      await page.waitForURL("**/payouts/**");
      await waitForLoadingComplete(page);

      // Approve button should be enabled
      const approveButton = page.getByRole("button", { name: /Approve/ });
      await expect(approveButton).not.toBeDisabled();
    }
  });

  // Test audit export permission
  test("SUPPORT cannot export audit log", async ({ page }) => {
    await loginAs(page, "agus"); // Agus is SUPPORT
    await page.goto("/audit");
    await waitForLoadingComplete(page);

    // Try to export
    const exportButton = page.getByRole("button", { name: /Export/ });
    if (await exportButton.count() > 0) {
      await exportButton.click();
      await page.waitForTimeout(500);

      // Should get 403
      const errorToast = page.getByText(/403|Forbidden|Permission denied/);
      await expect(errorToast).toBeVisible();
    }
  });

  // Test that OWNER can export audit
  test("OWNER can export audit log", async ({ page }) => {
    await loginAs(page, "rina"); // Rina is OWNER
    await page.goto("/audit");
    await waitForLoadingComplete(page);

    // Export button should be visible and clickable
    const exportButton = page.getByRole("button", { name: /Export/ });
    await expect(exportButton).toBeVisible();
    
    // Click should work (may trigger download or success)
    await exportButton.click();
    await page.waitForTimeout(500);
    
    // Should not show error
    const errorToast = page.getByText(/403|Forbidden/);
    await expect(errorToast).not.toBeVisible();
  });
});
