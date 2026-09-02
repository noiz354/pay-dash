import { expect, test } from "@playwright/test";

// Risk & velocity journey (ADR-0023): the page serves the app's own
// ruleset (INTEGRATION.md:117/:320 — "Velocity/risk thresholds are
// Dashboard-only"), the alert queue is DERIVED from the ledger (every
// trigger deep-links to a real transaction), the USD caps are IDR caps with
// derived usage, the draft/deploy workflow is real, and the prototype's
// inventions ("14 / 12% vs yesterday", "Card ending 4492", "Merchant A")
// must be gone.
test.describe.configure({ mode: "serial" });

test.describe("Risk & Velocity Limits", () => {
  test("serves the derived risk world, not the invented one", async ({ page }) => {
    await page.goto("/en/risk");
    await expect(page.getByRole("heading", { name: /Risk & Velocity Limits/ })).toBeVisible();
    await expect(page.getByText("Active Ruleset")).toBeVisible();

    // The prototype's invented artifacts are gone.
    await expect(page.getByText("Card ending 4492")).toHaveCount(0);
    await expect(page.getByText("Merchant A")).toHaveCount(0);
    await expect(page.getByText("12% vs yesterday")).toHaveCount(0);
    await expect(page.getByText("USD")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "View All" })).toHaveCount(0);

    // Derived world: the ruleset has a referent, caps are IDR.
    await expect(page.getByText("High-risk alerts")).toBeVisible();
    await expect(page.getByText("Card velocity")).toBeVisible();
    await expect(page.getByText("Max daily card charge")).toBeVisible();
    await expect(page.getByText("Rp 50.000.000 per day")).toBeVisible();
    await expect(page.getByText("Block")).toBeVisible();
    await expect(page.getByText("Ledger Risk Profile")).toBeVisible();
    // volume caps are drafted/deployed as IDR inputs
    await expect(page.getByLabel("Max daily volume IDR")).toBeVisible();
  });

  test("every trigger deep-links to a real transaction", async ({ page }) => {
    await page.goto("/en/risk");
    const first = page.locator("section[aria-label='Active alerts'] a[href*='/transactions/']").first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/\/en\/transactions\/txn_/);
  });

  test("draft -> deploy -> discard is a real workflow", async ({ page }) => {
    await page.goto("/en/risk");
    const badge = page.getByText("Active Ruleset");
    const pendingBadge = page.getByText("Draft pending");

    // No draft yet: both buttons are disabled.
    await expect(page.getByRole("button", { name: "Deploy Changes" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Discard Draft" })).toBeDisabled();

    // Edit the daily cap -> draft.
    await page.getByLabel("Max daily volume IDR").fill("2500000000");
    await page.getByRole("button", { name: "Save to draft" }).click();
    await expect(page.getByText("Draft updated — deploy to make it live.")).toBeVisible();
    await expect(badge).toHaveCount(0);
    await expect(pendingBadge).toBeVisible();
    await expect(page.getByRole("button", { name: "Deploy Changes" })).toBeEnabled();

    // Deploy -> live.
    await page.getByRole("button", { name: "Deploy Changes" }).click();
    await expect(page.getByText("Ruleset deployed — 4 rules live.")).toBeVisible();
    await expect(badge).toBeVisible();

    // Toggle the disabled rule -> draft again -> deploy -> stick.
    await page.getByLabel("Enable High-value transaction").click();
    await expect(page.getByText("High-value transaction drafted as enabled.")).toBeVisible();
    await expect(pendingBadge).toBeVisible();
    await page.getByRole("button", { name: "Deploy Changes" }).click();
    await expect(page.getByText("Ruleset deployed — 4 rules live.")).toBeVisible();
    await expect(page.getByLabel("Disable High-value transaction")).toBeVisible();

    // Toggle it back -> draft -> discard reverts.
    await page.getByLabel("Disable High-value transaction").click();
    await expect(page.getByText("High-value transaction drafted as disabled.")).toBeVisible();
    await page.getByRole("button", { name: "Discard Draft" }).click();
    await expect(page.getByText("Draft discarded.")).toBeVisible();
    await expect(badge).toBeVisible();
    await expect(page.getByLabel("Enable High-value transaction")).toBeVisible();
  });

  test("volume inputs are server-validated", async ({ page }) => {
    await page.goto("/en/risk");

    // zero is rejected
    await page.getByLabel("Max daily volume IDR").fill("0");
    await page.getByRole("button", { name: "Save to draft" }).click();
    await expect(page.getByText("Enter a daily volume limit greater than zero.")).toBeVisible();

    // monthly below daily is rejected
    await page.getByLabel("Max daily volume IDR").fill("2500000000");
    await page.getByLabel("Max monthly volume IDR").fill("1000000000");
    await page.getByRole("button", { name: "Save to draft" }).click();
    await expect(page.getByText("The monthly cap must be at least the daily cap.")).toBeVisible();

    // restore a valid draft and deploy, leaving the store consistent
    await page.getByLabel("Max monthly volume IDR").fill("60000000000");
    await page.getByRole("button", { name: "Save to draft" }).click();
    await expect(page.getByText("Draft updated — deploy to make it live.")).toBeVisible();
    await page.getByRole("button", { name: "Deploy Changes" }).click();
    await expect(page.getByText("Ruleset deployed — 4 rules live.")).toBeVisible();
  });
});
