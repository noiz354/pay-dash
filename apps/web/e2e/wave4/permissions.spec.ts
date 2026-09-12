import { test, expect } from "@playwright/test";
import { loginAs } from "../test-utils";
import { findTransaction } from "./helpers";

// Gate 3 — a restricted persona cannot reach a protected action. Two layers
// are proven through the real UI:
//   1. the SERVER refuses: nadia (ANALYST, no money_in.create) clicks the
//      visible retry control and the action's authorization check answers
//      with a denial toast — the backend is the enforcement point, the UI
//      merely being absent would prove nothing;
//   2. the UI does not even offer it: the refund trigger renders disabled
//      with its reason for a viewer without refund permission.

test.describe("Wave 4 gate 3 — restricted persona cannot access protected actions", () => {
  test("server denies a retry from a persona without money_in.create", async ({ page }) => {
    await loginAs(page, "nadia");
    await findTransaction(page, async (p) => (await p.getByTestId("retry-payment-button").count()) > 0, "?status=FAILED");

    await page.getByTestId("retry-payment-button").click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "You don't have permission to retry payments." }).first()).toBeVisible({
      timeout: 25_000,
    });
  });

  test("the refund trigger is disabled with its reason for a persona without refund permission", async ({ page }) => {
    await loginAs(page, "nadia");
    await findTransaction(
      page,
      async (p) => (await p.getByTestId("refund-request-button").count()) > 0,
      "?status=SUCCEEDED",
    );

    const button = page.getByTestId("refund-request-button");
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(button).toHaveAttribute("title", "Requires refund permission");
    // The dialog must not be reachable from the disabled trigger.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
