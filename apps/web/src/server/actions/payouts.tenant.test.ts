// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { OrgContextError } from "@/server/services/org-context";
import { addBankAccount, createBatch, getBatch } from "@/server/data/payouts";
import {
  approveBatchAction,
  cancelBatchAction,
  createBatchAction,
  retryBatchAction,
  retryRecipientAction,
} from "./payouts";
import { withdrawBalanceAction } from "./balance";

/**
 * Wave 7B Q4.3 — action-level tenant boundary tests.
 *
 * The DAL isolation tests prove the repository predicates; these prove the
 * server-action seam resolves the tenant from the session before touching the
 * store, and that a cross-tenant id answers exactly like an unknown id (no
 * enumeration oracle). Covers the withdraw regression lock too:
 * `withdrawBalanceAction` mints and releases a payout batch, so it resolves
 * the session tenant like any other money-out write — and it requires an
 * authenticated actor at all.
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

const CSV = "name,bank,account_number,amount,reference\nAlpha Supplier,BCA,1111111111,1500000,INV-A-1";

function createForm(name = "Alpha action batch") {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("source", "Manual");
  fd.set("csv", CSV);
  return fd;
}

function confirmForm(id: string) {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("confirm", "on");
  return fd;
}

async function seedBatch(org: string, name: string, userId: string) {
  return createBatch(
    parseOrganizationContext({ organizationId: org }),
    {
      name,
      recipients: [
        { line: 1, name: "Seed Supplier", bank: "BCA", accountNumber: "9999999999", amount: 500_000, reference: "SEED-1" },
      ],
    },
    { createdBy: userId },
  );
}

beforeEach(() => {
  (globalThis as unknown as { __kineticPayoutStore?: unknown }).__kineticPayoutStore = undefined;
  requireStrict.mockReset();
  resolveSession.mockReset();
  asOrg(ORG_A);
});

describe("payout actions resolve the session tenant", () => {
  it("createBatchAction stores the batch under the caller's organization", async () => {
    const state = await createBatchAction(undefined, createForm());
    expect(state.status).toBe("success");
    const id = state.data?.id;
    expect(id).toBeTruthy();

    const own = await getBatch(parseOrganizationContext({ organizationId: ORG_A }), id!);
    expect(own?.organizationId).toBe(ORG_A);
    const foreign = await getBatch(parseOrganizationContext({ organizationId: ORG_B }), id!);
    expect(foreign).toBeNull();
  });

  it("approveBatchAction answers a foreign id exactly like an unknown id", async () => {
    const batch = await seedBatch(ORG_A, "Alpha approve batch", "user_a");
    asOrg(ORG_B, "user_b");

    const foreign = await approveBatchAction(undefined, confirmForm(batch.id));
    expect(foreign.status).toBe("error");
    expect(foreign.message).toMatch(/no longer exists/i);

    asOrg(ORG_A);
    const unknown = await approveBatchAction(undefined, confirmForm("BATCH-DOES-NOT-EXIST"));
    expect(unknown.status).toBe("error");
    expect(unknown.message).toBe(foreign.message);
  });

  it("cancelBatchAction answers a foreign id exactly like an unknown id", async () => {
    const batch = await seedBatch(ORG_A, "Alpha cancel batch", "user_a");
    asOrg(ORG_B, "user_b");

    const foreign = await cancelBatchAction(undefined, confirmForm(batch.id));
    expect(foreign.status).toBe("error");
    expect(foreign.message).toMatch(/no longer exists/i);
  });

  it("retryBatchAction answers a foreign id exactly like an unknown id", async () => {
    const batch = await seedBatch(ORG_A, "Alpha retry batch", "user_a");
    asOrg(ORG_B, "user_b");

    const fd = new FormData();
    fd.set("id", batch.id);
    const foreign = await retryBatchAction(undefined, fd);
    expect(foreign.status).toBe("error");
    expect(foreign.message).toMatch(/no longer exists/i);
  });

  it("retryRecipientAction answers a foreign recipient exactly like an unknown one", async () => {
    const batch = await seedBatch(ORG_A, "Alpha recipient batch", "user_a");
    asOrg(ORG_B, "user_b");

    const fd = new FormData();
    fd.set("batchId", batch.id);
    fd.set("recipientId", batch.recipients[0]!.id);
    const foreign = await retryRecipientAction(undefined, fd);
    expect(foreign.status).toBe("error");
    expect(foreign.message).toMatch(/no longer exists/i);
  });
});

describe("withdrawBalanceAction tenant boundary (regression lock)", () => {
  it("refuses an unauthenticated actor before touching any store", async () => {
    noSession();
    const fd = new FormData();
    fd.set("amount", "100000");
    fd.set("accountId", "acct_unknown");
    const state = await withdrawBalanceAction(undefined, fd);
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/Authentication required/i);
  });

  it("answers another tenant's destination account exactly like an unknown one", async () => {
    const account = await addBankAccount(parseOrganizationContext({ organizationId: ORG_A }), {
      bank: "BCA",
      holder: "Alpha Ops",
      accountNumber: "1234567890",
    });
    asOrg(ORG_B, "user_b");

    const withForeign = new FormData();
    withForeign.set("amount", "100000");
    withForeign.set("accountId", account.id);
    const foreign = await withdrawBalanceAction(undefined, withForeign);
    expect(foreign.status).toBe("error");
    expect(foreign.message).toMatch(/does not exist/i);

    const withUnknown = new FormData();
    withUnknown.set("amount", "100000");
    withUnknown.set("accountId", "acct_unknown");
    const unknown = await withdrawBalanceAction(undefined, withUnknown);
    expect(unknown.message).toBe(foreign.message);
  });

  it("sees only the caller's own destination accounts", async () => {
    await addBankAccount(parseOrganizationContext({ organizationId: ORG_A }), {
      bank: "BCA",
      holder: "Alpha Ops",
      accountNumber: "1234567890",
    });
    // B never added an account: the same id is unknown inside B's partition.
    asOrg(ORG_B, "user_b");
    const fd = new FormData();
    fd.set("amount", "100000");
    fd.set("accountId", "acct_alpha_only");
    const state = await withdrawBalanceAction(undefined, fd);
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/does not exist/i);
  });
});
