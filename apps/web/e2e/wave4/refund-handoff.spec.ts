import { test, expect } from "@playwright/test";
import { loginAs, waitForLoadingComplete } from "../test-utils";
import { findTransaction, expectToast } from "./helpers";

// Gate 1 — the cross-role handoff journey (JRN-003, spec §9) through the real
// UI: Role A requests a refund, the request surfaces in the shareable
// dual-control queue, Role B approves, and both actors end up on the
// transaction timeline. This is the journey that was previously impossible —
// the server actions existed but nothing rendered them.

test.describe("Wave 4 gate 1 — cross-role refund handoff (JRN-003)", () => {
  test("Role A requests → queue → Role B approves → dual-actor timeline", async ({ page }) => {
    test.setTimeout(240_000);

    // --- Role A: agus (SUPPORT, refund.prepare) initiates on a clean payment.
    await loginAs(page, "agus");
    const txnId = await findTransaction(page, async (p) => {
      const button = p.getByTestId("refund-request-button");
      return (await button.count()) > 0 && (await button.getAttribute("aria-disabled")) !== "true";
    }, "?status=SUCCEEDED");

    await page.getByTestId("refund-request-button").click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByLabel("Reason").fill("Duplicate charge — E2E gate 1");
    await dialog.getByRole("button", { name: "Request refund" }).click();
    await expectToast(page, "Refund requested");

    // The state machine advanced and the requester is already told they cannot
    // be their own approver (BE-002 mirrored as copy).
    await expect(page.getByTestId("refund-state-awaiting_approval")).toBeVisible();
    await expect(page.getByTestId("refund-decision-panel")).toBeVisible();
    await expect(page.getByTestId("refund-decision-panel")).toContainText("persona_agus");
    await expect(page.getByTestId("refund-self-block")).toBeVisible();

    // --- The request surfaces in the shareable dual-control queue.
    await page.goto("/en/transactions?refundState=AWAITING_APPROVAL");
    await waitForLoadingComplete(page);
    await expect(page.getByRole("listitem").filter({ hasText: "Refund: Awaiting approval" })).toBeVisible();
    await expect(page.locator(`a[href*="/transactions/${txnId}"]`).first()).toBeVisible();

    // --- Role B: hendri (FINANCE_ADMIN, refund.execute) approves.
    await loginAs(page, "hendri", `/en/transactions/${txnId}`);
    await expect(page.getByTestId("refund-approve")).toBeVisible();
    await page.getByTestId("refund-approve").click();
    await expectToast(page, "Refund approved and issued");
    await expect(page.getByTestId("refund-state-approved")).toBeVisible();

    // Both actors are recorded on the canonical timeline — dual control is
    // auditable from the UI alone.
    await expect(page.getByText(/requested by persona_agus/)).toBeVisible();
    await expect(page.getByText(/approved by persona_hendri/)).toBeVisible();
  });
});
