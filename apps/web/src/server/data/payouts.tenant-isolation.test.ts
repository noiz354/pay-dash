// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { __resetTenantDenials, listTenantDenials } from "@/server/services/tenant-denial";
import type { RecipientDraft } from "@/lib/payout-csv";
import {
  approveBatch,
  batchesToCsv,
  cancelBatch,
  createBatch,
  getBatch,
  getPayoutsOverview,
  listBatches,
  retryBatchFailures,
  retryRecipient,
  type PayoutBatch,
} from "./payouts";

/**
 * Wave 7B Q1 — Payouts + Refunds tenant isolation, target-API tests (U-1..U-15).
 *
 * The invariant: **Org A cannot list, search, open, export, approve, cancel,
 * retry, or otherwise mutate a payout batch/recipient of Org B, even knowing
 * the id.** Same anti-enumeration policy as 7A: foreign/unknown ids are
 * wire-identical (null / NOT_FOUND); the loud half is the denial audit.
 *
 * Every test is a *pair*: "A sees/does its own" AND "A never touches B's". A
 * test that only checks the second half passes trivially on an empty store.
 *
 * These tests are written against the TARGET API (`ctx` first, spec §2 C-1).
 * They are RED on main because `payouts.ts` accepts no tenant at all — that is
 * the gap (P-1..P-3, P-8..P-10), not a typo.
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";

const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });

const USER_A = "user_alpha_owner";
const USER_B = "user_beta_owner";

beforeEach(() => {
  (globalThis as unknown as { __kineticPayoutStore?: unknown }).__kineticPayoutStore = undefined;
  __resetTenantDenials();
});

type Draft = RecipientDraft;

function recipient(name: string, amount: number, accountNumber = "1234567891", reference = ""): Draft {
  return { line: 1, name, bank: "BCA", accountNumber, amount, reference };
}

/** Two tenants, two batches each with distinct names/amounts. */
async function twoTenantsSeeded() {
  const a1 = await createBatch(
    ctxA,
    { name: "Alpha vendor settlement", recipients: [recipient("Alpha Supplier 1", 1_000_000, "1111111111", "INV-A-1")] },
    { createdBy: USER_A },
  );
  const a2 = await createBatch(
    ctxA,
    { name: "Alpha payroll top-up", recipients: [recipient("Alpha Ops", 2_000_000, "2222222222", "PAY-A-1")] },
    { createdBy: USER_A },
  );
  const b1 = await createBatch(
    ctxB,
    { name: "Beta vendor settlement", recipients: [recipient("Beta Supplier 1", 9_000_000, "3333333333", "INV-B-1")] },
    { createdBy: USER_B },
  );
  const b2 = await createBatch(
    ctxB,
    { name: "Beta affiliate commissions", recipients: [recipient("Beta Affiliate", 4_000_000, "4444444444", "AFF-B-1")] },
    { createdBy: USER_B },
  );
  return { a1, a2, b1, b2 };
}

// ---------------------------------------------------------------------------
// U-1 — list
// ---------------------------------------------------------------------------
describe("U-1 Org A lists → only A", () => {
  it("the list contains only A's batches and A's total excludes B", async () => {
    await twoTenantsSeeded();

    const asA = await listBatches(ctxA, { pageSize: 50, page: 1 });
    const asB = await listBatches(ctxB, { pageSize: 50, page: 1 });

    expect(asA.total).toBe(2);
    expect(asA.rows).toHaveLength(2);
    expect(asA.rows.map((b) => b.name).sort()).toEqual(["Alpha payroll top-up", "Alpha vendor settlement"]);
    // Paired half: B really holds batches, so "A sees 2" is scoping, not absence.
    expect(asB.total).toBe(2);
    expect(asB.rows.map((b) => b.name).sort()).toEqual(["Beta affiliate commissions", "Beta vendor settlement"]);
  });
});

