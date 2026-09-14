// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { TenantIsolationError } from "@/domain/security/tenant";
import { createTransaction, getLedgerRows } from "./transactions";
import {
  countLinkTenants,
  createLink,
  deriveLinkStatus,
  expireLink,
  getLink,
  listLinks,
  recordLinkPayment,
  soleLinkOrganizationId,
  totalOf,
} from "./links";

/**
 * Wave 7G Q1 — payment link tenant isolation, target-API tests (G-3, G-13b).
 *
 * Invariant: **Org A cannot list, open, close or take payment on Org B's payment
 * links.** Links are money-adjacent in both directions: `expireLink` mutates B's
 * money path, and `recordLinkPayment` *credits a ledger* — so the interesting
 * defect is not the read leak but the write.
 *
 * `recordLinkPayment(ctx, id)` has been ctx-first since Wave 7A, and that is
 * exactly why it is the sharpest gap in this slice: it resolves the link from a
 * **process-wide** store (`links.ts:282`) and only then writes into the caller's
 * ledger. Tenant A can therefore pay tenant B's link and have the money land in
 * **A's** books — a cross-tenant read that launders into a same-tenant write.
 * G-13b pins the order (tenant → row → write) and asserts the raw sweep: a
 * refused payment leaves nothing in *either* partition.
 *
 * A link's status is derived, never stored: `paidReferenceIds()` reads SUCCEEDED
 * ledger rows that reference a link id. That derivation must be scoped too, or a
 * settled payment in A flips B's identically-named link to PAID.
 *
 * Ids are `plink_<base36>` from the clock, so two tenants can hold the same id;
 * isolation is the composite key `(organizationId, id)`, never id secrecy
 * (spec P-10, same shape as 7C/7F).
 *
 * RED on `6c104ab`: `links.ts` accepts no tenant except on `recordLinkPayment`.
 */

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });
const ctxDemo: OrganizationContext = parseOrganizationContext({ organizationId: DEFAULT_DEMO_ORG });

function resetStores() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.__kineticLinksStore;
  delete g.__kineticTxStore;
}

/** Raw partition view — asserts on the store, not on a read that could filter. */
function rawLinkPartitions(): Map<string, { links: { id: string; cancelledAt: string | null; paidAt: string | null }[] }> {
  const g = globalThis as unknown as {
    __kineticLinksStore?: { tenants?: Map<string, { links: { id: string; cancelledAt: string | null; paidAt: string | null }[] }> };
  };
  return g.__kineticLinksStore?.tenants ?? new Map();
}

const A_INPUT = { kind: "single" as const, items: [{ label: "Alpha invoice", amount: 250_000 }], payerEmail: "ap@alpha.test", expiresAt: null };
const B_INPUT = { kind: "multiple" as const, items: [{ label: "Beta consulting", amount: 1_000_000 }, { label: "Beta licence", amount: 500_000 }], payerEmail: "ap@beta.test", expiresAt: null };

beforeEach(() => {
  resetStores();
});

