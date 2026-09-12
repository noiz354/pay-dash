/**
 * Wave 3 E2E Tests — Mobile Flows
 * 
 * E2E-024: mobile flows
 */

import { test, expect } from "@playwright/test";
import { loginAs, waitForLoadingComplete } from "./test-utils";

// Mobile viewport
const MOBILE_VIEWPORT = { width: 390, height: 844 };

// Test suite for mobile flows (E2E-024)
test.describe("Mobile Flows", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "dinda");
  });

  test("Dashboard renders correctly on mobile", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForLoadingComplete(page);

    // Verify Needs Attention cards stack
    const cards = page.getByRole("article");
    await expect(cards.first()).toBeVisible();

    // Verify mobile navigation
    const bottomNav = page.getByRole("navigation", { name: /Bottom|Mobile/ });
    await expect(bottomNav).toBeVisible();
  });

  test("Transactions table shows cards on mobile", async ({ page }) => {
    await page.goto("/transactions");
    await waitForLoadingComplete(page);

    // Verify cards are visible
    const cards = page.getByRole("article");
    await expect(cards.first()).toBeVisible();

    // Verify table is hidden
    const table = page.getByRole("table");
    await expect(table).not.toBeVisible();
  });

  test("Payouts table shows cards on mobile", async ({ page }) => {
    await page.goto("/payouts");
    await waitForLoadingComplete(page);

    // Verify cards are visible
    const cards = page.getByRole("article");
    await expect(cards.first()).toBeVisible();
  });

  test("Search works on mobile transactions", async ({ page }) => {
    await page.goto("/transactions");
    await waitForLoadingComplete(page);

    const searchInput = page.getByPlaceholder("Search transactions");
    await searchInput.fill("test");
    await page.waitForTimeout(300);

    // Verify search applied
    const url = page.url();
    expect(url).toContain("q=test");
  });

  test("Filter works on mobile transactions", async ({ page }) => {
    await page.goto("/transactions");
    await waitForLoadingComplete(page);

    const filterButton = page.getByRole("button", { name: /Filter/ });
    await filterButton.click();
    await page.waitForTimeout(200);

    // Select a filter
    const statusOption = page.getByRole("option", { name: "SUCCEEDED" });
    await statusOption.click();
    await page.waitForTimeout(200);

    // Verify filter applied
    const url = page.url();
    expect(url).toContain("status=SUCCEEDED");
  });

  test("Customers page works on mobile", async ({ page }) => {
    await page.goto("/customers");
    await waitForLoadingComplete(page);

    // Verify page loads
    const heading = page.getByRole("heading", { name: "Customers" });
    await expect(heading).toBeVisible();

    // Verify cards or table
    const cards = page.getByRole("article");
    const table = page.getByRole("table");
    
    // Either cards or table should be visible
    const cardsVisible = await cards.count() > 0 && await cards.first().isVisible();
    const tableVisible = await table.isVisible();
    
    expect(cardsVisible || tableVisible).toBe(true);
  });

  test("Command palette opens on mobile", async ({ page }) => {
    await page.goto("/dashboard");
    await waitForLoadingComplete(page);

    // Click search button (mobile trigger)
    const searchButton = page.getByRole("button", { name: /Open command palette|Search/ });
    await searchButton.click();
    await page.waitForTimeout(200);

    // Verify palette opened
    const palette = page.getByRole("dialog", { name: /Command palette|Search/ });
    await expect(palette).toBeVisible();

    // Verify search input
    const searchInput = page.getByPlaceholder("Search for anything...");
    await expect(searchInput).toBeVisible();

    // Close palette
    await page.keyboard.press("Escape");
    await expect(palette).not.toBeVisible();
  });

  test("Blocklist page works on mobile", async ({ page }) => {
    await loginAs(page, "sari"); // Sari is RISK_ANALYST
    await page.goto("/fraud/blocklist");
    await waitForLoadingComplete(page);

    // Verify page loads
    const heading = page.getByRole("heading", { name: /Blocklist/ });
    await expect(heading).toBeVisible();
  });

  test("Webhooks page works on mobile", async ({ page }) => {
    await loginAs(page, "bima"); // Bima is DEVELOPER
    await page.goto("/webhooks");
    await waitForLoadingComplete(page);

    // Verify page loads
    const heading = page.getByRole("heading", { name: /Webhooks/ });
    await expect(heading).toBeVisible();
  });
});