// ---------------------------------------------------------------------------
// U-2 — search / filter
// ---------------------------------------------------------------------------
describe("U-2 Org A searches → never B", () => {
  it("needles matching only B return empty; a shared needle still returns only A", async () => {
    await twoTenantsSeeded();

    expect((await listBatches(ctxA, { q: "Beta" })).total).toBe(0);
    expect((await listBatches(ctxA, { q: "Beta" })).rows).toHaveLength(0);
    expect((await listBatches(ctxA, { q: "affiliate" })).total).toBe(0);

    const shared = await listBatches(ctxA, { q: "settlement" });
    expect(shared.total).toBe(1);
    expect(shared.rows[0]?.name).toBe("Alpha vendor settlement");
  });
});

// ---------------------------------------------------------------------------
// U-3 + U-7 — detail by id, guessed ids
// ---------------------------------------------------------------------------
describe("U-3/U-7 detail reads are null-equivalent", () => {
  it("a foreign batch id reads as null, identical to an unknown id", async () => {
    const { b1 } = await twoTenantsSeeded();

    const own = await getBatch(ctxB, b1.id);
    expect(own?.id).toBe(b1.id);

    const foreign = await getBatch(ctxA, b1.id);
    const unknown = await getBatch(ctxA, "BATCH-2099-00-999");
    const malformed = await getBatch(ctxA, "not-a-batch!!!");
    expect(foreign).toBeNull();
    // Object-level null-equivalence, not "both were empty-ish".
    expect(foreign).toBe(unknown);
    expect(malformed).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// U-4 — approve / cancel (money-out writes + dual control shape)
// ---------------------------------------------------------------------------
describe("U-4 cross-tenant approve/cancel are refused and audited", () => {
  it("A approves its own batch; A's approval of B's batch is refused and B is unchanged", async () => {
    const { a1, b1 } = await twoTenantsSeeded();

    const ok = await approveBatch(ctxA, a1.id, { actorId: "user_alpha_finance" });
    expect(ok?.batch.status).toMatch(/PROCESSING|PAID|PARTIAL/);

    const before = await getBatch(ctxB, b1.id);
    await expect(approveBatch(ctxA, b1.id, { actorId: "user_alpha_finance" })).rejects.toThrow(/cross-tenant/i);
    const after = await getBatch(ctxB, b1.id);
    expect(after?.status).toBe(before?.status);
    expect(after?.recipients.map((r) => r.status)).toEqual(before?.recipients.map((r) => r.status));
    expect(listTenantDenials().length).toBeGreaterThan(0);
  });

  it("A cancels its own draft; A's cancel of B's draft is refused and B is unchanged", async () => {
    const { a1, b1 } = await twoTenantsSeeded();

    const cancelled = await cancelBatch(ctxA, a1.id, { actorId: USER_A });
    expect(cancelled?.status).toBe("RETURNED");

    await expect(cancelBatch(ctxA, b1.id, { actorId: USER_A })).rejects.toThrow(/cross-tenant/i);
    expect((await getBatch(ctxB, b1.id))?.status).not.toBe("RETURNED");
  });
});

// ---------------------------------------------------------------------------
// U-5 — retry batch / retry recipient
// ---------------------------------------------------------------------------
describe("U-5 cross-tenant retries are refused and move no money", () => {
  async function batchWithFailure(ctx: OrganizationContext, name: string, createdBy: string) {
    const batch = await createBatch(
      ctx,
      {
        name,
        recipients: [
          recipient("Good Supplier", 500_000, "5555555555", "OK-1"),
          recipient("Bad Account", 250_000, "99990000", "FAIL-1"),
        ],
      },
      { createdBy },
    );
    // Distinct approver satisfies dual control; the 0000 row fails deterministically.
    const settled = await approveBatch(ctx, batch.id, { actorId: `${createdBy}:approver` });
    expect(settled?.failed).toBe(1);
    return batch;
  }

  it("A retries its own failures; A's retry of B's batch changes nothing on B", async () => {
    const own = await batchWithFailure(ctxA, "Alpha with failure", USER_A);
    const foreign = await batchWithFailure(ctxB, "Beta with failure", USER_B);

    const retried = await retryBatchFailures(ctxA, own.id, { actorId: USER_A });
    expect(retried?.retried).toBe(1);

    const before = await getBatch(ctxB, foreign.id);
    await expect(retryBatchFailures(ctxA, foreign.id, { actorId: USER_A })).rejects.toThrow(/cross-tenant/i);
    const after = await getBatch(ctxB, foreign.id);
    expect(after?.recipients.map((r) => `${r.id}:${r.status}`)).toEqual(
      before?.recipients.map((r) => `${r.id}:${r.status}`),
    );
  });

  it("A's retry of B's recipient is refused and B's row is unchanged", async () => {
    const foreign = await batchWithFailure(ctxB, "Beta recipient failure", USER_B);
    const target = foreign.recipients.find((r) => r.accountNumber === "99990000")!;

    // Sanity: the row really is failed before the probe.
    expect((await getBatch(ctxB, foreign.id))?.recipients.find((r) => r.id === target.id)?.status).toBe("FAILED");

    await expect(retryRecipient(ctxA, foreign.id, target.id, { actorId: USER_A })).rejects.toThrow(/cross-tenant/i);
    expect((await getBatch(ctxB, foreign.id))?.recipients.find((r) => r.id === target.id)?.status).toBe("FAILED");
  });
});

// ---------------------------------------------------------------------------
// U-6 — CSV payload scoping (route-level suite covers HTTP; see route test)
// ---------------------------------------------------------------------------
describe("U-6 export payload contains only the caller's batches", () => {
  it("batchesToCsv over A's rows carries A's ids and no B reference", async () => {
    await twoTenantsSeeded();
    const { rows } = await listBatches(ctxA, { pageSize: 50 });
    const csv = batchesToCsv(rows);
    expect(csv).toContain("Alpha vendor settlement");
    expect(csv).not.toContain("Beta vendor settlement");
    expect(csv).not.toContain("Beta Affiliate");
    // Tenancy metadata must not ride out in a file.
    expect(csv).not.toMatch(/organizationId|org_alpha|org_beta/i);
  });
});

// ---------------------------------------------------------------------------
// U-8 — pagination × sort
// ---------------------------------------------------------------------------
describe("U-8 pagination and sort stay inside the tenant", () => {
  it("every page of A's traversal is A-only and B is unreachable at any offset", async () => {
    const created: PayoutBatch[] = [];
    for (let i = 0; i < 5; i++) {
      created.push(
        await createBatch(
          ctxA,
          { name: `Alpha traversal ${i}`, recipients: [recipient(`Alpha R${i}`, 100_000 + i, `700000000${i}`)] },
          { createdBy: USER_A },
        ),
      );
    }
    await createBatch(
      ctxB,
      { name: "Beta traversal", recipients: [recipient("Beta R", 50_000_000, "8000000000")] },
      { createdBy: USER_B },
    );

    const seen = new Set<string>();
    for (const page of [1, 2, 3]) {
      const res = await listBatches(ctxA, { page, pageSize: 2, sort: "recent" });
      for (const row of res.rows) {
        expect(row.name.startsWith("Alpha")).toBe(true);
        seen.add(row.id);
      }
    }
    expect(seen.size).toBe(5);
    expect([...seen].every((id) => created.some((b) => b.id === id))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// U-9 — overview aggregates per tenant
// ---------------------------------------------------------------------------
describe("U-9 overview aggregates are per-tenant", () => {
  it("A's totals reflect A's batches only; B's 13M never enters A's aggregate", async () => {
    await twoTenantsSeeded();

    const a = await getPayoutsOverview(ctxA);
    const b = await getPayoutsOverview(ctxB);

    // A: 1M + 2M pending; B: 9M + 4M pending. Fresh batches are DRAFT (in flight).
    expect(a.pendingAmount).toBe(3_000_000);
    expect(a.pendingBatches).toBe(2);
    expect(b.pendingAmount).toBe(13_000_000);
    expect(b.pendingBatches).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// U-10 — create lands in the caller's partition
// ---------------------------------------------------------------------------
describe("U-10 create carries its owner and is invisible to the other tenant", () => {
  it("a batch created by A is listed/detailed only by A", async () => {
    const created = await createBatch(
      ctxA,
      { name: "Alpha confidential batch", recipients: [recipient("Alpha R", 777_000, "6666666666")] },
      { createdBy: USER_A },
    );
    expect(created.organizationId).toBe(ORG_A);

    expect((await listBatches(ctxB, { q: "confidential" })).total).toBe(0);
    expect(await getBatch(ctxB, created.id)).toBeNull();
    expect((await listBatches(ctxA, { q: "confidential" })).total).toBe(1);
  });

  it("a context with a blank organization is refused, never defaulted", async () => {
    await expect(
      createBatch({ organizationId: "  " } as OrganizationContext, {
        name: "Orphan batch",
        recipients: [recipient("Nobody", 1_000)],
      }),
    ).rejects.toThrow(/organization/i);
  });
});

// ---------------------------------------------------------------------------
// U-12 — timeline inherits batch scope
// ---------------------------------------------------------------------------
describe("U-12 timelines are unreachable across tenants", () => {
  it("B's batch timeline events are not visible through A's reads", async () => {
    const { b1 } = await twoTenantsSeeded();
    await approveBatch(ctxB, b1.id, { actorId: "user_beta_finance" });

    const viaA = await getBatch(ctxA, b1.id);
    expect(viaA).toBeNull();

    const viaB = await getBatch(ctxB, b1.id);
    expect(viaB!.timeline.length).toBeGreaterThan(1);
    const { rows } = await listBatches(ctxA, { pageSize: 50 });
    expect(JSON.stringify(rows)).not.toContain(b1.id);
  });
});

// ---------------------------------------------------------------------------
// U-13 — dual control: creator cannot approve own batch
// ---------------------------------------------------------------------------
describe("U-13 money-out dual control", () => {
  it("the creator cannot approve their own batch", async () => {
    const batch = await createBatch(
      ctxA,
      { name: "Alpha self-approval attempt", recipients: [recipient("Alpha R", 300_000)] },
      { createdBy: USER_A },
    );
    await expect(approveBatch(ctxA, batch.id, { actorId: USER_A })).rejects.toThrow(
      /same.?actor|distinct|different|approver/i,
    );
    // And the batch is still releasable by someone else.
    const ok = await approveBatch(ctxA, batch.id, { actorId: "user_alpha_finance" });
    expect(ok?.batch.status).toMatch(/PROCESSING|PAID|PARTIAL/);
  });

  it("the tenant check runs before dual control (Q6-M8 pin): a same-actor cross-tenant approve is refused as cross-tenant, not as self-approval", async () => {
    const batch = await createBatch(
      ctxA,
      { name: "Alpha same-actor probe", recipients: [recipient("Alpha R", 300_000)] },
      { createdBy: USER_A },
    );
    // Same actor id, foreign tenant: dual control would also fire, but the
    // tenant boundary must answer first so the probe learns nothing about
    // workflow state — and the denial is audited as cross-tenant.
    await expect(approveBatch(ctxB, batch.id, { actorId: USER_A })).rejects.toThrow(/cross-tenant/i);
  });
});

// ---------------------------------------------------------------------------
// U-14 — quarantine fail-closed (lands in Q3; dynamic import so only this
// test fails until then)
// ---------------------------------------------------------------------------
describe("U-14 legacy payout readers fail closed once multi-tenant", () => {
  it("legacyPayoutBatches(surface) throws as soon as two tenants hold batches", async () => {
    const mod = await import("./payouts-unscoped").catch(() => null);
    expect(mod, "quarantine module missing (Wave 7B Q3)").toBeTruthy();

    await twoTenantsSeeded();
    expect(() => mod!.legacyPayoutBatches("balance")).toThrow(/multi-tenant|unscoped|refused/i);
  });
});

// ---------------------------------------------------------------------------
// U-15 — invalid contexts never become a default tenant
// ---------------------------------------------------------------------------
describe("U-15 invalid contexts are refused", () => {
  it("empty/blank organization ids throw instead of scoping to a demo tenant", async () => {
    await twoTenantsSeeded();
    await expect(listBatches({ organizationId: "" }, {})).rejects.toThrow(/organization/i);
    await expect(
      listBatches(undefined as unknown as OrganizationContext, {}),
    ).rejects.toThrow(/organization/i);
  });
});