describe("G-3 payment links are per tenant", () => {
  it("the seeded links belong to the demo tenant, not to every tenant", () => {
    const demo = listLinks(ctxDemo, { pageSize: 50 });
    expect(demo.total).toBeGreaterThan(0);
    expect(demo.rows.some((l) => l.id === "plink_8x9a2b1c")).toBe(true);

    expect(listLinks(ctxA, { pageSize: 50 }).total).toBe(0);
    expect(listLinks(ctxB, { pageSize: 50 }).total).toBe(0);
    expect(JSON.stringify(listLinks(ctxA, { pageSize: 50 }).rows)).not.toContain("acmecorp");
  });

  it("A's created link is A's: B and demo never see it", () => {
    const created = createLink(ctxA, A_INPUT);
    expect(created.id).toMatch(/^plink_/);
    expect(created.currency).toBe("IDR");

    expect(listLinks(ctxA, { pageSize: 50 }).total).toBe(1);
    expect(listLinks(ctxB, { pageSize: 50 }).total).toBe(0);
    expect(listLinks(ctxDemo, { q: "ap@alpha.test", pageSize: 50 }).total).toBe(0);
    expect(JSON.stringify(listLinks(ctxB, { pageSize: 50 }).rows)).not.toContain(created.id);
  });

  it("createLink takes the owner from the context, never from the input", () => {
    // The input shape carries no tenant field at all (P-10): a forged
    // organizationId in the payload has nowhere to land.
    const forged = { ...A_INPUT, organizationId: ORG_B } as unknown as typeof A_INPUT;
    const created = createLink(ctxA, forged);

    expect(getLink(ctxA, created.id)).not.toBeNull();
    expect(getLink(ctxB, created.id)).toBeNull();
  });

  it("two tenants hold two links at once, each seeing only its own", () => {
    const a = createLink(ctxA, A_INPUT);
    const b = createLink(ctxB, B_INPUT);

    expect(listLinks(ctxA, { pageSize: 50 }).rows.map((l) => l.id)).toEqual([a.id]);
    expect(listLinks(ctxB, { pageSize: 50 }).rows.map((l) => l.id)).toEqual([b.id]);
    expect(totalOf(a)).toBe(250_000);
    expect(totalOf(b)).toBe(1_500_000);
  });

  it("q / status / kind / page filters narrow inside the tenant and never widen", () => {
    createLink(ctxA, A_INPUT);
    createLink(ctxA, {
      ...B_INPUT,
      items: [{ label: "Alpha second", amount: 750_000 }],
      payerEmail: "second@alpha.test",
    });
    createLink(ctxB, B_INPUT);

    expect(listLinks(ctxA, { kind: "single", pageSize: 50 }).total).toBe(1);
    expect(listLinks(ctxA, { kind: "multiple", pageSize: 50 }).total).toBe(1);
    expect(listLinks(ctxA, { q: "second@alpha.test", pageSize: 50 }).total).toBe(1);
    // A needle matching only B's row returns nothing — not B's row.
    expect(listLinks(ctxA, { q: "ap@beta.test", pageSize: 50 }).total).toBe(0);
    expect(listLinks(ctxA, { q: "Beta consulting", pageSize: 50 }).rows).toEqual([]);

    const paged = listLinks(ctxA, { page: 1, pageSize: 1 });
    expect(paged.total).toBe(2);
    expect(paged.pageCount).toBe(2);
    expect(paged.rows).toHaveLength(1);
  });

  it("detail by id: A's link resolves for A and is null for B, identical to an unknown id", () => {
    const created = createLink(ctxA, A_INPUT);

    expect(getLink(ctxA, created.id)?.id).toBe(created.id);
    expect(getLink(ctxB, created.id)).toBeNull();
    expect(getLink(ctxDemo, created.id)).toBeNull();
    expect(getLink(ctxB, created.id)).toEqual(getLink(ctxB, "plink_does_not_exist"));
  });

  it("returned rows are copies: mutating the answer cannot reach the store", () => {
    const created = createLink(ctxA, A_INPUT);
    const row = getLink(ctxA, created.id);
    expect(row).not.toBeNull();
    row!.items[0]!.amount = 1;
    row!.payerEmail = "tampered@evil.test";

    expect(getLink(ctxA, created.id)?.items[0]?.amount).toBe(250_000);
    expect(getLink(ctxA, created.id)?.payerEmail).toBe("ap@alpha.test");
  });

  it("expiring A's own link closes it, and only it", () => {
    const a = createLink(ctxA, A_INPUT);
    const b = createLink(ctxB, B_INPUT);

    const closed = expireLink(ctxA, a.id);
    expect(closed.cancelledAt).not.toBeNull();
    expect(getLink(ctxA, a.id)?.status).toBe("CANCELLED");
    expect(getLink(ctxB, b.id)?.status).toBe("OPEN");
  });

  it("expiring a foreign link throws, is attributed, and leaves the target open", () => {
    const b = createLink(ctxB, B_INPUT);

    let caught: unknown;
    try {
      expireLink(ctxA, b.id);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TenantIsolationError);
    expect((caught as TenantIsolationError).code).toBe("CROSS_TENANT_WRITE");
    expect((caught as TenantIsolationError).detail.actorOrg).toBe(ORG_A);
    expect((caught as TenantIsolationError).detail.requestedOrg).toBe(ORG_B);

    // The target is untouched — and so is the actor's own partition.
    expect(getLink(ctxB, b.id)?.status).toBe("OPEN");
    expect(rawLinkPartitions().get(ORG_B)?.links.find((l) => l.id === b.id)?.cancelledAt).toBeNull();
    expect(rawLinkPartitions().get(ORG_A)?.links ?? []).toHaveLength(0);
  });

  it("an unknown link id still answers 'Unknown payment link.' (not an isolation error)", () => {
    expect(() => expireLink(ctxA, "plink_does_not_exist")).toThrow(/Unknown payment link/);
  });
});

