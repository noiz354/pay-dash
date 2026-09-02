import { expect, test } from "@playwright/test";

// KYC journey (ADR-0019): step 1 derived from the merchant profile, a real
// upload (file input with onChange, enforced 10 MB / format limits), a real
// submission (stored, timestamped, badge flips to Awaiting review) and a
// working remove. The prototype's hard-coded progress, its acme attachment
// and its no-op Save Draft / Submit Step buttons must be gone.
test.describe.configure({ mode: "serial" });

test.describe("KYC", () => {
  test("starts honest: no invented progress, no acme file, profile-derived step 1", async ({ page }) => {
    await page.goto("/en/kyc");
    await expect(page.getByRole("heading", { name: "Identity Verification" })).toBeVisible();

    // The prototype's invented artifacts are gone.
    await expect(page.getByText("acme_corp_incorporation_2023.pdf")).toHaveCount(0);
    await expect(page.getByText("Delaware, USA")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save Draft" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Submit Step" })).toHaveCount(0);
    await expect(page.getByText("2.4 MB")).toHaveCount(0);

    // Unseeded: the page asks for action.
    await expect(page.getByText("Action required")).toBeVisible();

    // Step 1 is derived from the real merchant profile.
    await expect(page.getByText("Edit profile")).toHaveAttribute("href", /\/en\/settings\/merchant/);
    await expect(page.getByText("1. Basic Info")).toBeVisible();
  });

  test("enforces the stated file limits", async ({ page }) => {
    await page.goto("/en/kyc");
    await page.setInputFiles("input[type=file]", {
      name: "document.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("nope"),
    });
    await expect(page.getByText("Accepted formats: PDF, JPEG or PNG.")).toBeVisible();
  });

  test("upload → submit → awaiting review → remove round trip", async ({ page }) => {
    await page.goto("/en/kyc");

    await page.setInputFiles("input[type=file]", {
      name: "skeleton_akta_perseroan.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("fake-pdf-bytes"),
    });
    await expect(page.getByText("skeleton_akta_perseroan.pdf")).toBeVisible();

    await page.getByLabel("Document Type").selectOption("incorporation");
    await page.getByLabel("Issuing Jurisdiction").fill("Indonesia (KemenkumHAM)");
    await page.getByRole("button", { name: "Submit for review" }).click();

    // The submission is stored and the badge flips.
    await expect(page.getByText("Awaiting review")).toBeVisible();
    // "· submitted" sits in the size line under the stored file name.
    await expect(page.getByText("· submitted")).toBeVisible();
    // The jurisdiction is a controlled input value, not page text.
    await expect(page.getByLabel("Issuing Jurisdiction")).toHaveValue("Indonesia (KemenkumHAM)");

    // The store survives a reload.
    await page.reload();
    await expect(page.getByText("Awaiting review")).toBeVisible();
    await expect(page.getByText("skeleton_akta_perseroan.pdf")).toBeVisible();

    // Remove it — the page returns to the honest blank state.
    await page.getByRole("button", { name: "Remove submission" }).click();
    await expect(page.getByText("Action required")).toBeVisible();
    await expect(page.getByText("skeleton_akta_perseroan.pdf")).toHaveCount(0);
  });
});
