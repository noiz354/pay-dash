// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasPermission } from "@/domain/organization/roles";
import { OrgContextError } from "@/server/services/org-context";
import { addBlocklist, listBlocklist } from "@/server/data/blocklist";
import { addBlocklistAction, removeBlocklistAction } from "./blocklist";

/**
 * Audit finding S-02 — the fraud blocklist could be edited by anyone who could
 * reach the endpoint.
 *
 * The two directions fail differently. `addBlocklistAction` blocks an arbitrary
 * card, email domain or IP, so a caller could block legitimate customers and
 * produce declines that look like a provider outage — support investigates the
 * provider while the real cause is a form post. `removeBlocklistAction` is worse
 * in the other direction: it un-blocks a known fraudster, letting a card that
 * screening had already caught back through.
 *
 * Gated behind `risk.manage` — the permission added while closing the risk
 * actions — because the blocklist is fraud tooling and belongs with the ruleset,
 * not with merchant settings. `settings.manage` would have been OWNER-only and
 * locked out RISK_ANALYST, the one role whose job this is.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireStrict = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/session-org-context", () => ({
  requireStrictOrgContext: requireStrict,
}));

function asRole(roles: string[]) {
  requireStrict.mockResolvedValue({
    organizationId: "org_alpha",
    roles,
    userId: "user_caller",
    isDemoFallback: false,
  });
}

function signedOut() {
  requireStrict.mockRejectedValue(
    new OrgContextError("FORBIDDEN", "Authentication required — please sign in."),
  );
}

function lackingPermission() {
  requireStrict.mockRejectedValue(
    new OrgContextError("FORBIDDEN", "Actor is not authorized for risk.manage in org_alpha"),
  );
}

function resetStore() {
  (globalThis as unknown as { __kineticBlocklistStore?: unknown }).__kineticBlocklistStore =
    undefined;
}

async function ids() {
  return (await listBlocklist({ pageSize: 100 })).rows.map((r) => r.id);
}

function addForm() {
  const fd = new FormData();
  fd.set("type", "EMAIL");
  fd.set("value", "authz-probe.example");
  fd.set("reason", "MANUAL_ENTRY");
  return fd;
}

function idForm(id: string) {
  const fd = new FormData();
  fd.set("id", id);
  return fd;
}

beforeEach(() => {
  resetStore();
  requireStrict.mockReset();
  asRole(["OWNER"]);
});

describe("S-02 — the blocklist demands risk.manage", () => {
  it.each([
    { name: "addBlocklistAction", run: () => addBlocklistAction(undefined, addForm()) },
    { name: "removeBlocklistAction", run: () => removeBlocklistAction(undefined, idForm("bl_x")) },
  ])("$name authorizes risk.manage", async ({ run }) => {
    await run();
    expect(requireStrict).toHaveBeenCalledWith("risk.manage");
  });

  it("is reachable by the role that does fraud work", () => {
    expect(hasPermission("RISK_ANALYST", "risk.manage")).toBe(true);
    expect(hasPermission("OWNER", "risk.manage")).toBe(true);
    // A support agent must not be able to un-block a fraudster.
    expect(hasPermission("SUPPORT", "risk.manage")).toBe(false);
  });
});

describe("S-02 — a signed-out caller cannot edit the blocklist", () => {
  it("refuses to add an entry", async () => {
    const before = await ids();
    signedOut();

    const state = await addBlocklistAction(undefined, addForm());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Sign in to manage the blocklist/i);
    expect(await ids()).toEqual(before);
  });

  it("refuses to un-block an existing entry", async () => {
    const before = await ids();
    expect(before.length).toBeGreaterThan(0);
    signedOut();

    const state = await removeBlocklistAction(undefined, idForm(before[0]));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Sign in to manage the blocklist/i);
    expect(await ids()).toEqual(before);
  });
});

describe("S-02 — a caller without risk.manage cannot edit the blocklist", () => {
  it("refuses to add an entry", async () => {
    const before = await ids();
    lackingPermission();

    const state = await addBlocklistAction(undefined, addForm());

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/don't have permission to manage the blocklist/i);
    expect(await ids()).toEqual(before);
  });

  it("refuses to un-block an existing entry", async () => {
    const before = await ids();
    lackingPermission();

    const state = await removeBlocklistAction(undefined, idForm(before[0]));

    expect(state.status).toBe("error");
    expect(state.message).toMatch(/don't have permission to manage the blocklist/i);
    expect(await ids()).toEqual(before);
  });
});

describe("the denials above are attributable to the guard, not to bad input", () => {
  it("an authorized caller really does add the entry", async () => {
    const before = await ids();
    asRole(["RISK_ANALYST"]);

    const state = await addBlocklistAction(undefined, addForm());

    expect(state.status).toBe("success");
    expect(await ids()).toHaveLength(before.length + 1);
  });

  it("an authorized caller really does remove it", async () => {
    // Seed through the store so the id is valid and the entry is genuinely
    // removable — otherwise a denial and a miss would look identical.
    const before = await ids();
    await addBlocklist({ type: "EMAIL", value: "seeded.example", reason: "MANUAL_ENTRY" });
    const seeded = (await ids()).find((id) => !before.includes(id)) ?? "";
    expect(seeded).not.toBe("");
    asRole(["RISK_ANALYST"]);

    const state = await removeBlocklistAction(undefined, idForm(seeded));

    expect(state.status).toBe("success");
    expect(await ids()).not.toContain(seeded);
  });
});
