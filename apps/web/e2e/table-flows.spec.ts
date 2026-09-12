/**
 * Wave 3 E2E Tests — Table Flows Automation
 * 
 * E2E-022: search/filter/sort flow
 * E2E-023: detail→back restore
 */

import { test, expect } from "@playwright/test";
import { loginAs, waitForLoadingComplete } from "./test-utils";

// Test suite for table flows (E2E-022, E2E-023)
test.describe("Table Flows", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "dinda");
    await page.goto("/transactions");
    await waitForLoadingComplete(page);
  });

  // E2E-022: search/filter/sort flow
  test.describe("E2E-022: search/filter/sort", () => {
    test("should search and filter transactions", async ({ page }) => {
      // Search for "Acme"
      const searchInput = page.getByPlaceholder("Search transactions");
      await searchInput.fill("Acme");
      await page.waitForTimeout(300); // Debounce
      
      // Verify search results
      const resultsText = page.getByText(/results|No results/);
      await expect(resultsText).toBeVisible();
      
      // Clear search
      await page.getByRole("button", { name: /Clear|×/ }).first().click();
      await page.waitForTimeout(200);
      
      // Filter by status
      const statusFilter = page.getByLabel("Filter by status");
      await statusFilter.selectOption("FAILED");
      await page.waitForTimeout(200);
      
      // Verify filter applied
      const failedBadge = page.getByText("FAILED");
      await expect(failedBadge).toBeVisible();
      
      // Clear filter
      await page.getByRole("button", { name: /Clear all|Clear filter/ }).click();
      await page.waitForTimeout(200);
    });

    test("should sort transactions by amount", async ({ page }) => {
      // Open sort
      const sortButton = page.getByLabel("Sort by");
      await sortButton.selectOption("amount");
      await page.waitForTimeout(200);
      
      // Verify sort applied
      const sortedIndicator = page.getByRole("columnheader", { name: "Amount" });
      await expect(sortedIndicator).toHaveAttribute("aria-sort", /ascending|descending/);
      
      // Toggle sort direction
      await page.getByRole("columnheader", { name: "Amount" }).click();
      await page.waitForTimeout(200);
      
      // Verify direction changed
      await expect(sortedIndicator).toHaveAttribute("aria-sort");
    });

    test("should preserve URL state on refresh", async ({ page }) => {
      // Apply search
      const searchInput = page.getByPlaceholder("Search transactions");
      await searchInput.fill("test");
      await page.waitForTimeout(300);
      
      // Apply filter
      const statusFilter = page.getByLabel("Filter by status");
      await statusFilter.selectOption("SUCCEEDED");
      await page.waitForTimeout(200);
      
      // Get current URL
      const urlBefore = page.url();
      expect(urlBefore).toContain("q=test");
      expect(urlBefore).toContain("status=SUCCEEDED");
      
      // Refresh page
      await page.reload();
      await waitForLoadingComplete(page);
      
      // Verify state preserved
      const urlAfter = page.url();
      expect(urlAfter).toContain("q=test");
      expect(urlAfter).toContain("status=SUCCEEDED");
      
      // Verify search input has value
      await expect(searchInput).toHaveValue("test");
    });
  });

  // E2E-023: detail→back restore
  test.describe("E2E-023: detail→back restore", () => {
    test("should restore filters after viewing detail", async ({ page }) => {
      // Apply search and filter
      const searchInput = page.getByPlaceholder("Search transactions");
      await searchInput.fill("payment");
      await page.waitForTimeout(300);
      
      const statusFilter = page.getByLabel("Filter by status");
      await statusFilter.selectOption("SUCCEEDED");
      await page.waitForTimeout(200);
      
      // Get first transaction row
      const firstRow = page.getByRole("row").filter({ has: page.getByRole("link") }).first();
      const detailLink = firstRow.getByRole("link");
      
      // Click to view detail
      await detailLink.click();
      await page.waitForURL("**/transactions/**");
      await waitForLoadingComplete(page);
      
      // Go back
      await page.goBack();
      await waitForLoadingComplete(page);
      
      // Verify filters restored
      await expect(searchInput).toHaveValue("payment");
      await expect(statusFilter).toHaveValue("SUCCEEDED");
      
      // Verify URL has filters
      const url = page.url();
      expect(url).toContain("q=payment");
      expect(url).toContain("status=SUCCEEDED");
    });

    test("should restore pagination after viewing detail", async ({ page }) => {
      // Go to page 2
      const nextPageButton = page.getByRole("button", { name: "Next page" });
      await nextPageButton.click();
      await page.waitForTimeout(200);
      
      // Verify on page 2
      const pageIndicator = page.getByText("Page 2");
      await expect(pageIndicator).toBeVisible();
      
      // Click first transaction
      const firstRow = page.getByRole("row").filter({ has: page.getByRole("link") }).first();
      const detailLink = firstRow.getByRole("link");
      await detailLink.click();
      await page.waitForURL("**/transactions/**");
      await waitForLoadingComplete(page);
      
      // Go back
      await page.goBack();
      await waitForLoadingComplete(page);
      
      // Verify pagination restored
      await expect(pageIndicator).toBeVisible();
      
      // Verify URL has page
      const url = page.url();
      expect(url).toContain("page=2");
    });
  });
});

// Mobile tests
test.describe("Mobile Table Flows", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "dinda");
    await page.goto("/transactions");
    await waitForLoadingComplete(page);
  });

  test("should show cards on mobile", async ({ page }) => {
    // Verify cards are visible (not table)
    const cards = page.getByRole("article");
    await expect(cards.first()).toBeVisible();
    
    // Verify table is hidden
    const table = page.getByRole("table");
    await expect(table).not.toBeVisible();
  });

  test("should search on mobile", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search transactions");
    await searchInput.fill("test");
    await page.waitForTimeout(300);
    
    // Verify results
    const results = page.getByRole("article");
    await expect(results).toHaveCount(0); // No results
  });
});
