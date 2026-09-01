import { expect, test } from "@playwright/test";

// Settings journey: hub → each section → the mutations that used to be inert.
test.describe("Settings", () => {
  test("the hub lists every section with live status", async ({ page }) => {
    await page.goto("/en/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    for (const title of ["Merchant Profile", "Notification Preferences", "API Keys", "Developer"]) {
      await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
    }
  });

  test("hub cards route into their section", async ({ page }) => {
    await page.goto("/en/settings");
    await page.getByRole("link", { name: /Merchant Profile/ }).first().click();
    await expect(page).toHaveURL(/\/en\/settings\/merchant/);
    await expect(page.getByRole("heading", { name: "Merchant Profile", level: 1 })).toBeVisible();
  });

  test("the settings breadcrumb goes back to the hub instead of nowhere", async ({ page }) => {
    await page.goto("/en/settings/notifications");
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/en\/settings$/);
  });

  test("merchant save button stays disabled until the form is dirty", async ({ page }) => {
    await page.goto("/en/settings/merchant");
    const save = page.getByRole("button", { name: "Save Changes" });
    await expect(save).toBeDisabled();
    await page.getByLabel("Doing Business As").fill("Acme Pay");
    await expect(save).toBeEnabled();
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    await save.click();
    await expect(page.getByText("Merchant profile saved.")).toBeVisible();
  });

  test("cancel restores the last saved values", async ({ page }) => {
    await page.goto("/en/settings/merchant");
    const dba = page.getByLabel("Doing Business As");
    const original = await dba.inputValue();
    await dba.fill("Temporary");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(dba).toHaveValue(original);
  });

  test("an invalid brand colour is flagged inline", async ({ page }) => {
    await page.goto("/en/settings/merchant");
    await page.getByLabel("Primary Brand Color").fill("not-a-colour");
    await expect(page.getByText("Use a hex colour such as #1a56db")).toBeVisible();
  });

  test("notification switches persist optimistically", async ({ page }) => {
    await page.goto("/en/settings/notifications");
    await page.getByLabel("SMS Alerts").click();
    await expect(page.getByText(/sms notifications (enabled|paused)/i)).toBeVisible();
  });

  test("critical alerts cannot be silenced", async ({ page }) => {
    await page.goto("/en/settings/notifications");
    await expect(page.getByLabel("Disputes & Chargebacks email frequency")).toBeDisabled();
  });

  test("creating a key reveals the secret exactly once", async ({ page }) => {
    await page.goto("/en/settings/api-keys");
    await page.getByRole("button", { name: "Generate New Key" }).click();
    await page.getByLabel("Key name").fill("Playwright key");
    await page.getByLabel(/I understand the secret is shown once/).click();
    await page.getByRole("button", { name: "Create key" }).click();
    await expect(page.getByTestId("secret-value")).toBeVisible();
    await page.getByRole("button", { name: "I have stored it safely" }).click();
    await expect(page.getByTestId("secret-value")).toHaveCount(0);
    await expect(page.getByText("Playwright key")).toBeVisible();
  });

  test("revoking requires an explicit confirmation", async ({ page }) => {
    await page.goto("/en/settings/api-keys");
    await page.getByRole("button", { name: "More actions for Production Main" }).click();
    await page.getByRole("menuitem", { name: "Revoke key…" }).click();
    const confirm = page.getByRole("button", { name: "Revoke key" });
    await expect(confirm).toBeDisabled();
    await page.getByRole("checkbox").last().click();
    await expect(confirm).toBeEnabled();
  });

  test("the IP allowlist validates before the Add button unlocks", async ({ page }) => {
    await page.goto("/en/settings/developer");
    const add = page.getByRole("button", { name: "Add" });
    await expect(add).toBeDisabled();
    await page.getByLabel("IP address or CIDR").fill("999.1.1.1");
    await expect(page.getByText(/Enter an IPv4 address or CIDR block/)).toBeVisible();
    await page.getByLabel("IP address or CIDR").fill("192.0.2.55");
    await expect(add).toBeEnabled();
    await add.click();
    await expect(page.getByText("192.0.2.55")).toBeVisible();
  });

  test("the developer docs card no longer points at #", async ({ page }) => {
    await page.goto("/en/settings/developer");
    await page.getByRole("link", { name: /API Documentation/ }).click();
    await expect(page).toHaveURL(/\/en\/support/);
  });
});
