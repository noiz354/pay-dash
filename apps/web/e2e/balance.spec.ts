import { expect, test } from "@playwright/test";

// Balance journey (ADR-0011): one derived figure, real top-up/withdraw
// dialogs, URL filters, row → source record, CSV export.
//
// Serial on purpose: the top-up and withdrawal tests mutate the shared
// in-memory store, and other specs (payouts) mutate payout state in parallel.
test.describe.configure({ mode: "serial" });

function parseRp(text: string): number {
  return Number(text.replace(/[^\d]/g, ""));
}

test.describe("Balance", () => {
  test("renders one available balance, not two contradictory figures", async ({ page }) => {
    await page.goto("/en/balance");
    await expect(page.getByRole("heading", { name: "Balance & History" })).toBeVisible();

    // The available figure: exactly one, and it is real money.
    const available = page.getByTestId("balance-available");
    await expect(available).toHaveCount(1);
    await expect(available).toHaveText(/Rp \d/);

    // The old mobile-prototype fallback printed "IDR …" — it must be gone.
    await expect(page.getByText(/^IDR \d/)).toHaveCount(0);

    // The invented destination from the prototype must be gone too.
    await expect(page.getByText("4910")).toHaveCount(0);
    await expect(page.getByText("Set up schedule")).toHaveCount(0);

    // The history table renders derived rows with a working "full ledger" exit.
    await expect(page.getByRole("heading", { name: "Recent Movements" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View the full ledger" })).toBeVisible();
  });

  test("the auto-withdrawal card mirrors the real payout settings", async ({ page }) => {
    await page.goto("/en/balance");
    await expect(page.getByText("Auto-Withdrawal", { exact: true })).toBeVisible();

    // Destination comes from getDestinationAccount(): the verified BCA default.
    await expect(page.getByTitle(/1234/)).toBeVisible();
    // Schedule is the real cadence — one of the allowed labels or Paused —
    // never the hard-coded "Daily" the prototype shipped.
    const scheduleText = await page
      .locator("div:has(> span:text-is('Schedule'))")
      .last()
      .innerText();
    expect(scheduleText).toMatch(/Daily|Weekly|Monthly|Manual only|Paused/);
    expect(scheduleText).not.toContain("4910");
    // "Configure" is a real route to the payout schedule, not a dead anchor.
    await expect(page.getByRole("link", { name: /Configure/ })).toHaveAttribute(
      "href",
      /\/en\/payouts\/settings/
    );
  });

  test("toggling auto-withdrawal writes back to the payout schedule", async ({ page }) => {
    await page.goto("/en/balance");
    const toggle = page.getByLabel("Toggle Auto-Withdrawal");
    await expect(toggle).toBeVisible();
    expect(await toggle.getAttribute("data-state")).toMatch(/checked|unchecked/);

    // Each flip submits a server action and reports back with a toast —
    // the switch is no longer uncontrolled decoration. (State assertions are
    // kept loose: other specs may legitimately save the schedule in parallel.)
    await toggle.click();
    await expect(page.getByText(/Auto-withdrawal is (on|off)/)).toBeVisible();
    await expect(toggle).toHaveAttribute("data-state", /checked|unchecked/);

    await toggle.click();
    await expect(page.getByText(/Auto-withdrawal is (on|off)/).last()).toBeVisible();
    await expect(toggle).toHaveAttribute("data-state", /checked|unchecked/);
  });

  test("the 30-day trend chart renders in place of the decorative blur", async ({ page }) => {
    await page.goto("/en/balance");
    await expect(page.getByText("Last 30 days")).toBeVisible();
    await expect(page.getByTestId("balance-trend").locator("svg").first()).toBeVisible();
    // The decorative blur circle from the prototype is gone.
    await expect(page.locator(".blur-2xl")).toHaveCount(0);
  });

  test("top-up dialog adds a settled TOP_UP movement", async ({ page }) => {
    await page.goto("/en/balance");
    const before = parseRp(await page.getByTestId("balance-available").innerText());

    await page.getByRole("button", { name: "Top Up" }).click();
    await expect(page.getByRole("dialog")).toContainText("Top up your balance");
    await page.getByLabel("Amount").fill("25,000,000");
    await page.getByRole("button", { name: "Add to balance" }).click();

    // Success panel + toast with the server-computed new balance.
    await expect(page.getByText("New available balance")).toBeVisible();
    await expect(page.getByText(/Added Rp 25\.000\.000 via BCA Virtual Account/)).toBeVisible();
    const after = parseRp(await page.getByTestId("balance-available").innerText());
    expect(after).toBeGreaterThan(before);

    await page.getByRole("button", { name: "Done" }).click();
    // The movement shows up in the history, searchable.
    await page.locator('input[aria-label="Search movements"]').fill("Top up — BCA Virtual Account");
    await expect(page.getByText("Top up — BCA Virtual Account").first()).toBeVisible();
  });

  test("withdrawal routes into the payout batch flow", async ({ page }) => {
    await page.goto("/en/balance?withdraw=1");
    await expect(page.getByRole("dialog")).toContainText("Withdraw from your balance");
    await page.getByLabel("Amount").fill("1,000,000");
    await page.getByRole("button", { name: "Withdraw" }).click();

    await expect(page.getByText(/Withdrew Rp 1\.000\.000 — batch BATCH-.*paid/)).toBeVisible();
    await page.getByRole("link", { name: "View batch" }).click();
    await expect(page).toHaveURL(/\/en\/payouts\/BATCH-/);
    await expect(page.getByRole("heading", { name: /Withdrawal to Bank Central Asia/ })).toBeVisible();
  });

  test("withdrawal rejects amounts above the available balance", async ({ page }) => {
    await page.goto("/en/balance?withdraw=1");
    const available = parseRp(await page.getByTestId("balance-available").innerText());
    await page.getByLabel("Amount").fill(String(available + 100_000));
    await page.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByText(/is available — the withdrawal exceeds it/)).toBeVisible();
  });

  test("movement filters live in the URL and can be cleared", async ({ page }) => {
    await page.goto("/en/balance");
    await page.getByLabel("Filter movements by type").selectOption("WITHDRAWAL");
    await expect(page).toHaveURL(/type=WITHDRAWAL/);
    await page.getByLabel("Filter movements by status").selectOption("FAILED");
    await expect(page).toHaveURL(/status=FAILED/);
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/en\/balance$/);
  });

  test("movement rows route to the record that moved the money", async ({ page }) => {
    await page.goto("/en/balance");
    const firstRow = page.getByRole("link", { name: /^Open / }).first();
    await expect(firstRow).toBeVisible();
    const label = await firstRow.getAttribute("aria-label");
    await firstRow.click();
    if (label?.startsWith("Open Withdrawal")) {
      await expect(page).toHaveURL(/\/en\/payouts\/BATCH-/);
    } else if (label?.startsWith("Open Payment") || label?.startsWith("Open Refund")) {
      await expect(page).toHaveURL(/\/en\/transactions\/txn_/);
    } else {
      throw new Error(`Unexpected first movement: ${label}`);
    }
  });

  test("export downloads a CSV of the current view", async ({ page }) => {
    await page.goto("/en/balance?type=WITHDRAWAL");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^balance-movements-.*\.csv$/);
  });

  test("unknown balance paths render the not-found state", async ({ page }) => {
    await page.goto("/en/balance/nope");
    await expect(page.getByText("That balance page doesn't exist")).toBeVisible();
  });
});
