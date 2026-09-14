// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PERMISSIONS, ROLE_PERMISSIONS, hasPermission } from "@/domain/organization/roles";
import { OrgContextError } from "@/server/services/org-context";
import { getRiskOverview } from "@/server/data/risk";
import {
  deployRiskAction,
  discardDraftAction,
  saveVolumeDraftAction,
  setVolumeEnabledAction,
  toggleRuleAction,
} from "./risk";

/**
 * Audit finding S-02 — the five risk actions had no authorization at all.
 *
 * `setVolumeEnabledAction` switches volume screening off, `toggleRuleAction`
 * disables an individual fraud rule, and `deployRiskAction` pushes a draft
 * ruleset live. Reachable meant an attacker could disable fraud screening before
 * running a stolen-card batch through money-in, and the draft actions let them
 * stage it first so the deploy looked ordinary.
 *
 * These tests also lock the *role* decision made while fixing it. Gating fraud
 * configuration behind the existing `settings.manage` would have been the easy
 * change and the wrong one: it is OWNER-only, so RISK_ANALYST — the one role
 * whose job this is — would have been locked out of it. A new `risk.manage`
 * permission is granted to OWNER and RISK_ANALYST instead.
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
  (globalThis as unknown as { __kineticRiskStore?: unknown }).__kineticRiskStore = undefined;
}

function volumeForm(enabled: string) {
  const fd = new FormData();
  fd.set("enabled", enabled);
  return fd;
}

function draftForm() {
  const fd = new FormData();
  fd.set("dailyVolumeLimit", "1000000");
  fd.set("monthlyVolumeLimit", "20000000");
  return fd;
}

function ruleForm(id: string) {
  const fd = new FormData();
  fd.set("id", id);
  return fd;
}

type GatedAction = {
  name: string;
  invoke: (form: FormData) => Promise<{ status: string; message: string; data?: unknown }>;
  form: () => FormData;
};

const ALL_FIVE: GatedAction[] = [
  { name: "saveVolumeDraftAction", invoke: (f) => saveVolumeDraftAction(undefined, f), form: draftForm },
  { name: "setVolumeEnabledAction", invoke: (f) => setVolumeEnabledAction(undefined, f), form: () => volumeForm("false") },
  { name: "toggleRuleAction", invoke: (f) => toggleRuleAction(undefined, f), form: () => ruleForm("rule_velocity") },
  { name: "deployRiskAction", invoke: (f) => deployRiskAction(undefined, f), form: () => new FormData() },
  { name: "discardDraftAction", invoke: (f) => discardDraftAction(undefined, f), form: () => new FormData() },
];

beforeEach(() => {
  resetStore();
  requireStrict.mockReset();
  asRole(["OWNER"]);
});

describe("risk.manage exists and is granted by duty, not by proximity", () => {
  it("is in the catalogue", () => {
    expect(PERMISSIONS).toContain("risk.manage");
  });

  it("is held by OWNER and RISK_ANALYST", () => {
    expect(hasPermission("OWNER", "risk.manage")).toBe(true);
    // The point of adding the permission: the analyst who does this job keeps it.
    expect(hasPermission("RISK_ANALYST", "risk.manage")).toBe(true);
  });

  it("is not held by roles that have no fraud-prevention duty", () => {
    for (const role of ["FINANCE_ADMIN", "FINANCE_OPERATOR", "DEVELOPER", "ANALYST", "COMPLIANCE_ANALYST", "SUPPORT"] as const) {
      expect(hasPermission(role, "risk.manage"), role).toBe(false);
    }
  });

  it("was not added by widening an existing role's rights", () => {
    // Guard against the lazy version of this fix: `risk.manage` must be a new
    // grant, not `settings.manage` reused, and no role may have gained anything
    // else as a side effect.
    expect(ROLE_PERMISSIONS.RISK_ANALYST).toEqual([
      "customer.read",
      "transaction.read",
      "audit.read",
      "report.export",
      "risk.manage",
    ]);
    expect(ROLE_PERMISSIONS.SUPPORT).not.toContain("settings.manage");
  });
});

describe("every risk action demands risk.manage", () => {
  it.each(ALL_FIVE)("$name authorizes risk.manage", async ({ invoke, form }) => {
    await invoke(form());
    expect(requireStrict).toHaveBeenCalledWith("risk.manage");
  });
});

describe("S-02 — a signed-out caller cannot weaken fraud screening", () => {
  it("refuses all five and leaves the ruleset untouched", async () => {
    const before = await getRiskOverview();
    signedOut();

    for (const { name, invoke, form } of ALL_FIVE) {
      const state = await invoke(form());
      expect(state.status, name).toBe("error");
      expect(state.message, name).toMatch(/Sign in to manage risk rules/i);
    }

    const after = await getRiskOverview();
    expect(after.deployed).toEqual(before.deployed);
    expect(after.effective).toEqual(before.effective);
    expect(after.draft).toEqual(before.draft);
  });

  it("cannot switch volume screening off", async () => {
    const before = await getRiskOverview();
    signedOut();

    const state = await setVolumeEnabledAction(undefined, volumeForm("false"));
    expect(state.status).toBe("error");
    expect((await getRiskOverview()).effective).toEqual(before.effective);
  });

  it("authorizes before validating, so an unauthorized caller cannot probe the schema", async () => {
    signedOut();
    // Empty payloads would fail every check in the file; the caller must still
    // see only the authorization answer.
    const state = await saveVolumeDraftAction(undefined, new FormData());
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Sign in to manage risk rules/i);
    expect(state.message).not.toMatch(/daily volume limit/i);
  });
});

describe("S-02 — an authenticated role without the duty cannot weaken fraud screening", () => {
  it("refuses FINANCE_ADMIN, which holds money permissions but not this one", async () => {
    const before = await getRiskOverview();
    lackingPermission();

    for (const { name, invoke, form } of ALL_FIVE) {
      const state = await invoke(form());
      expect(state.status, name).toBe("error");
      expect(state.message, name).toMatch(/don't have permission to manage risk rules/i);
    }

    const after = await getRiskOverview();
    expect(after.deployed).toEqual(before.deployed);
    expect(after.draft).toEqual(before.draft);
  });

  it("cannot deploy a staged draft", async () => {
    const before = await getRiskOverview();
    lackingPermission();

    const state = await deployRiskAction(undefined, new FormData());
    expect(state.status).toBe("error");
    expect((await getRiskOverview()).deployedAt).toBe(before.deployedAt);
  });
});

describe("the roles that hold risk.manage still get working controls", () => {
  it("lets a RISK_ANALYST stage and discard a draft", async () => {
    asRole(["RISK_ANALYST"]);

    const staged = await saveVolumeDraftAction(undefined, draftForm());
    expect(staged.status).toBe("success");
    expect((await getRiskOverview()).draft).not.toBeNull();

    const discarded = await discardDraftAction(undefined, new FormData());
    expect(discarded.status).toBe("success");
    expect((await getRiskOverview()).draft).toBeNull();
  });

  it("lets a RISK_ANALYST toggle volume screening", async () => {
    asRole(["RISK_ANALYST"]);
    const before = await getRiskOverview();

    // The field is `volumeLimitsEnabled`; toggling to the *same* state is
    // refused with "Already in that state.", so flip it.
    const state = await setVolumeEnabledAction(
      undefined,
      volumeForm(String(!before.effective.volumeLimitsEnabled)),
    );
    expect(state.status).toBe("success");
    expect((await getRiskOverview()).effective.volumeLimitsEnabled).toBe(!before.effective.volumeLimitsEnabled);
  });

  it("lets an OWNER deploy", async () => {
    asRole(["OWNER"]);
    expect((await saveVolumeDraftAction(undefined, draftForm())).status).toBe("success");

    const state = await deployRiskAction(undefined, new FormData());
    expect(state.status).toBe("success");
  });

  it("still validates input after authorizing", async () => {
    asRole(["RISK_ANALYST"]);
    const fd = draftForm();
    fd.set("monthlyVolumeLimit", "1"); // below the daily cap

    const state = await saveVolumeDraftAction(undefined, fd);
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/monthly cap must be at least the daily cap/i);
  });
});
