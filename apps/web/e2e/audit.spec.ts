import { expect, test } from "@playwright/test";

// Audit log journey (ADR-0026): every row is derived from the event timelines
// the app's stores already own (ledger transactions, payout batches, the
// webhook callback log, configuration changes). The five 2023-10-24 rows,
// the off-world @org.com actors, "12,042 events" and the User/IP columns are
// gone; every control is real URL state with a real CSV export.
test.describe.configure({ mode: "serial" });

test.describe("Detailed Audit Log", () => {
  test("the log is derived, not invented", async ({ page }) => {
    await page.goto("/en/audit");
    await expect(page.getByRole("heading", { name: /Detailed Audit Log/ })).toBeVisible();

    // The invented artifacts are gone.
    await expect(page.getByText("12,042")).toHaveCount(0);
    await expect(page.getByText("2409")).toHaveCount(0);
    await expect(page.getByText("2023")).toHaveCount(0);
    await expect(page.getByText("alice.jones@org.com")).toHaveCount(0);
    await expect(page.getByText("key_prod_892f")).toHaveCount(0);

    // The derived world: the true total, real derived rows on page 1.
    await expect(page.getByText("177 events")).toBeVisible();
    await expect(page.getByText("1 to 10 of 177")).toBeVisible();
    await expect(page.getByText("Payment captured").first()).toBeVisible();
    // The honest note: no User / IP column, because no store holds one.
    await expect(page.getByText(/no store holds one/)).toBeVisible();
  });

  test("filters are URL state and re-derive", async ({ page }) => {
    await page.goto("/en/audit?category=WEBHOOKS");
    await expect(page.getByText("7 events")).toBeVisible();
    await expect(page.getByText("1 to 7 of 7")).toBeVisible();
    await expect(page.getByText("Callback received").first()).toBeVisible();

    // status deep link: the four declined authorizations are the only FAILED
    await page.goto("/en/audit?status=FAILED");
    await expect(page.getByText("4 events")).toBeVisible();
    await expect(page.getByText("1 to 4 of 4")).toBeVisible();

    // free text over the derived rows
    await page.goto("/en/audit?q=velocity%20ruleset");
    await expect(page.getByText("1 event")).toBeVisible();
    await expect(page.getByText("Velocity ruleset deployed")).toBeVisible();
  });

  test("the filter bar writes the URL", async ({ page }) => {
    await page.goto("/en/audit");
    await page.getByLabel("Filter events by status").click();
    await page.getByRole("option", { name: "Status: Failed" }).click();
    await expect(page).toHaveURL(/status=FAILED/);
    await expect(page.getByText("4 events")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/en\/audit$/);
    await expect(page.getByText("177 events")).toBeVisible();
  });

  test("pagination walks the derived history", async ({ page }) => {
    await page.goto("/en/audit");
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText("11 to 20 of 177")).toBeVisible();
  });

  test("export downloads the filtered rows", async ({ page }) => {
    await page.goto("/en/audit?category=WEBHOOKS");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Export CSV/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^audit-\d{4}-\d{2}-\d{2}\.csv$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const csv = Buffer.concat(chunks).toString("utf-8");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("timestamp,category,status,action,resource,detail");
    expect(lines).toHaveLength(8); // header + 7 webhook events
    expect(csv).not.toContain("2023");
  });
});
