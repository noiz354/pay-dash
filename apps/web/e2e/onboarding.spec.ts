import { expect, test } from "@playwright/test";

// Onboarding journey (ADR-0025): the checklist is DERIVED from the stores
// that own each fact (merchant profile, payout bank accounts, API keys,
// webhook callback log, ledger, KYC submission). The hard-coded "75% / 3 of
// 4", the invented ****4592, "Oct 24", "Verified by system" and the four
// dead buttons are gone; the compliance review is shown but not claimed.
test.describe.configure({ mode: "serial" });

test.describe("Sub-Merchant Onboarding", () => {
  test("progress is derived from the real stores, not hard-coded", async ({ page }) => {
    await page.goto("/en/onboarding");
    await expect(page.getByRole("heading", { name: /Sub-Merchant Onboarding/ })).toBeVisible();

    // The invented prototype artifacts are gone.
    await expect(page.getByText("75%")).toHaveCount(0);
    await expect(page.getByText("3 of 4 sections completed")).toHaveCount(0);
    await expect(page.getByText(/4592/)).toHaveCount(0);
    await expect(page.getByText(/Oct 24/)).toHaveCount(0);
    await expect(page.getByText("Acme Corp Setup")).toHaveCount(0);
    await expect(page.getByText("Verified by system")).toHaveCount(0);
    await expect(page.getByText(/Signed & uploaded/)).toHaveCount(0);

    // The derived world: real merchant name, 3 app-owned sections complete.
    await expect(page.getByText("Acme Corporation LLC").first()).toBeVisible();
    await expect(page.getByText("3 of 3 sections completed")).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();
  });

  test("technical section states the real API keys, webhook log and ledger", async ({ page }) => {
    await page.goto("/en/onboarding");

    await expect(page.getByText("3 keys on file · 2 live, 1 sandbox")).toBeVisible();
    await expect(page.getByText("7 callback events received")).toBeVisible();
    await expect(page.getByText("33 successful transactions settled")).toBeVisible();
    // Completed items are no longer struck through.
    await expect(page.getByText("API keys generated")).not.toHaveClass(/line-through/);
  });

  test("bank section shows the real destination account", async ({ page }) => {
    await page.goto("/en/onboarding");

    await expect(page.getByText("Bank Central Asia · **** 1234 (default)")).toBeVisible();
    await expect(page.getByText("2 of 3 accounts verified")).toBeVisible();
    await expect(page.getByText(/4592/)).toHaveCount(0);
  });

  test("compliance card states what the app cannot claim", async ({ page }) => {
    await page.goto("/en/onboarding");

    // Unseeded KYC world: basic info complete, document not submitted.
    await expect(page.getByText("ACTION REQUIRED")).toBeVisible();
    await expect(page.getByText("Not yet submitted")).toBeVisible();
    await expect(page.getByText(/conducted by the compliance team/)).toBeVisible();
    await expect(page.getByText(/not visible in this app/)).toBeVisible();
    // The app-owned progress is not dragged down by the review.
    await expect(page.getByText("3 of 3 sections completed")).toBeVisible();
  });

  test("every card CTA is a real link to the page that owns the fact", async ({ page }) => {
    await page.goto("/en/onboarding");
    await page.getByRole("link", { name: "Review Details" }).click();
    await expect(page).toHaveURL(/settings\/merchant/);

    await page.goto("/en/onboarding");
    await page.getByRole("link", { name: "Manage Accounts" }).click();
    await expect(page).toHaveURL(/payouts\/settings/);

    await page.goto("/en/onboarding");
    await page.getByRole("link", { name: "Go to Developer Dashboard" }).click();
    await expect(page).toHaveURL(/settings\/developer/);

    await page.goto("/en/onboarding");
    await page.getByRole("link", { name: "View Documents" }).click();
    await expect(page).toHaveURL(/kyc/);
  });
});
