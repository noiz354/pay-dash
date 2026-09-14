// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { __resetTenantDenials } from "@/server/services/tenant-denial";
import {
  createSubscription,
  getSubscription,
  listSubscriptions,
  subscriptionSummary,
} from "./subscriptions";

/**
 * Wave 7D Q1 — Subscriptions tenant isolation, target-API tests (B-1..B-6, spec §5).
 *
 * Invariant: **Org A cannot list, search, open, or create into a subscription
 * book of Org B — even knowing the plan id exactly.** Plans point at customers
 * through the same pure email hash as 7C, so the composite-key rule carries
 * over: same customer email + plan name in two tenants ⇒ two rows, one per
 * owner (spec P-10).
 *
 * Every test is a *pair*: "A sees/does its own" AND "A never touches B's". A
 * test that only checks the second half passes trivially on an empty store.
 *
 * RED on `af18cc4`: `subscriptions.ts` accepts no tenant at all (P-1, P-2) and
 * its store is one process-wide `{ plans }` array. Target API: `ctx` first
 * (spec §2 C-1); foreign reads are `null` (C-4); a create lands in the caller's
 * partition and nowhere else.
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticSubscriptionStore;
  delete g.__kineticInvoiceStore;
  delete g.__kineticTxStore;
  __resetTenantDenials();
}

beforeEach(() => {
  resetStores();
});

const plan = (customerEmail: string, planName: string, amount: number) => ({
  customerName: customerEmail.split("@")[0]!,
  customerEmail,
  planName,
  interval: "monthly" as const,
  amount,
});

/** Two tenants, two plans each, distinguishable by email *and* amount. */
async function twoTenantsSeeded() {
  const a1 = await createSubscription(ctxA, plan("buyer1@alpha.example", "Growth", 15_000_000));
  const a2 = await createSubscription(ctxA, plan("buyer2@alpha.example", "Scale", 48_500_000));
  const b1 = await createSubscription(ctxB, plan("buyer1@beta.example", "Growth", 15_000_001));
  const b2 = await createSubscription(ctxB, plan("buyer2@beta.example", "Scale", 48_500_001));
  return { a1, a2, b1, b2 };
}

describe("B-1 Org A lists → only A", () => {
  it("the plan list contains A's subscriptions and never B's", async () => {
    await twoTenantsSeeded();

    const asA = await listSubscriptions(ctxA, { pageSize: 100 });
    const asB = await listSubscriptions(ctxB, { pageSize: 100 });
    const emailsA = asA.rows.map((s) => s.customerEmail);
    const emailsB = asB.rows.map((s) => s.customerEmail);

    expect(emailsA).toContain("buyer1@alpha.example");
    expect(emailsA).toContain("buyer2@alpha.example");
    expect(emailsA).not.toContain("buyer1@beta.example");
    expect(emailsA).not.toContain("buyer2@beta.example");
    expect(emailsB).toContain("buyer1@beta.example");
    expect(emailsB).not.toContain("buyer1@alpha.example");
    // The prototype seeds belong to the demo tenant, not to A or B.
    expect(emailsA).not.toContain("finance@initech.eu");
    expect(asA.total).toBe(2);
    expect(asB.total).toBe(2);
  });

  it("every row carries its owner and the owner is the caller", async () => {
    await twoTenantsSeeded();
    const asA = await listSubscriptions(ctxA, { pageSize: 100 });
    expect(asA.rows.every((s) => s.organizationId === ORG_A)).toBe(true);
  });
});

describe("B-2 search/filter stays inside the tenant", () => {
  it("a needle matching only B returns nothing for A", async () => {
    await twoTenantsSeeded();

    const asA = await listSubscriptions(ctxA, { q: "beta", pageSize: 100 });
    expect(asA.rows).toHaveLength(0);
    expect(asA.total).toBe(0);

    const asB = await listSubscriptions(ctxB, { q: "beta", pageSize: 100 });
    expect(asB.total).toBe(2);
  });

  it("the same plan name in two tenants is not a cross-tenant match", async () => {
    await twoTenantsSeeded();
    // Both tenants hold a "Growth" plan; the needle is identical, the rows are not.
    const asA = await listSubscriptions(ctxA, { q: "Growth", pageSize: 100 });
    expect(asA.total).toBe(1);
    expect(asA.rows[0]!.customerEmail).toBe("buyer1@alpha.example");
    expect(asA.rows[0]!.amount).toBe(15_000_000);
  });

  it("status filter never leaks across tenants", async () => {
    await twoTenantsSeeded();
    const asA = await listSubscriptions(ctxA, { status: "PENDING_SETUP", pageSize: 100 });
    expect(asA.total).toBe(2);
    for (const s of asA.rows) expect(s.customerEmail).toContain("@alpha.example");
  });
});

