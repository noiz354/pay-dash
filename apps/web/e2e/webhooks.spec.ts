import { expect, test } from "@playwright/test";

// Webhook journey (ADR-0014): the log of INBOUND callbacks the endpoint
// persists (INTEGRATION.md §7 — this app receives, it doesn't deliver),
// URL filters, detail with payload + status meaning, TEST MODE simulate and
// replay (replay = the idempotency demo: same event id → DUPLICATED row).
//
// Serial on purpose: simulate and replay mutate the shared in-memory store
// that the counting tests read.
test.describe.configure({ mode: "serial" });

test.describe("Webhooks", () => {
  test("the log lists seeded inbound callbacks, not invented deliveries", async ({ page }) => {
    await page.goto("/en/webhooks");
    await expect(page.getByRole("heading", { name: "Webhook Logs" })).toBeVisible();

    // The prototype's outbound-delivery fiction is gone: no merchant target
    // URLs, no stripe, no invented 1,024-row counter.
    await expect(page.getByText("api.merchant.com")).toHaveCount(0);
    await expect(page.getByText(/stripe/i)).toHaveCount(0);
    await expect(page.getByText("1,024")).toHaveCount(0);
    await expect(page.getByText("Oct 24")).toHaveCount(0);

    // Seven seeded events with the full status spread (scoped to the table —
    // the filter selects carry the same words as options).
    await expect(page.getByText("7 events")).toBeVisible();
    await expect(page.locator("tbody").getByText("Received", { exact: true })).toHaveCount(4);
    await expect(page.locator("tbody").getByText("Duplicated", { exact: true })).toHaveCount(1);
    await expect(page.locator("tbody").getByText("Rejected", { exact: true })).toHaveCount(2);

    // The unhandled flag is visible on the unknown seeded type.
    await expect(page.getByText("unhandled", { exact: true })).toBeVisible();
  });

  test("the config card states the endpoint and token truth", async ({ page }) => {
    await page.goto("/en/webhooks");
    await expect(page.getByText("/api/webhooks/xendit")).toBeVisible();
    // No token is configured in CI/dev — presence only, never a value.
    await expect(page.getByText(/No token set/)).toBeVisible();
    await expect(page.getByText("wh_")).toHaveCount(0);
    // Retry policy / IP allowlist live on the developer settings page.
    await expect(page.getByRole("link", { name: /Retry policy/ })).toHaveAttribute(
      "href",
      /\/en\/settings\/developer/
    );
  });

  test("status, type and search filters live in the URL", async ({ page }) => {
    await page.goto("/en/webhooks");
    await page.getByLabel("Filter callbacks by status").selectOption("REJECTED");
    await expect(page).toHaveURL(/status=REJECTED/);
    await expect(page.getByText("2 events")).toBeVisible();

    await page.getByLabel("Filter callbacks by event type").selectOption("payment.succeeded");
    await expect(page).toHaveURL(/type=payment\.succeeded/);
    // No rejected payment.succeeded callback — the filters compose.
    await expect(page.getByText("0 events")).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/en\/webhooks$/);
    await expect(page.getByText("7 events")).toBeVisible();

    await page.locator('input[aria-label="Search callbacks"]').fill("evt_a1b2c3d4");
    // The seed pair: original + its duplicate share the event id.
    await expect(page.getByText("2 events")).toBeVisible();
  });

  test("rows open the callback detail with its payload", async ({ page }) => {
    await page.goto("/en/webhooks");
    await page.getByTestId("webhook-row-whk_seed_1").click();
    await expect(page).toHaveURL(/\/en\/webhooks\/whk_seed_1/);
    await expect(page.getByRole("heading", { name: "evt_a1b2c3d4" })).toBeVisible();
    await expect(page.getByText("This callback was received")).toBeVisible();

    // The payload is the real stored object — including the ledger reference
    // the seeded payment.succeeded event carries.
    await expect(page.locator("pre")).toContainText('"event": "payment.succeeded"');
    await expect(page.getByText("Replay callback")).toBeVisible();
  });

  test("a rejected callback shows its reason and offers no replay", async ({ page }) => {
    await page.goto("/en/webhooks/whk_seed_4");
    await expect(page.locator("main").getByText("Invalid x-callback-token").first()).toBeVisible();
    await expect(page.getByText("This callback was rejected")).toBeVisible();
    await expect(page.getByRole("button", { name: "Replay callback" })).toHaveCount(0);
  });

  test("unknown callback rows render the not-found state", async ({ page }) => {
    await page.goto("/en/webhooks/whk_nope");
    await expect(page.getByText("Webhook event not found")).toBeVisible();
  });

  test("simulating a callback round-trips into the log", async ({ page }) => {
    await page.goto("/en/webhooks?simulate=1");
    await expect(page.getByRole("dialog")).toContainText("Simulate a webhook callback");

    await page.getByLabel("Event type").selectOption("invoice.paid");
    await page.getByRole("button", { name: "Send callback" }).click();

    // Success panel with the server-generated event id; the deep-link param
    // is removed on Done.
    await expect(page.getByRole("dialog")).toContainText("Callback recorded");
    const eventId = (await page.getByRole("dialog").getByText(/^evt_\w+$/).innerText()).trim();
    expect(eventId).toMatch(/^evt_/);

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).not.toHaveURL(/simulate=1/);

    // The new event is first in the log (receivedAt desc), handled, searchable.
    await expect(page.getByText("8 events")).toBeVisible();
    await page.locator('input[aria-label="Search callbacks"]').fill(eventId);
    await expect(page.getByText("1 event")).toBeVisible();
    await expect(page.locator("tbody").getByText("invoice.paid", { exact: true })).toBeVisible();
  });

  test("replaying a callback logs the idempotent duplicate", async ({ page }) => {
    await page.goto("/en/webhooks/whk_seed_1");
    await expect(page.getByText("This callback was received")).toBeVisible();

    await page.getByRole("button", { name: "Replay callback" }).click();
    await expect(page.getByText(/logged as a duplicate/)).toBeVisible();

    // The log gained a Duplicated row for the same event id — 9 events total.
    await page.goto("/en/webhooks");
    await expect(page.getByText("9 events")).toBeVisible();
    await page.locator('input[aria-label="Search callbacks"]').fill("evt_a1b2c3d4");
    await expect(page.getByText("3 events")).toBeVisible();
    await expect(page.locator("tbody").getByText("Duplicated", { exact: true })).toHaveCount(2);
  });
});
