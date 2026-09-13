// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { OrgContextError } from "@/server/services/org-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { __resetTenantDenials, listTenantDenials } from "@/server/services/tenant-denial";
import { getMember, inviteMember, listMembers } from "@/server/data/team";
import { createApiKey, getApiKey, getMerchantProfile, listApiKeys, updateMerchantProfile } from "@/server/data/settings";
import { getKycSubmission } from "@/server/data/kyc";
import {
  changeRoleAction,
  deactivateAction,
  inviteMemberAction,
  reactivateAction,
  resendInviteAction,
  revokeInviteAction,
} from "./team";
import {
  createApiKeyAction,
  removeIpAllowAction,
  revokeApiKeyAction,
  rollApiKeyAction,
  updateMerchantProfileAction,
} from "./settings";
import { removeKycDocumentAction, submitKycDocumentAction } from "./kyc";

/**
 * Wave 7F Q4.3 — action-level tenant boundary tests for identity & access.
 *
 * The DAL tests prove the repository predicates; these prove the server-action
 * seam resolves the tenant from the session *before* touching a store, that a
 * cross-tenant id answers exactly like an unknown id (no enumeration oracle on
 * the wire), and that the **bulk** team actions scope per row instead of
 * silently re-roling or deactivating another tenant's members.
 *
 * These actions are also the wave's authz finding: before 7F, all six team
 * actions, all nine settings actions and `removeKycDocumentAction` ran with **no
 * authorization at all** — an unauthenticated caller could invite members,
 * change roles (privilege escalation), mint and roll API keys (secret
 * lifecycle) and clear a merchant's KYC record. `submitKycDocumentAction`
 * resolved an org context and then *dropped* it, calling the DAL unscoped — the
 * same defect 7D found in `createSubscriptionAction`.
 *
 * RED on `f7cb1e2`: no ctx, no permission, and a process-wide store behind them.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/platform/platform-service", () => ({
  verifyKycProvider: () => Promise.resolve({ state: "NONE", provider: null }),
}));

const requireStrict = vi.hoisted(() => vi.fn());
const resolveSession = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/session-org-context", () => ({
  resolveSessionOrgContext: resolveSession,
  requireStrictOrgContext: requireStrict,
  requireOrgContext: requireStrict,
}));

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA = parseOrganizationContext({ organizationId: ORG_A });
const ctxB = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

function asOrg(organizationId: string, roles: string[] = ["OWNER"], userId: string | null = "user_a") {
  const ctx = { organizationId, roles, userId, isDemoFallback: false };
  requireStrict.mockResolvedValue(ctx);
  resolveSession.mockResolvedValue(ctx);
}

function noSession() {
  const err = new OrgContextError("FORBIDDEN", "Authentication required — please sign in.");
  requireStrict.mockRejectedValue(err);
  resolveSession.mockRejectedValue(err);
}

function forbiddenRole() {
  const err = new OrgContextError("FORBIDDEN", "Your role cannot perform this action.");
  requireStrict.mockRejectedValue(err);
  resolveSession.mockResolvedValue({ organizationId: ORG_A, roles: ["ANALYST"], userId: "user_a", isDemoFallback: false });
}

beforeEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticTeamStore;
  delete g.__kineticSettingsStore;
  delete g.__kineticKycStore;
  __resetTenantDenials();
  asOrg(ORG_A);
});

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) for (const item of v) fd.append(k, item);
    else fd.set(k, v);
  }
  return fd;
}

const PROFILE_FORM = {
  legalName: "Alpha PT",
  dba: "Alpha",
  address: "Jl. Merdeka 1",
  city: "Batam",
  state: "RI",
  postalCode: "29444",
  taxId: "11-2223334",
  supportEmail: "support@alpha.example",
  statementDescriptor: "ALPHA",
  brandColor: "#1a56db",
  logoUrl: "",
  autoDebit: "on",
};

describe("team actions — tenant-bound, authorized", () => {
  it("inviteMemberAction binds the new member to the session tenant", async () => {
    const out = await inviteMemberAction(undefined, form({ name: "New Person", email: "new@alpha.example", role: "ANALYST" }));
    expect(out.status).toBe("success");

    const created = (await listMembers(ctxA, { pageSize: 100 })).rows.find((m) => m.email === "new@alpha.example");
    expect(created?.organizationId).toBe(ORG_A);
    expect((await listMembers(ctxB, { pageSize: 100 })).rows.some((m) => m.email === "new@alpha.example")).toBe(false);
    expect(requireStrict).toHaveBeenCalledWith("team.manage", expect.anything());
  });

  it("inviteMemberAction fails closed with no session, before any store write", async () => {
    noSession();
    const out = await inviteMemberAction(undefined, form({ name: "Ghost", email: "ghost@alpha.example", role: "ANALYST" }));
    expect(out.status).toBe("error");
    expect((await listMembers(ctxA, { pageSize: 100 })).rows.some((m) => m.email === "ghost@alpha.example")).toBe(false);
  });

  it("a role without team.manage is refused (least privilege, not invention)", async () => {
    forbiddenRole();
    const out = await inviteMemberAction(undefined, form({ name: "Sneaky", email: "sneaky@alpha.example", role: "ADMIN" }));
    expect(out.status).toBe("error");
    expect((await listMembers(ctxA, { pageSize: 100 })).rows.some((m) => m.email === "sneaky@alpha.example")).toBe(false);
  });

  it("validation still runs first: a bad email is a field error, not an auth error", async () => {
    noSession();
    const out = await inviteMemberAction(undefined, form({ name: "No Email", email: "not-an-email", role: "ANALYST" }));
    expect(out.status).toBe("error");
    expect(out.message).toMatch(/valid email/i);
  });

  it("bulk changeRoleAction scopes per row: foreign members are not re-roled", async () => {
    const mine = await inviteMember(ctxA, { name: "Mine", email: "mine@alpha.example", role: "ANALYST" });
    const theirs = await inviteMember(ctxB, { name: "Theirs", email: "theirs@beta.example", role: "ANALYST" });

    const fd = new FormData();
    fd.append("ids", mine.id);
    fd.append("ids", theirs.id);
    fd.set("role", "ADMIN");
    const out = await changeRoleAction(undefined, fd);

    // The honest count: one changed, one not — never a silent success for both.
    expect(out.message).toMatch(/1 member/i);
    expect((await getMember(ctxA, mine.id))?.role).toBe("ADMIN");
    expect((await getMember(ctxB, theirs.id))?.role).toBe("ANALYST");
  });

  it("bulk deactivateAction cannot deactivate another tenant's roster", async () => {
    const theirs = await inviteMember(ctxB, { name: "Theirs", email: "theirs@beta.example", role: "ADMIN" });
    const fd = new FormData();
    fd.append("ids", theirs.id);
    const out = await deactivateAction(undefined, fd);

    expect(out.message).toMatch(/0 members deactivated/i);
    expect((await getMember(ctxB, theirs.id))?.status).toBe("INVITED");
  });

  it.each([
    ["reactivateAction", reactivateAction, { id: "" }],
    ["resendInviteAction", resendInviteAction, { id: "" }],
    ["revokeInviteAction", revokeInviteAction, { id: "" }],
  ] as const)("%s answers a foreign id exactly like an unknown one", async (_name, action, shape) => {
    const theirs = await inviteMember(ctxB, { name: "Theirs", email: "theirs@beta.example", role: "ANALYST" });

    const foreign = await (action as (p: undefined, f: FormData) => Promise<{ status: string; message: string }>)(
      undefined,
      form({ ...shape, id: theirs.id }),
    );
    const unknown = await (action as (p: undefined, f: FormData) => Promise<{ status: string; message: string }>)(
      undefined,
      form({ ...shape, id: "mem_doesnotexist" }),
    );

    expect(foreign.status).toBe("error");
    expect(foreign.message).toBe(unknown.message);
    // The target is untouched, and the refusal is audited rather than silent:
    // one denial for the foreign attempt, none for the unknown id (there is
    // nothing to attribute). `beforeEach` clears the sink, so this row counts
    // its own two calls only.
    expect(await getMember(ctxB, theirs.id)).not.toBeNull();
    expect(listTenantDenials().filter((d) => d.surface.startsWith("server/data/team."))).toHaveLength(1);
  });

  it("own lifecycle actions still work end to end", async () => {
    const mine = await inviteMember(ctxA, { name: "Mine", email: "mine@alpha.example", role: "ANALYST" });
    expect((await resendInviteAction(undefined, form({ id: mine.id }))).status).toBe("success");
    expect((await reactivateAction(undefined, form({ id: mine.id }))).status).toBe("success");
    expect((await getMember(ctxA, mine.id))?.status).toBe("ACTIVE");
    const invited = await inviteMember(ctxA, { name: "Temp", email: "temp@alpha.example", role: "ANALYST" });
    expect((await revokeInviteAction(undefined, form({ id: invited.id }))).status).toBe("success");
    expect(await getMember(ctxA, invited.id)).toBeNull();
  });
});

describe("settings actions — tenant-bound, authorized", () => {
  it("updateMerchantProfileAction writes the session tenant's profile only", async () => {
    await updateMerchantProfile(ctxB, { legalName: "Beta Pte Ltd", taxId: "SG-77" });

    const out = await updateMerchantProfileAction(undefined, form(PROFILE_FORM));
    expect(out.status).toBe("success");
    expect((await getMerchantProfile(ctxA)).legalName).toBe("Alpha PT");
    expect((await getMerchantProfile(ctxB)).legalName).toBe("Beta Pte Ltd");
    expect((await getMerchantProfile(ctxDemo)).legalName).toBe("Acme Corporation LLC");
    expect(requireStrict).toHaveBeenCalledWith("settings.manage", expect.anything());
  });

  it("updateMerchantProfileAction fails closed with no session", async () => {
    noSession();
    const before = await getMerchantProfile(ctxA);
    const out = await updateMerchantProfileAction(undefined, form(PROFILE_FORM));
    expect(out.status).toBe("error");
    expect(await getMerchantProfile(ctxA)).toEqual(before);
  });

  it("createApiKeyAction mints into the caller's partition and reveals the secret once", async () => {
    const out = await createApiKeyAction(
      undefined,
      form({ name: "Alpha CI Key", environment: "LIVE", scopes: ["read", "write"], confirm: "on" }),
    );
    expect(out.status).toBe("success");
    expect(out.data?.secret).toMatch(/^sk_live_/);

    const keysA = await listApiKeys(ctxA);
    expect(keysA.some((k) => k.id === out.data?.id)).toBe(true);
    expect(JSON.stringify(keysA)).not.toContain(out.data!.secret);
    expect(JSON.stringify(await listApiKeys(ctxB))).not.toContain(out.data!.name);
  });

  it("revoke and roll answer a foreign key id exactly like an unknown one", async () => {
    const { key } = await createApiKey(ctxB, { name: "Beta Key", environment: "LIVE", scopes: ["read"] });

    for (const action of [revokeApiKeyAction, rollApiKeyAction]) {
      const foreign = await action(undefined, form({ id: key.id, confirm: "on" }));
      const unknown = await action(undefined, form({ id: "key_nope", confirm: "on" }));
      expect(foreign.status).toBe("error");
      expect(foreign.message).toBe(unknown.message);
    }

    // The foreign key is still active, and no replacement was minted anywhere.
    expect((await getApiKey(ctxB, key.id))?.status).toBe("ACTIVE");
    expect((await listApiKeys(ctxA)).filter((k) => k.rolledFrom === key.id)).toHaveLength(0);
    expect((await listApiKeys(ctxB)).filter((k) => k.rolledFrom === key.id)).toHaveLength(0);
    expect(listTenantDenials().filter((d) => d.surface.startsWith("server/data/settings.")).length).toBeGreaterThan(0);
  });

  it("the IP allowlist actions are tenant-bound", async () => {
    const entry = await (async () => {
      const { addIpAllowEntry } = await import("@/server/data/settings");
      return addIpAllowEntry(ctxB, "198.51.100.7", "Beta CI");
    })();

    const foreign = await removeIpAllowAction(undefined, form({ id: entry.id }));
    expect(foreign.status).toBe("error");
    const { getDeveloperSettings } = await import("@/server/data/settings");
    expect((await getDeveloperSettings(ctxB)).ipAllowlist.some((e) => e.id === entry.id)).toBe(true);
  });
});

describe("kyc actions — the resolved tenant reaches the DAL", () => {
  it("submitKycDocumentAction stores against the session tenant", async () => {
    const out = await submitKycDocumentAction(
      undefined,
      form({ fileName: "alpha-inc.pdf", sizeBytes: "2048", docType: "incorporation", jurisdiction: "ID" }),
    );
    expect(out.status).toBe("success");
    expect(getKycSubmission(ctxA)?.fileName).toBe("alpha-inc.pdf");
    expect(getKycSubmission(ctxB)).toBeNull();
    expect(requireStrict).toHaveBeenCalledWith("kyc.submit", expect.anything());
  });

  it("submitKycDocumentAction fails closed with no session and stores nothing", async () => {
    noSession();
    const out = await submitKycDocumentAction(
      undefined,
      form({ fileName: "ghost.pdf", sizeBytes: "2048", docType: "incorporation", jurisdiction: "ID" }),
    );
    expect(out.status).toBe("error");
    expect(getKycSubmission(ctxA)).toBeNull();
  });

  it("removeKycDocumentAction is authorized and clears the caller's record only", async () => {
    const { submitKycDocument } = await import("@/server/data/kyc");
    submitKycDocument(ctxA, { fileName: "a.pdf", sizeBytes: 10, docType: "tax", jurisdiction: "ID" });
    submitKycDocument(ctxB, { fileName: "b.pdf", sizeBytes: 10, docType: "tax", jurisdiction: "SG" });

    expect((await removeKycDocumentAction(undefined, form({}))).status).toBe("success");
    expect(getKycSubmission(ctxA)).toBeNull();
    expect(getKycSubmission(ctxB)?.fileName).toBe("b.pdf");

    noSession();
    const denied = await removeKycDocumentAction(undefined, form({}));
    expect(denied.status).toBe("error");
    expect(getKycSubmission(ctxB)?.fileName).toBe("b.pdf");
  });

  it("validation runs before authorization", async () => {
    noSession();
    const out = await submitKycDocumentAction(
      undefined,
      form({ fileName: "", sizeBytes: "0", docType: "nope", jurisdiction: "" }),
    );
    expect(out.status).toBe("error");
    expect(out.message).toMatch(/attach a document/i);
  });
});
