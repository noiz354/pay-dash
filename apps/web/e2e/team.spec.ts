import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Team journey (ADR-0022): the page serves the app's own member store (six
// members on the merchant's own @acmecorp.com domain — five active, one open
// invite), search/role filters are URL state, bulk selection is real, the
// Add Member dialog creates a real invite under Pending Invites, Resend and
// Revoke work, and Export downloads the members CSV. The prototype's
// @ledger.com directory, its unreachable "0 selected" bar, its "1 to 4 of 24"
// pagination and its placeholder tabs (including the Invited-vs-"no pending
// invitations" contradiction) must be gone.
test.describe.configure({ mode: "serial" });

test.describe("Team", () => {
  test("serves the real member store, not the invented directory", async ({ page }) => {
    await page.goto("/en/team");
    await expect(page.getByRole("heading", { name: /Team & Permissions/ })).toBeVisible();

    // The prototype's invented artifacts are gone.
    await expect(page.getByText("ledger.com")).toHaveCount(0);
    await expect(page.getByText("ledgerscale.io")).toHaveCount(0);
    await expect(page.getByText("0 selected")).toHaveCount(0);
    await expect(page.getByText("24")).toHaveCount(0);

    // The real store: merchant domain, derived counts. The one invite lives
    // under Pending Invites, so the Members tab counts five.
    await expect(page.getByText("5 members")).toBeVisible();
    await expect(page.getByText("Daniel Wirawan")).toBeVisible();
    await expect(page.getByText("daniel@acmecorp.com")).toBeVisible();
    // Invites live in Pending Invites, not as a ghost member row.
    await expect(page.getByRole("tab", { name: "Pending Invites" })).toBeVisible();
  });

  test("pending invites tab is derived and agrees with the store", async ({ page }) => {
    await page.goto("/en/team");
    await page.getByRole("tab", { name: "Pending Invites" }).click();
    await expect(page.getByText("Elena Jenkins")).toBeVisible();
    await expect(page.getByText("elena.j@acmecorp.com")).toBeVisible();
    await expect(page.getByText("Risk Analyst")).toBeVisible();
    await expect(page.getByRole("button", { name: "Resend" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Revoke" })).toBeVisible();
    // Elena is not also listed as a member row.
    await page.getByRole("tab", { name: "Members" }).click();
    await expect(page.locator("tr", { hasText: "Elena Jenkins" })).toHaveCount(0);
  });

  test("search and role filter narrow the members tab via URL state", async ({ page }) => {
    await page.goto("/en/team");
    await expect(page.getByText("5 members")).toBeVisible();

    await page.getByLabel("Filter members").fill("chen");
    await expect(page.getByText("Michael Chen")).toBeVisible();
    await expect(page.getByText("Daniel Wirawan")).toHaveCount(0);
    await expect(page).toHaveURL(/q=chen/);

    await page.getByRole("button", { name: "Clear (1)" }).click();
    await expect(page.getByText("5 members")).toBeVisible();

    await page.getByLabel("Filter by role").selectOption("DEVELOPER");
    await expect(page.getByText("Michael Chen")).toBeVisible();
    await expect(page.getByText("Priya Nair")).toBeVisible();
    await expect(page.getByText("Daniel Wirawan")).toHaveCount(0);
    await expect(page).toHaveURL(/role=DEVELOPER/);
  });

  test("add member creates a real invite; revoke and resend work", async ({ page }) => {
    await page.goto("/en/team");
    await page.getByRole("button", { name: "Add Member" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByLabel("Full name").fill("Anna Wijaya");
    await page.getByLabel("Email").fill("anna@acmecorp.com");
    await page.getByRole("button", { name: "Send invite" }).click();

    await expect(page.getByText("Invite sent")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    // The invite appears under Pending Invites.
    await page.getByRole("tab", { name: "Pending Invites" }).click();
    await expect(page.getByText("Anna Wijaya")).toBeVisible();

    // Revoke it — it disappears, the seeded invite stays.
    const annaRow = page.locator("li", { hasText: "Anna Wijaya" });
    await annaRow.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText("Anna Wijaya")).toHaveCount(0);
    await expect(page.getByText("Elena Jenkins")).toBeVisible();

    // Resend the seeded invite — real action, real feedback.
    await page.getByRole("button", { name: "Resend" }).first().click();
    await expect(page.getByText("Invite re-sent to elena.j@acmecorp.com.")).toBeVisible();
  });

  test("bulk selection drives real Change Role and Deactivate", async ({ page }) => {
    await page.goto("/en/team");

    await page.getByLabel("Select Michael Chen").check();
    await page.getByLabel("Select Priya Nair").check();
    await expect(page.getByText("2 selected")).toBeVisible();

    await page.getByLabel("Bulk change role to").selectOption("ADMIN");
    await page.getByRole("button", { name: "Change Role" }).click();
    await expect(page.getByText("Role updated for 2 members.")).toBeVisible();
    await expect(
      page.locator("tr", { hasText: "Michael Chen" }).getByText("Admin")
    ).toBeVisible();

    // Deactivate one member, then reactivate from the row menu.
    await page.getByLabel("Select Sarah Anderson").check();
    await page.getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText("Member deactivated.")).toBeVisible();
    const sarahRow = page.locator("tr", { hasText: "Sarah Anderson" });
    await expect(sarahRow.getByText("Deactivated")).toBeVisible();

    await sarahRow.getByRole("button", { name: "Actions for Sarah Anderson" }).click();
    await expect(page.getByText("Reactivate")).toBeVisible();
    await page.getByText("Reactivate").click();
    await expect(page.getByText("Sarah Anderson reactivated.")).toBeVisible();
    await expect(sarahRow.getByText("Active")).toBeVisible();
  });

  test("roles tab is a real catalog with derived member counts", async ({ page }) => {
    await page.goto("/en/team");
    await page.getByRole("tab", { name: "Roles" }).click();

    await expect(page.getByText("Full access to the dashboard, including team and merchant settings.")).toBeVisible();
    await expect(page.getByText("Webhooks & API keys")).toBeVisible();
    await expect(page.getByText("Risk, fraud and blocklist operations.")).toBeVisible();
    // The catalog has exactly four role rows (scoped — other tabs keep their
    // tables mounted but hidden).
    const roleTable = page.locator("table", {
      hasText: "Risk, fraud and blocklist operations.",
    });
    expect(await roleTable.locator("tbody tr").count()).toBe(4);
  });

  test("export downloads the members csv", async ({ page }) => {
    await page.goto("/en/team");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^team-\d{4}-\d{2}-\d{2}\.csv$/);

    const content = readFileSync(await download.path(), "utf8").trim();
    const [header, ...body] = content.split("\n");
    expect(header).toBe("id,name,email,role,status,joined_at,invited_at,last_active_at");
    expect(body.length).toBeGreaterThanOrEqual(5);
    for (const line of body) {
      expect(line.startsWith("mem_")).toBe(true);
      expect(line).toContain("@acmecorp.com");
    }
  });
});
