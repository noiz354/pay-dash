// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { OrgContextError } from "@/server/services/org-context";
import { createCustomer, getCustomer } from "@/server/data/customers";
import {
  archiveCustomerAction,
  createCustomerAction,
  updateCustomerAction,
} from "./customers";

/**
 * Wave 7C Q4 — action-level tenant boundary tests (spec §5/§6 "action tests
 * for the 3 customer actions").
 *
 * The DAL isolation tests prove the repository predicates; these prove the
 * server-action seam resolves the tenant from the session before touching the
 * store, and that a cross-tenant id answers exactly like an unknown id (no
 * enumeration oracle). Mirrors `payouts.tenant.test.ts` (7B Q4.3).
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireStrict = vi.hoisted(() => vi.fn());
const resolveSession = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/session-org-context", () => ({
  resolveSessionOrgContext: resolveSession,
  requireStrictOrgContext: requireStrict,
}));

const ORG_A = "org_alpha";
const ORG_B = "org_beta";

function asOrg(organizationId: string, userId: string | null = "user_a") {
  requireStrict.mockResolvedValue({ organizationId, roles: ["OWNER"], userId, isDemoFallback: false });
  resolveSession.mockResolvedValue({ organizationId, roles: ["OWNER"], userId, isDemoFallback: false });
}

function noSession() {
  requireStrict.mockRejectedValue(new OrgContextError("FORBIDDEN", "Authentication required — please sign in."));
  resolveSession.mockRejectedValue(new OrgContextError("FORBIDDEN", "Authentication required — please sign in."));
}

function createForm(name = "Alpha action customer", email = "action@alpha.example") {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("email", email);
  return fd;
}

function updateForm(id: string, name = "Renamed by A") {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("name", name);
  return fd;
}

function archiveForm(id: string, restore = false) {
  const fd = new FormData();
  fd.set("id", id);
  if (restore) fd.set("restore", "1");
  return fd;
}

beforeEach(() => {
  (globalThis as unknown as { __kineticCustomerStore?: unknown }).__kineticCustomerStore = undefined;
  (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
  requireStrict.mockReset();
  resolveSession.mockReset();
  asOrg(ORG_A);
});

describe("customer actions resolve the session tenant", () => {
  it("createCustomerAction stores the customer under the caller's organization", async () => {
    const state = await createCustomerAction(undefined, createForm());
    expect(state.status).toBe("success");
    const id = state.data?.id;
    expect(id).toBeTruthy();

    const own = await getCustomer(parseOrganizationContext({ organizationId: ORG_A }), id!);
    expect(own?.organizationId).toBe(ORG_A);
    const foreign = await getCustomer(parseOrganizationContext({ organizationId: ORG_B }), id!);
    expect(foreign).toBeNull();
  });

  it("updateCustomerAction answers a foreign id exactly like an unknown id", async () => {
    const own = await createCustomer(parseOrganizationContext({ organizationId: ORG_A }), {
      name: "Alpha Keep",
      email: "keep@alpha.example",
    });
    asOrg(ORG_B, "user_b");

    const foreign = await updateCustomerAction(undefined, updateForm(own.id));
    expect(foreign.status).toBe("error");
    expect(foreign.message).toMatch(/no longer exists/i);

    asOrg(ORG_A);
    const unknown = await updateCustomerAction(undefined, updateForm("cus_doesnotexist"));
    expect(unknown.status).toBe("error");
    expect(unknown.message).toBe(foreign.message);
  });

  it("archiveCustomerAction answers a foreign id exactly like an unknown id", async () => {
    const own = await createCustomer(parseOrganizationContext({ organizationId: ORG_A }), {
      name: "Alpha Archive",
      email: "archive@alpha.example",
    });
    asOrg(ORG_B, "user_b");

    const foreign = await archiveCustomerAction(undefined, archiveForm(own.id));
    expect(foreign.status).toBe("error");
    expect(foreign.message).toMatch(/no longer exists/i);

    asOrg(ORG_A);
    const unknown = await archiveCustomerAction(undefined, archiveForm("cus_doesnotexist"));
    expect(unknown.status).toBe("error");
    expect(unknown.message).toBe(foreign.message);
  });
});

describe("customer actions require an authenticated actor", () => {
  it("createCustomerAction refuses an unauthenticated actor before touching the store", async () => {
    noSession();
    const state = await createCustomerAction(undefined, createForm());
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Authentication required/i);
  });

  it("updateCustomerAction refuses an unauthenticated actor", async () => {
    noSession();
    const state = await updateCustomerAction(undefined, updateForm("cus_anything"));
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Authentication required/i);
  });

  it("archiveCustomerAction refuses an unauthenticated actor", async () => {
    noSession();
    const state = await archiveCustomerAction(undefined, archiveForm("cus_anything"));
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Authentication required/i);
  });
});
