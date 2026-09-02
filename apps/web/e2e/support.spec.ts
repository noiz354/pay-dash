import { expect, test } from "@playwright/test";

// Support hub (ADR-0016): static by design (INTEGRATION.md — "no API"), so the
// contract is that every affordance is real: topic cards route into the app,
// the status widget points at /system, the contact button is a mailto — and
// the ?ref deep-link from the transaction "Report issue" actions is honoured
// (banner + pre-filled subject).
test.describe("Support", () => {
  test("no dead links or dead buttons remain", async ({ page }) => {
    await page.goto("/en/support");
    await expect(page.getByRole("heading", { name: /Support/ })).toBeVisible();

    // The prototype's seven dead affordances are gone.
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
    await expect(page.getByText("Live Chat")).toHaveCount(0);
    await expect(page.getByText("Ticket History")).toHaveCount(0);
    await expect(page.getByLabel("Search knowledge base")).toHaveCount(0);
    // No invented subsystem statuses.
    await expect(page.getByText("Settlement Engine")).toHaveCount(0);
    await expect(page.getByText("API Gateway")).toHaveCount(0);
  });

  test("topic cards route to the pages that actually cover them", async ({ page }) => {
    await page.goto("/en/support");
    await expect(page.getByRole("link", { name: /API Reference/ })).toHaveAttribute(
      "href",
      /\/en\/settings\/api-keys/
    );
    await expect(page.getByRole("link", { name: /Settlement Guide/ })).toHaveAttribute(
      "href",
      /\/en\/payouts/
    );
    await expect(page.getByRole("link", { name: /KYC Requirements/ })).toHaveAttribute(
      "href",
      /\/en\/kyc/
    );
    await expect(page.getByRole("link", { name: /Reporting & Export/ })).toHaveAttribute(
      "href",
      /\/en\/reports\/builder/
    );
  });

  test("status and contact point at real destinations", async ({ page }) => {
    await page.goto("/en/support");
    await expect(page.getByRole("link", { name: "View detailed status" })).toHaveAttribute(
      "href",
      /\/en\/system/
    );
    const email = page.getByRole("link", { name: /Email support/ });
    await expect(email).toHaveAttribute("href", /mailto:support@kinetic\.test\?subject=/);
  });

  test("a ?ref deep-link shows the context and pre-fills the subject", async ({ page }) => {
    await page.goto("/en/support?ref=txn_abc123");
    await expect(page.getByText("You’re reporting on")).toBeVisible();
    await expect(page.getByText("txn_abc123")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Email support/ })
    ).toHaveAttribute("href", /subject=.*txn_abc123/);
  });

  test("without a reference the mailto is plain", async ({ page }) => {
    await page.goto("/en/support");
    await expect(page.getByText("You’re reporting on")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Email support/ })).toHaveAttribute(
      "href",
      /mailto:support@kinetic\.test\?subject=.*support%20request/
    );
  });
});
