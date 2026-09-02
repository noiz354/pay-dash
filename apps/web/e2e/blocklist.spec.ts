import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Blocklist journey (ADR-0024): /fraud and /fraud/blocklist run on ONE
// seeded store (the prototype shipped two contradictory lists with 2023
// dates plus invented metrics). Tabs/search are URL state (mirrored by
// Export), Add validates per type and is visible on both routes, Remove is
// real, and the "of 124" pagination is the true count.
test.describe.configure({ mode: "serial" });

test.describe("Fraud blocklist", () => {
  test("fraud console serves the derived store, not the invented metrics", async ({ page }) => {
    await page.goto("/en/fraud");
    await expect(page.getByRole("heading", { name: /Fraud Prevention/ })).toBeVisible();

    // Invented artifacts are gone.
    await expect(page.getByText("14,209")).toHaveCount(0);
    await expect(page.getByText("8,432")).toHaveCount(0);
    await expect(page.getByText("3,194")).toHaveCount(0);
    await expect(page.getByText("+12% this week")).toHaveCount(0);
    await expect(page.getByText("of 124")).toHaveCount(0);
    await expect(page.getByText("2023")).toHaveCount(0);

    // Derived world.
    await expect(page.getByText("10 blocked entities")).toBeVisible();
    await expect(page.getByText("1 to 6 of 6")).toBeVisible();
    // the Card tab is real (masked first-6/last-4)
    await page.getByRole("tab", { name: /Card Numbers/ }).click();
    await expect(page.getByText("453322 •••• 0110")).toBeVisible();
    await expect(page.getByText("512345 •••• 0921")).toBeVisible();
    await expect(page.getByText("1 to 2 of 2")).toBeVisible();
  });

  test("one store: an add on the blocklist page shows on the fraud console", async ({ page }) => {
    await page.goto("/en/fraud/blocklist");
    await expect(page.getByText("10 entities blocked")).toBeVisible();

    await page.getByRole("button", { name: "Add to Blocklist" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("IP address").fill("93.184.216.34");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("93.184.216.34 added to the blocklist.")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    await expect(page.getByText("93.184.216.34")).toBeVisible();

    // the same entry on the other route — one source of truth
    await page.goto("/en/fraud");
    await expect(page.getByText("93.184.216.34")).toBeVisible();
    await expect(page.getByText("11 blocked entities")).toBeVisible();
  });

  test("search is URL state and tabs deep-link", async ({ page }) => {
    await page.goto("/en/fraud");
    await page.getByLabel("Search IP addresses").fill("203.0");
    await expect(page.getByText("203.0.113.42")).toBeVisible();
    await expect(page).toHaveURL(/q=203\.0/);
    await expect(page.getByText("1 to 1 of 1")).toBeVisible();

    await page.getByLabel("Search IP addresses").fill("");
    await expect(page.getByText("1 to 6 of 6")).toBeVisible();

    await page.goto("/en/fraud?type=email");
    await expect(page.getByText("mailinator.com")).toBeVisible();
    await expect(page.getByText("guerrillamail.com")).toBeVisible();
    await expect(page.getByText("1 to 2 of 2")).toBeVisible();
  });

  test("removal works and invalid adds are rejected", async ({ page }) => {
    await page.goto("/en/fraud");
    const row = page.locator("tr", { hasText: "93.184.216.34" });
    await row.getByRole("button", { name: "Actions for 93.184.216.34" }).click();
    await page.getByText("Remove from blocklist").click();
    await expect(page.getByText("93.184.216.34 removed from the blocklist.")).toBeVisible();
    await expect(page.getByText("93.184.216.34")).toHaveCount(0);
    await expect(page.getByText("10 blocked entities")).toBeVisible();

    // validation on the dialog
    await page.getByRole("button", { name: "Add to Blocklist" }).click();
    await page.getByLabel("IP address").fill("999.1.1.1");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Enter a valid IPv4 or IPv6 address.")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("export mirrors the tab filter", async ({ page }) => {
    await page.goto("/en/fraud?type=card");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^blocklist-\d{4}-\d{2}-\d{2}\.csv$/);

    const content = readFileSync(await download.path(), "utf8").trim();
    const [header, ...body] = content.split("\n");
    expect(header).toBe("type,value,reason,added_at");
    expect(body).toHaveLength(2);
    for (const line of body) {
      expect(line.startsWith("CARD,")).toBe(true);
    }
  });
});