describe("G-13b tenant before payment — a foreign link cannot be paid into A's ledger", () => {
  it("paying A's own open link settles into A's ledger and flips the derived status", async () => {
    const a = createLink(ctxA, A_INPUT);
    const result = await recordLinkPayment(ctxA, a.id);

    expect(result.total).toBe(250_000);
    expect(result.transactionId).toBeTruthy();
    expect(getLink(ctxA, a.id)?.status).toBe("PAID");
    expect(getLedgerRows(ctxA).some((t) => t.referenceId === a.id && t.status === "SUCCEEDED")).toBe(true);
    expect(getLedgerRows(ctxB)).toHaveLength(0);
  });

  it("paying B's link from A throws cross-tenant BEFORE any ledger write", async () => {
    const b = createLink(ctxB, B_INPUT);

    let caught: unknown;
    try {
      await recordLinkPayment(ctxA, b.id);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(TenantIsolationError);
    expect((caught as TenantIsolationError).code).toBe("CROSS_TENANT_WRITE");
    expect((caught as TenantIsolationError).detail.actorOrg).toBe(ORG_A);
    expect((caught as TenantIsolationError).detail.requestedOrg).toBe(ORG_B);

    // The money-path assertion: nothing was credited anywhere. Before the order
    // pin, the link resolved from the global store and the transaction landed in
    // the ACTOR's ledger — so both partitions are swept, not just the victim's.
    expect(getLedgerRows(ctxA)).toHaveLength(0);
    expect(getLedgerRows(ctxB)).toHaveLength(0);
    // Demo has its own seeded ledger; what matters is that the refused payment
    // credited nothing referencing B's link anywhere.
    expect(getLedgerRows(ctxDemo).some((t) => t.referenceId === b.id)).toBe(false);
    expect(getLink(ctxB, b.id)?.status).toBe("OPEN");
    expect(rawLinkPartitions().get(ORG_B)?.links.find((l) => l.id === b.id)?.paidAt).toBeNull();
  });

  it("the derived PAID status comes from the caller's own ledger only", async () => {
    // Same link id in two partitions (ids are clock-derived, so this is reachable
    // in production, not just in a test): a settled payment in A must not flip
    // B's identically-id'd link to PAID.
    const a = createLink(ctxA, A_INPUT);
    const collision = { ...B_INPUT };
    const b = createLink(ctxB, collision);
    rawLinkPartitions().get(ORG_B)!.links.find((l) => l.id === b.id)!.id = a.id;

    await recordLinkPayment(ctxA, a.id);

    expect(getLink(ctxA, a.id)?.status).toBe("PAID");
    // B's row now shares the id, and must still be OPEN: its own ledger is empty.
    expect(getLink(ctxB, a.id)?.status).toBe("OPEN");
    expect(getLedgerRows(ctxB)).toHaveLength(0);
  });

  it("an already-paid or closed link cannot be paid twice inside its own tenant", async () => {
    const a = createLink(ctxA, A_INPUT);
    await recordLinkPayment(ctxA, a.id);
    await expect(recordLinkPayment(ctxA, a.id)).rejects.toThrow(/Only open links/);

    const closed = createLink(ctxA, { ...A_INPUT, payerEmail: "closed@alpha.test" });
    expireLink(ctxA, closed.id);
    await expect(recordLinkPayment(ctxA, closed.id)).rejects.toThrow(/Only open links/);
  });
});

describe("G-12e probes, partitions and missing context", () => {
  it("the store holds partitions, not one shared array", () => {
    createLink(ctxA, A_INPUT);
    createLink(ctxB, B_INPUT);

    const partitions = rawLinkPartitions();
    expect([...partitions.keys()].sort()).toEqual([ORG_A, ORG_B].sort());
    expect(partitions.get(ORG_A)?.links).toHaveLength(1);
    expect(partitions.get(ORG_B)?.links).toHaveLength(1);
  });

  it("probes count tenants and never return a link", () => {
    expect(countLinkTenants()).toBe(0);
    expect(soleLinkOrganizationId()).toBeNull();

    createLink(ctxA, A_INPUT);
    expect(countLinkTenants()).toBe(1);
    expect(soleLinkOrganizationId()).toBe(ORG_A);

    createLink(ctxB, B_INPUT);
    expect(countLinkTenants()).toBe(2);
    expect(soleLinkOrganizationId()).toBeNull();
  });

  it("the demo seed counts as exactly one tenant, and reads do not materialise it", () => {
    expect(countLinkTenants()).toBe(0);
    listLinks(ctxDemo, { pageSize: 1 });
    expect(countLinkTenants()).toBe(1);
    expect(soleLinkOrganizationId()).toBe(DEFAULT_DEMO_ORG);
  });

  it("a missing context is rejected on every read and write", () => {
    const missing = undefined as unknown as OrganizationContext;
    expect(() => listLinks(missing)).toThrow();
    expect(() => getLink(missing, "plink_8x9a2b1c")).toThrow();
    expect(() => createLink(missing, A_INPUT)).toThrow();
    expect(() => expireLink(missing, "plink_8x9a2b1c")).toThrow();
    expect(() => parseOrganizationContext({ organizationId: "   " })).toThrow();
  });

  it("deriveLinkStatus and totalOf stay pure — no store, no tenant", () => {
    const link = { id: "plink_pure", cancelledAt: null, paidAt: null, expiresAt: null, items: [{ id: "it_1", label: "x", amount: 10 }] };
    expect(totalOf(link)).toBe(10);
    expect(deriveLinkStatus(link as never, new Set())).toBe("OPEN");
    expect(deriveLinkStatus(link as never, new Set(["plink_pure"]))).toBe("PAID");
    // Purity is the point: these answer identically with two tenants in the store.
    createLink(ctxA, A_INPUT);
    createLink(ctxB, B_INPUT);
    expect(deriveLinkStatus(link as never, new Set())).toBe("OPEN");
  });
});
