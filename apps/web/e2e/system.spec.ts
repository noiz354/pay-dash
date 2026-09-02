import { expect, test } from "@playwright/test";

// System status (ADR-0017): the page states only what the app measures —
// inbound webhook flow from the callback log. The prototype's invented
// layer (99.99% uptime, 42ms latency, DB capacity, a 142-deep queue, the
// "delivery traffic" chart, the merchant-URL delivery table, the no-op
// Monitoring Settings panel) must be gone, and every link must be real.
test.describe("System status", () => {
  test("the invented metrics, queue and delivery fiction are gone", async ({ page }) => {
    await page.goto("/en/system");
    await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();

    for (const gone of [
      "99.99%",
      "42ms",
      "Core API Uptime",
      "Ledger DB Status",
      "Webhook Queue Depth",
      "Webhook Delivery Traffic",
      "Recent Webhook Deliveries",
      "api.merchant.com",
      "hooks.erp-system.net",
      "hooks.legacy-app.io",
      "All Systems Operational",
      "Monitoring Settings",
      "Save Settings",
      "Test Alert",
      "Go to Developer Portal",
      "View Full Webhook Log",
    ]) {
      await expect(page.getByText(gone, { exact: false })).toHaveCount(0);
    }
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
  });

  test("the last-24h cards show real counts from the log", async ({ page }) => {
    await page.goto("/en/system");
    // Seeds are now-relative: Received 1 (2h), Duplicated 1 (1h59m),
    // Rejected 0 in the window.
    const cards = page.locator("main").getByText("in the last 24h");
    await expect(cards).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "Received" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Duplicated" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rejected" })).toBeVisible();

    // The header chip states when the newest callback arrived.
    await expect(page.getByText("Last callback 2h ago")).toBeVisible();
  });

  test("recent callbacks route into the log's detail pages", async ({ page }) => {
    await page.goto("/en/system");
    const first = page.getByTestId("system-recent-whk_seed_2");
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/\/en\/webhooks\/whk_seed_2/);
    await expect(page.getByText("This callback was a duplicate")).toBeVisible();
  });

  test("every link on the page goes somewhere real", async ({ page }) => {
    await page.goto("/en/system");
    await expect(page.getByRole("link", { name: "View full log" })).toHaveAttribute(
      "href",
      /\/en\/webhooks/
    );
    await expect(page.getByRole("link", { name: /Endpoint & token/ })).toHaveAttribute(
      "href",
      /\/en\/settings\/developer/
    );
    await expect(page.getByRole("link", { name: /Notification preferences/ })).toHaveAttribute(
      "href",
      /\/en\/settings\/notifications/
    );
  });
});
