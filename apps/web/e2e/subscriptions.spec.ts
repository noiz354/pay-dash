import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Subscriptions journey (ADR-0021): the page serves the app's own plan store
// (10 seeded plans, deterministic), search/status/pagination are URL state,
// the create dialog lands a real PENDING_SETUP plan, and Export downloads
// the filtered rows. The prototype's invented cards (the same "1,248" the
// reports builder faked, plus a contradictory "1,290"), its 2023-dated rows,
// its third-party avatar URLs and its handler-less controls must be gone.
test.describe.configure({ mode: "serial" });

test.describe("Subscriptions", () => {
  test("serves the real plan store, not the invented preview", async ({ page }) => {
    await page.goto("/en/subscriptions");
    await expect(page.getByRole("heading", { name: /^Subscriptions$/ })).toBeVisible();

    // The prototype's invented artifacts are gone.
    await expect(page.getByText("1,248")).toHaveCount(0);
    await expect(page.getByText("1,290")).toHaveCount(0);
    await expect(page.getByText("TechFlow Solutions")).toHaveCount(0);
    await expect(page.getByText("sub_1Mvw8K")).toHaveCount(0);
    await expect(page.getByText("Oct 24, 2023")).toHaveCount(0);
    await expect(page.locator("img[src*='googleusercontent']")).toHaveCount(0);

    // The derived stat cards carry real, computable numbers.
    await expect(page.getByText("10 plans")).toBeVisible();
    await expect(page.getByText("Rp 94.550.000")).toBeVisible(); // active MRR
    await expect(page.getByText("Rp 15.000.000 outstanding")).toBeVisible(); // past due

    // Real rows: directory customers, Rp amounts, sub_ ids.
    await expect(page.getByText("Initech BV").first()).toBeVisible();
    await expect(page.getByText("Growth").first()).toBeVisible();
    await expect(page.getByText(/^sub_/).first()).toBeVisible();
  });

  test("search and status filter narrow the list via URL state", async ({ page }) => {
    await page.goto("/en/subscriptions");
    await expect(page.getByText("10 plans")).toBeVisible();

    await page.getByLabel("Search subscriptions").fill("initech");
    await expect(page.getByText("Initech BV").first()).toBeVisible();
    await expect(page.getByText("Globex Retail")).toHaveCount(0);
    await expect(page).toHaveURL(/q=initech/);

    await page.getByRole("button", { name: "Clear (1)" }).click();
    await expect(page.getByText("10 plans")).toBeVisible();

    await page.getByLabel("Filter subscriptions by status").selectOption("PAST_DUE");
    await expect(page.getByText("Kevin Tan")).toBeVisible();
    await expect(page.getByText("Initech BV")).toHaveCount(0);
    await expect(page).toHaveURL(/status=PAST_DUE/);
  });

  test("create dialog adds a real PENDING_SETUP plan", async ({ page }) => {
    await page.goto("/en/subscriptions");
    await expect(page.getByText("10 plans")).toBeVisible();

    await page.getByRole("button", { name: "Create Subscription" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByLabel("Customer").selectOption("finance@initech.eu");
    await page.getByLabel("Plan name").fill("Enterprise Plus");
    await page.getByLabel("Amount (IDR)").fill("25,000,000");
    await page.getByRole("button", { name: "Create plan" }).click();

    // Success view inside the dialog, with the new plan id.
    await expect(page.getByText("Plan created")).toBeVisible();
    await expect(page.getByText(/^sub_/).last()).toBeVisible();

    await page.getByRole("button", { name: "Done" }).click();

    // The list follows: newest first, pending setup, one more plan.
    const row = page.locator("tr", { hasText: "Enterprise Plus" });
    await expect(row).toBeVisible();
    await expect(row.getByText("Pending setup")).toBeVisible();
    await expect(row.getByText("Rp 25.000.000")).toBeVisible();
    await expect(page.getByText("11 plans")).toBeVisible();
  });

  test("export downloads exactly the filtered rows", async ({ page }) => {
    await page.goto("/en/subscriptions");
    await page.getByLabel("Filter subscriptions by status").selectOption("PAST_DUE");
    await expect(page.getByText("Kevin Tan")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export subscriptions" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^subscriptions-\d{4}-\d{2}-\d{2}\.csv$/);

    const content = readFileSync(await download.path(), "utf8").trim();
    const [header, ...body] = content.split("\n");
    expect(header).toBe(
      "id,plan,customer_name,customer_email,interval,amount,currency,status,started_at,next_billing_at,cancelled_at"
    );
    expect(body).toHaveLength(1);
    expect(body[0]).toContain("PAST_DUE");
    expect(body[0].startsWith("sub_")).toBe(true);
  });

  test("row actions open a real menu and route to the customer", async ({ page }) => {
    await page.goto("/en/subscriptions");
    await page.getByRole("button", { name: "More actions for Initech BV" }).click();
    await expect(page.getByText("View customer")).toBeVisible();
    await expect(page.getByText("Copy plan ID")).toBeVisible();

    await page.getByText("View customer").click();
    await expect(page).toHaveURL(/^\/en\/customers\//);
  });
});
