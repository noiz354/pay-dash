import { test, expect } from "@playwright/test";
import { loginAs, waitForLoadingComplete } from "../test-utils";
import { findTransaction, expectToast } from "./helpers";

// Gate 5 — the 409 conflict-recovery journey (CMP-020) with a REAL race: two
// tabs render the same failed payment, tab A retries successfully (the row's
// updatedAt moves server-side), tab B — still showing the stale version —
// retries and is refused with the conflict dialog. B reviews the *latest*
// server state (status now PROCESSING, not the FAILED it rendered), then an
// explicit retry against that reviewed version succeeds. Nothing is ever
// auto-applied.

test.describe("Wave 4 gate 5 — 409 → review latest → retry", () => {
  test("a raced retry opens the conflict dialog and recovers after review", async ({ page, context }) => {
    await loginAs(page, "rina");
    const txnId = await findTransaction(page, async (p) => (await p.getByTestId("retry-payment-button").count()) > 0, "?status=FAILED");

    // Tab B renders the same row BEFORE it changes.
    const pageB = await context.newPage();
    await pageB.goto(`/en/transactions/${txnId}`);
    await waitForLoadingComplete(pageB);

    // Tab A retries successfully — the server-side updatedAt moves.
    await page.getByTestId("retry-payment-button").click();
    await expectToast(page, "Payment re-submitted to the processor");

    // Tab B's version is now stale: the server refuses with the conflict.
    await pageB.getByTestId("retry-payment-button").click();
    const dialog = pageB.getByRole("dialog");
    await dialog.waitFor();
    await expect(dialog).toContainText("Data Conflict Detected");
    await expect(dialog).toContainText("modified by someone else");
    // The dialog shows the LATEST server state — PROCESSING, not the FAILED
    // this tab rendered — so the review is real information, not a re-showing.
    await expect(dialog).toContainText("PROCESSING");

    // Review done: the explicit retry re-sends against the reviewed version.
    await dialog.getByRole("button", { name: /retry with latest/i }).click();
    await expectToast(pageB, "Payment re-submitted to the processor");
    await expect(pageB.getByRole("dialog")).toHaveCount(0);
  });
});