describe("B-3 detail by id → foreign is null", () => {
  it("own id resolves; B's id is null for A, byte-identical to unknown", async () => {
    const { a1, b1 } = await twoTenantsSeeded();

    expect((await getSubscription(ctxA, a1.id))?.customerEmail).toBe("buyer1@alpha.example");
    expect(await getSubscription(ctxA, b1.id)).toBeNull();
    const unknown = await getSubscription(ctxA, "sub_doesnotexist");
    expect(unknown).toBeNull();
    // Uniform answer: "not yours" and "does not exist" are the same value.
    expect(await getSubscription(ctxA, b1.id)).toEqual(unknown);
  });
});

describe("B-4 the summary aggregates only the caller's rows", () => {
  it("MRR and counts computed from A's list exclude B's plans", async () => {
    await twoTenantsSeeded();

    const rowsA = (await listSubscriptions(ctxA, { pageSize: 100 })).rows;
    const summaryA = subscriptionSummary(rowsA);
    // Two PENDING_SETUP plans at 15,000,000 + 48,500,000 — B's +1 offsets must not appear.
    expect(summaryA.pendingSetup).toBe(2);
    expect(summaryA.active).toBe(0);
    expect(summaryA.activeMrr).toBe(0);
    expect(rowsA.map((s) => s.amount).sort((x, y) => x - y)).toEqual([15_000_000, 48_500_000]);
  });
});

describe("B-5 the plan id is a composite key, not a global one (spec P-10)", () => {
  it("same customer email + plan in two tenants ⇒ two rows, same id shape, one owner each", async () => {
    const inA = await createSubscription(ctxA, plan("shared@example.com", "Growth", 10_000_000));
    const inB = await createSubscription(ctxB, plan("shared@example.com", "Growth", 20_000_000));

    // `subscriptionIdFrom(email, planName)` is a pure global hash: the id *shape*
    // collides by design, so ownership has to come from the partition.
    expect(inA.id.slice(0, 12)).toBe(inB.id.slice(0, 12));
    expect(inA.organizationId).toBe(ORG_A);
    expect(inB.organizationId).toBe(ORG_B);

    // Each tenant resolves its own row through the shared prefix.
    const prefix = inA.id.slice(0, 12);
    const asA = await listSubscriptions(ctxA, { q: prefix, pageSize: 100 });
    const asB = await listSubscriptions(ctxB, { q: prefix, pageSize: 100 });
    expect(asA.rows.map((s) => s.amount)).toEqual([10_000_000]);
    expect(asB.rows.map((s) => s.amount)).toEqual([20_000_000]);
  });
});

describe("B-6 create lands in the caller's partition", () => {
  it("the owner comes from ctx only and the row is invisible to B", async () => {
    const created = await createSubscription(ctxA, plan("new@alpha.example", "Starter", 5_000_000));
    expect(created.organizationId).toBe(ORG_A);
    expect(created.status).toBe("PENDING_SETUP");

    expect(await getSubscription(ctxB, created.id)).toBeNull();
    const asB = await listSubscriptions(ctxB, { pageSize: 100 });
    expect(asB.rows.map((s) => s.customerEmail)).not.toContain("new@alpha.example");
    expect(asB.total).toBe(0);
  });

  it("pagination × sort stay inside the tenant", async () => {
    await twoTenantsSeeded();
    for (let i = 0; i < 12; i++) {
      await createSubscription(ctxA, plan(`padded${i}@alpha.example`, "Growth", 1_000_000 + i));
    }
    for (const sort of ["recent", "amount"] as const) {
      const page = await listSubscriptions(ctxA, { sort, page: 2, pageSize: 5 });
      expect(page.rows.length).toBeGreaterThan(0);
      for (const s of page.rows) expect(s.customerEmail).toContain("@alpha.example");
    }
  });
});

describe("B-6b no context, no tenant", () => {
  it("an invalid ctx never becomes a tenant", async () => {
    expect(() => parseOrganizationContext({ organizationId: "   " })).toThrow();
    // @ts-expect-error — a missing ctx must not be callable where it counts
    await expect(listSubscriptions({ pageSize: 10 })).rejects.toThrow();
    // @ts-expect-error — same for the detail read
    await expect(getSubscription("sub_whatever")).rejects.toThrow();
  });

  it("the plan store slot is not a process-wide list any more", async () => {
    await twoTenantsSeeded();
    const slot = (globalThis as unknown as { __kineticSubscriptionStore?: { plans?: unknown } })
      .__kineticSubscriptionStore;
    // The partitioned store has no process-wide `plans` array to read.
    expect(slot?.plans).toBeUndefined();
  });
});
