import { expect, test } from "@playwright/test";

// Payment-link journey (ADR-0013): derived status (paid comes from the
// ledger, never a stored flag), single/multiple tabs in the URL, URL
// filters + search, detail page with a real checkout URL, and the three
// merchant actions — create, close, simulate payment (TEST MODE).
//
// Serial on purpose: create/simulate/close mutate the shared in-memory
// store that the counting tests below read.
test.describe.configure({ mode: "serial" });

test.describe("Payment Links", () => {
  test("the single-amount tab lists seeded links with real money", async ({ page }) => {
    await page.goto("/en/payments/links");
    await expect(page.getByRole("heading", { name: "Payment Links" })).toBeVisible();

    // The prototype's corrupted amount literal and USD amounts are gone.
    await expect(page.getByText(",250.00")).toHaveCount(0);
    await expect(page.getByText(/IDR \d/)).toHaveCount(0);
    await expect(page.getByText("5,000.00")).toHaveCount(0);

    // Default tab is single: five seeded single links, every amount in IDR.
    await expect(page.getByTestId("link-row-plink_8x9a2b1c")).toBeVisible();
    await expect(page.getByTestId("link-row-plink_3k4m5n6p")).toBeVisible();
    await expect(page.getByTestId("link-row-plink_9q8w7e6r")).toBeVisible();
    await expect(page.getByTestId("link-row-plink_7f8g9h0j")).toBeVisible();
    await expect(page.getByTestId("link-row-plink_4c5d6e7f")).toBeVisible();
    await expect(page.getByTestId("link-row-plink_2z3x4c5v")).toHaveCount(0);
    await expect(page.getByText("5 links")).toBeVisible();

    // Derived status pills for the five seeded single links.
    await expect(page.getByText("Paid", { exact: true })).toHaveCount(2);
    await expect(page.getByText("Open", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Expired", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Cancelled", { exact: true })).toHaveCount(1);
    await expect(page.getByText(/Rp 4\.250\.000/)).toBeVisible();
    await expect(page.getByText(/Rp 12\.000\.000/)).toBeVisible();
  });

  test("the multiple tab is a URL state and shows line-item links", async ({ page }) => {
    await page.goto("/en/payments/links");
    await page.getByRole("tablist", { name: "Link type" }).getByText("Multiple items").click();
    await expect(page).toHaveURL(/kind=multiple/);

    await expect(page.getByTestId("link-row-plink_2z3x4c5v")).toBeVisible();
    await expect(page.getByTestId("link-row-plink_1a2s3d4f")).toBeVisible();
    await expect(page.getByTestId("link-row-plink_0a1b2c3d")).toBeVisible();
    await expect(page.getByText("3 links")).toBeVisible();

    // Line items are summarised in the row, not flattened into four columns.
    await expect(page.getByText("4 items —")).toBeVisible();
    await expect(page.getByText(/Rp 58\.750\.000/)).toBeVisible();
  });

  test("status filter and search live in the URL", async ({ page }) => {
    await page.goto("/en/payments/links");
    await page.getByLabel("Filter links by status").selectOption("PAID");
    await expect(page).toHaveURL(/status=PAID/);
    await expect(page.getByText("2 links")).toBeVisible();

    await page.locator('input[aria-label="Search links"]').fill("starkindustries");
    // Debounced search → no paid single link belongs to stark (its single
    // link is cancelled; the open one lives in the multiple tab).
    await expect(page.getByText("0 links")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/en\/payments\/links$/);
    await expect(page.getByText("5 links")).toBeVisible();
  });

  test("rows open the detail page with a copyable checkout URL", async ({ page }) => {
    await page.goto("/en/payments/links");
    await page.getByTestId("link-row-plink_8x9a2b1c").click();
    await expect(page).toHaveURL(/\/en\/payments\/links\/plink_8x9a2b1c/);
    await expect(page.getByRole("heading", { name: "plink_8x9a2b1c" })).toBeVisible();
    await expect(page.getByText("Paid", { exact: true })).toBeVisible();

    // The checkout URL is real and copyable; the payer email is the seed's.
    await expect(page.getByText("https://pay.kinetic.test/plink_8x9a2b1c")).toBeVisible();
    await expect(page.getByText("sarah.jenkins@acmecorp.com")).toBeVisible();
    await expect(page.getByText(/Rp 4\.250\.000/)).toBeVisible();

    // Seeded pre-window payments have no ledger row — no "View payment" exit.
    await expect(page.getByRole("link", { name: /View payment/ })).toHaveCount(0);
  });

  test("unknown links render the not-found state", async ({ page }) => {
    await page.goto("/en/payments/links/plink_does_not_exist");
    await expect(page.getByText("Payment link not found")).toBeVisible();
  });

  test("creating a single-amount link round-trips into the table", async ({ page }) => {
    await page.goto("/en/payments/links?new=1");
    await expect(page.getByRole("dialog")).toContainText("Create a single-amount link");

    await page.getByLabel("Amount").fill("7500000");
    await page.getByLabel("Payer email").fill("billing@roundtrip.test");
    await page.getByRole("button", { name: "Create link" }).click();

    // Success panel shows the server-generated id and its checkout URL.
    // The id cell is the only dialog element whose *whole* text is the id —
    // the checkout URL embeds it too.
    await expect(page.getByRole("dialog")).toContainText("Link created");
    const idText = await page.getByRole("dialog").getByText(/^plink_\w+$/).innerText();
    const id = idText.trim().match(/plink_\w+/)![0];
    await expect(page.getByRole("dialog")).toContainText(`https://pay.kinetic.test/${id}`);
    await expect(page.getByRole("dialog")).toContainText("Rp 7.500.000");

    await page.getByRole("button", { name: "Done" }).click();
    // The dialog closed and the deep-link param is gone.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).not.toHaveURL(/new=1/);

    // The new link is first in the table (createdAt desc) with an Open pill.
    const row = page.getByTestId(`link-row-${id}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("billing@roundtrip.test");
    await expect(row).toContainText("Rp 7.500.000");
  });

  test("creating a multiple-item link validates line items and totals", async ({ page }) => {
    await page.goto("/en/payments/links?kind=multiple&new=1");
    await expect(page.getByRole("dialog")).toContainText("Create a multiple-item link");

    await page.getByLabel("Item 1 label").fill("Onboarding");
    await page.getByLabel("Item 1 amount").fill("1000000");
    await page.getByLabel("Item 2 label").fill("Support plan");
    await page.getByLabel("Item 2 amount").fill("2000000");
    // Running total is client-visible before submit.
    await expect(page.getByRole("dialog")).toContainText("Rp 3.000.000");

    await page.getByRole("button", { name: "Create link" }).click();
    await expect(page.getByRole("dialog")).toContainText("Link created");
    const id = (await page.getByRole("dialog").getByText(/^plink_\w+$/).innerText()).trim().match(/plink_\w+/)![0];

    await page.getByRole("button", { name: "Done" }).click();
    const row = page.getByTestId(`link-row-${id}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("2 items — Onboarding, Support plan");
    await expect(row).toContainText("Rp 3.000.000");
  });

  test("simulating a payment settles the link via the ledger", async ({ page }) => {
    await page.goto("/en/payments/links/plink_1a2s3d4f");
    await expect(page.getByText("Open", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Simulate payment" }).click();

    // Ledger toast, then the pill flips on the refreshed detail page.
    await expect(page.getByText(/Payment of Rp 27\.500\.000 recorded/)).toBeVisible();
    await expect(page.getByText("Paid", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Simulate payment" })).toHaveCount(0);

    // "View payment" now exists and reaches the real ledger row.
    await page.getByRole("link", { name: /View payment/ }).click();
    await expect(page).toHaveURL(/\/en\/transactions\/plink_1a2s3d4f/);
    await expect(page.getByRole("heading", { name: "plink_1a2s3d4f" })).toBeVisible();
    await expect(page.getByText("Succeeded", { exact: true })).toBeVisible();
  });

  test("closing an open link flips it to Cancelled", async ({ page }) => {
    await page.goto("/en/payments/links/plink_4c5d6e7f");
    await expect(page.getByText("Open", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Close this link" }).click();
    await expect(page.getByText(/closed — it can no longer be paid/)).toBeVisible();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
    // The paid/simulate actions are gone for a closed link.
    await expect(page.getByRole("button", { name: "Simulate payment" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Close this link" })).toHaveCount(0);
  });

  test("the full status vocabulary is derived, never stored", async ({ page }) => {
    // Walk one link of each non-open state; the pill on the detail page must
    // agree with the table pill — both are deriveLinkStatus() output.
    await page.goto("/en/payments/links/plink_9q8w7e6r");
    await expect(page.getByText("Expired", { exact: true })).toBeVisible();
    await expect(page.getByText("The clock ran out")).toBeVisible();

    await page.goto("/en/payments/links/plink_7f8g9h0j");
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
    await expect(page.getByText("You closed this link")).toBeVisible();
  });
});
