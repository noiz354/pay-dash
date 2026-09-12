import { test, expect } from "@playwright/test";
import { loginAs } from "../test-utils";

// Gate 4 — freshness is explicit on the Command Center (spec §7): the age
// ticks every second **without a fetch**, the manual refresh resets it, and a
// snapshot older than 60s raises the stale banner whose refresh clears it.
// The stale leg genuinely waits past the threshold — that is the contract.

test.describe("Wave 4 gate 4 — stale → refresh", () => {
  test("the age ticks without a fetch and manual refresh resets it", async ({ page }) => {
    await loginAs(page, "rina", "/en/dashboard");
    const freshness = page.getByTestId("cc-freshness");
    await expect(freshness).toContainText("Updated");

    const ageSeconds = async () => {
      const text = (await freshness.textContent()) ?? "";
      return parseInt(text.match(/Updated (\d+)s/)?.[1] ?? "-1", 10);
    };

    const before = await ageSeconds();
    expect(before).toBeGreaterThanOrEqual(0);
    // The 1s tick advances the age with no polling in between.
    await expect.poll(ageSeconds, { timeout: 20_000, intervals: [1_000] }).toBeGreaterThan(before);

    // Manual refresh brings the age back to ~0.
    await page.getByTestId("cc-refresh").click();
    await expect.poll(ageSeconds, { timeout: 20_000, intervals: [1_000] }).toBeLessThan(5);
  });

  test("a snapshot older than 60s raises the stale banner; its refresh clears it", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAs(page, "rina", "/en/dashboard");

    // The threshold is 60s — wait it out for real.
    const banner = page.getByText(/Data may be outdated/);
    await banner.waitFor({ state: "visible", timeout: 150_000 });

    await page.getByRole("button", { name: "Refresh data" }).click();
    await expect(banner).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId("cc-freshness")).toContainText(/Updated [0-5]s ago/);
  });
});
