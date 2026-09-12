// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { __resetTenantDenials, listTenantDenials } from "@/server/services/tenant-denial";
import {
  approveRefund,
  countLedgerTenants,
  createTransaction,
  getAnalyticsSeries,
  getLedgerMetrics,
  getLedgerRows,
  getTransaction,
  getTransactionWithSla,
  listRefundsAwaiting,
  listTransactions,
  refundTransaction,
  rejectRefund,
  requestRefund,
  retryTransaction,
  retryTransactionWithVersion,
  seedDemoLedgerForOrganization,
  toCsv,
  type Transaction,
} from "./transactions";

/**
 * Wave 7A — Transactions tenant isolation (spec §7, T-1..T-14).
 *
 * The invariant: **Org A cannot read, search, export, open or mutate a
 * transaction of Org B, even knowing the id.**
 *
 * Every test is a *pair*: "A sees its own" AND "A never sees B's". A test that
 * only checks the second half passes trivially on an empty ledger, which is how
 * a missing predicate hides behind a green suite.
 *
 * The provider read path is mocked module-wide so no test in this file can
 * reach a real SDK; the default is `connected: false` (in-memory ledger), and
 * T-11 swaps in a connected provider deliberately.
 */

const providerReadTransactions = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/provider-read", () => ({
  getProviderReadService: async () => ({
    readTransactions: providerReadTransactions,
    readBalance: vi.fn(async () => ({ connected: false })),
  }),
}));

const ORG_A = "org_alpha";
const ORG_B = "org_beta";
const DEMO_ORG = "org_demo";

const ctxA: OrganizationContext = parseOrganizationContext({ organizationId: ORG_A });
const ctxB: OrganizationContext = parseOrganizationContext({ organizationId: ORG_B });

beforeEach(() => {
  (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
  __resetTenantDenials();
  providerReadTransactions.mockReset();
  providerReadTransactions.mockResolvedValue({ connected: false });
});

/** Two tenants, three known rows each. */
async function twoTenantsSeeded() {
  const a = await Promise.all(
    ["txn_alpha_1", "txn_alpha_2", "txn_alpha_3"].map((referenceId, i) =>
      createTransaction(ctxA, {
        amount: 1_000_000 + i * 100_000,
        currency: "IDR",
        channel: "CARD",
        customerName: "Alpha Customer",
        customerEmail: "alpha@corp-a.example",
        description: "Alpha renewal",
        referenceId,
      }),
    ),
  );
  const b = await Promise.all(
    ["txn_beta_1", "txn_beta_2", "txn_beta_3"].map((referenceId, i) =>
      createTransaction(ctxB, {
        amount: 9_000_000 + i * 100_000,
        currency: "IDR",
        channel: "VA",
        customerName: "Beta Customer",
        customerEmail: "beta@corp-b.example",
        description: "Beta settlement",
        referenceId,
      }),
    ),
  );
  return { a, b };
}

// ---------------------------------------------------------------------------
// T-1 — list
// ---------------------------------------------------------------------------
describe("T-1 Org A lists → only A", () => {
  it("the list contains only A's rows and A's total excludes B", async () => {
    await twoTenantsSeeded();

    const asA = await listTransactions(ctxA, { pageSize: 50, page: 1 });
    const asB = await listTransactions(ctxB, { pageSize: 50, page: 1 });

    expect(asA.total).toBe(3);
    expect(asA.rows).toHaveLength(3);
    expect(asA.rows.every((r) => r.organizationId === ORG_A)).toBe(true);
    expect(asA.rows.map((r) => r.referenceId).sort()).toEqual(["txn_alpha_1", "txn_alpha_2", "txn_alpha_3"]);
    // The paired half: B really does hold rows, so "A sees 3" is scoping, not absence.
    expect(asB.total).toBe(3);
    expect(asB.rows.map((r) => r.referenceId)).toContain("txn_beta_1");
  });

  it("an empty tenant sees an empty ledger rather than the demo one", async () => {
    await twoTenantsSeeded();
    const ctxEmpty = parseOrganizationContext({ organizationId: "org_empty" });
    const { rows, total } = await listTransactions(ctxEmpty, { pageSize: 50 });
    expect(rows).toEqual([]);
    expect(total).toBe(0);
    // …while the demo partition does hold rows — so `rows: []` is isolation.
    expect(getLedgerRows(parseOrganizationContext({ organizationId: DEMO_ORG })).length).toBeGreaterThan(0);
  });

  it("rejects a missing context instead of defaulting to any tenant", async () => {
    await expect(listTransactions(undefined as unknown as OrganizationContext, {})).rejects.toThrow(/organization/i);
    await expect(listTransactions({ organizationId: "" }, {})).rejects.toThrow(/organization/i);
  });
});

// ---------------------------------------------------------------------------
// T-2 — search / filter / refund queue
// ---------------------------------------------------------------------------
describe("T-2 Org A searches → never B", () => {
  it("a needle that matches only B returns nothing for A", async () => {
    await twoTenantsSeeded();
    for (const q of ["txn_beta_1", "Beta Customer", "beta@corp-b.example", "Beta settlement"]) {
      const { rows, total } = await listTransactions(ctxA, { q, pageSize: 50 });
      expect(rows, q).toEqual([]);
      expect(total, q).toBe(0);
    }
    const asB = await listTransactions(ctxB, { q: "Beta settlement", pageSize: 50 });
    expect(asB.total).toBe(3);
  });

  it("a needle both tenants share returns only A's half", async () => {
    await twoTenantsSeeded();
    await createTransaction(ctxB, {
      amount: 9_500_000,
      currency: "IDR",
      channel: "CARD",
      customerName: "Alpha Customer",
      customerEmail: "alpha@corp-b.example",
      description: "shared needle",
      referenceId: "txn_beta_shared",
    });
    expect((await listTransactions(ctxA, { q: "shared needle", pageSize: 50 })).rows).toEqual([]);

    const shared = await listTransactions(ctxA, { q: "Alpha Customer", pageSize: 50 });
    expect(shared.total).toBe(3);
    expect(shared.rows.every((r) => r.organizationId === ORG_A)).toBe(true);
    expect(shared.rows.map((r) => r.referenceId)).not.toContain("txn_beta_shared");
  });

  it("status/channel/range/refundState/sla filters never widen across tenants", async () => {
    await twoTenantsSeeded();
    for (const filters of [
      { status: "PENDING" as const },
      { channel: "VA" as const },
      { range: "all" as const },
      { range: "7d" as const },
      { status: "SUCCEEDED" as const, channel: "VA" as const },
      { refundState: "AWAITING_APPROVAL" as const },
      { sla: "ALL" as const },
    ]) {
      const asA = await listTransactions(ctxA, { ...filters, pageSize: 50 });
      expect(asA.rows.every((r) => r.organizationId === ORG_A), JSON.stringify(filters)).toBe(true);
    }
  });

  it("listRefundsAwaiting is per tenant", async () => {
    await twoTenantsSeeded();
    await requestRefund(ctxB, { transactionId: "txn_beta_1", amount: 100_000, reason: "Duplicate", requestedBy: "user_b" });
    expect(listRefundsAwaiting(ctxB).map((t) => t.id)).toContain("txn_beta_1");
    expect(listRefundsAwaiting(ctxA)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-3 — detail by id (IDOR on reads)
// ---------------------------------------------------------------------------
describe("T-3 Org A detail(B-ID) → indistinguishable from not-found", () => {
  it("reading B's id as A yields exactly what an unknown id yields", async () => {
    const { b } = await twoTenantsSeeded();
    const foreignId = b[0]!.id;

    expect(await getTransaction(ctxA, foreignId)).toBeNull();
    expect(await getTransaction(ctxA, "txn_does_not_exist_at_all")).toBeNull();
    expect(await getTransactionWithSla(ctxA, foreignId)).toBeNull();

    // A can read its own — the null is scoping, not a broken read.
    expect((await getTransaction(ctxA, "txn_alpha_1"))?.referenceId).toBe("txn_alpha_1");
    expect(await getTransactionWithSla(ctxB, foreignId)).not.toBeNull();
  });

  it("an id that exists in both tenants resolves to the caller's own row", async () => {
    await createTransaction(ctxA, {
      amount: 500_000,
      currency: "IDR",
      channel: "CARD",
      customerName: "A",
      customerEmail: "a@a.test",
      description: "A copy",
      referenceId: "txn_shared",
    });
    await createTransaction(ctxB, {
      amount: 9_900_000,
      currency: "IDR",
      channel: "CARD",
      customerName: "B",
      customerEmail: "b@b.test",
      description: "B copy — never visible to A",
      referenceId: "txn_shared",
    });

    const asA = await getTransaction(ctxA, "txn_shared");
    const asB = await getTransaction(ctxB, "txn_shared");
    expect(asA?.amount).toBe(500_000);
    expect(asB?.amount).toBe(9_900_000);
    // The composite key (organizationId, id) is what makes this safe: the id is
    // deliberately identical, the *owner* is what disambiguates the lookup.
    expect(asA?.id).toBe(asB?.id);
    expect(asA?.organizationId).toBe(ORG_A);
    expect(asB?.organizationId).toBe(ORG_B);
    expect(getLedgerRows(ctxA).find((r) => r.amount === 9_900_000)).toBeUndefined();
  });

  it("empty, wildcard and malformed ids are the same non-answer as a foreign id", async () => {
    await twoTenantsSeeded();
    for (const id of ["", "   ", "txn_%", "*", "%", "00000000-0000-4000-8000-000000000000", "../org_beta"]) {
      expect(await getTransaction(ctxA, id), id).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// T-4 / T-5 — mutations (BOLA)
// ---------------------------------------------------------------------------
describe("T-4 Org A retry(B-ID) → denied, B unchanged, denial audited", () => {
  it("the raw retry primitive refuses a foreign row and changes nothing", async () => {
    const { b } = await twoTenantsSeeded();
    const foreign = b[0]!;
    const before = await getTransaction(ctxB, foreign.id);

    await expect(retryTransaction(ctxA, foreign.id)).rejects.toThrow(/cross-tenant/i);

    const after = await getTransaction(ctxB, foreign.id);
    expect(after?.status).toBe(before?.status);
    expect(after?.updatedAt).toBe(before?.updatedAt);
    expect(after?.events).toHaveLength(before?.events.length ?? 0);
  });

  it("the action-facing variant reports the same NOT_FOUND as an unknown id", async () => {
    const { b } = await twoTenantsSeeded();
    const foreign = await retryTransactionWithVersion(ctxA, b[0]!.id);
    const unknown = await retryTransactionWithVersion(ctxA, "0f4c1a37-9e3b-4f7a-9b62-7f1fd5d51e11");
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.code).toBe("NOT_FOUND");
    if (!unknown.ok) expect(unknown.code).toBe(foreign.ok ? "" : foreign.code);
    expect(await retryTransactionWithVersion(ctxA, "txn_alpha_1")).toMatchObject({ ok: true });
  });

  it("records a denial naming the surface, without the neighbour's PII", async () => {
    const { b } = await twoTenantsSeeded();
    await retryTransaction(ctxA, b[0]!.id).catch(() => undefined);

    const denials = listTenantDenials();
    expect(denials).toHaveLength(1);
    const [last] = denials;
    expect(last?.surface).toBe("transactions.retry");
    expect(last?.actorOrg).toBe(ORG_A);
    expect(last?.requestedOrg).toBe(ORG_B);
    const serialized = JSON.stringify(last);
    expect(serialized).not.toContain("beta@corp-b.example");
    expect(serialized).not.toContain("Beta Customer");
  });

  it("A can still retry its own row — the mutation is scoped, not disabled", async () => {
    const { a } = await twoTenantsSeeded();
    expect((await retryTransaction(ctxA, a[0]!.id))?.status).toBe("PROCESSING");
  });
});

describe("T-5 Org A refund(B-ID) → denied at every phase", () => {
  it("request / approve / reject / single-step refund all refuse a foreign id", async () => {
    const { b } = await twoTenantsSeeded();
    const foreignId = b[0]!.id;

    const req = await requestRefund(ctxA, { transactionId: foreignId, amount: 100_000, reason: "please", requestedBy: "user_a" });
    expect(req.ok).toBe(false);
    if (!req.ok) expect(req.code).toBe("NOT_FOUND");

    const approve = await approveRefund(ctxA, { transactionId: foreignId, approvedBy: "user_a" });
    expect(approve.ok).toBe(false);

    const rej = await rejectRefund(ctxA, { transactionId: foreignId, rejectedBy: "user_a" });
    expect(rej.ok).toBe(false);

    await expect(refundTransaction(ctxA, foreignId, 100_000, "cross")).rejects.toThrow(/cross-tenant/i);

    const after = await getTransaction(ctxB, foreignId);
    const before = (await listTransactions(ctxB, { pageSize: 50 })).rows.find((r) => r.id === foreignId)!;
    expect(after?.refundedAmount).toBe(0);
    expect(after?.refundState).toBe("NONE");
    expect(after?.events).toHaveLength(before.events.length);
  });

  it("each phase is audited on its own surface", async () => {
    const { b } = await twoTenantsSeeded();
    const id = b[0]!.id;
    await requestRefund(ctxA, { transactionId: id, amount: 1_000, reason: "x", requestedBy: "a" });
    await approveRefund(ctxA, { transactionId: id, approvedBy: "a" });
    await rejectRefund(ctxA, { transactionId: id, rejectedBy: "a" });
    expect(listTenantDenials().map((d) => d.surface)).toEqual([
      "transactions.refund.request",
      "transactions.refund.approve",
      "transactions.refund.reject",
    ]);
  });

  it("the happy path still works for the owner", async () => {
    const { a } = await twoTenantsSeeded();
    const res = await requestRefund(ctxA, {
      transactionId: a[0]!.id,
      amount: 100_000,
      reason: "duplicate",
      requestedBy: "user_a1",
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(res.ok).toBe(true);
    const approved = await approveRefund(ctxA, {
      transactionId: a[0]!.id,
      approvedBy: "user_a2",
      now: new Date("2026-09-01T01:00:00.000Z"),
    });
    expect(approved.ok).toBe(true);
    if (approved.ok) expect(approved.transaction.refundedAmount).toBe(100_000);
  });
});

// ---------------------------------------------------------------------------
// T-6 — export payload
// ---------------------------------------------------------------------------
describe("T-6 Org A export → contains only A", () => {
  it("the CSV built from A's scoped rows carries no B reference, no B email, no owner column", async () => {
    await twoTenantsSeeded();
    const { rows } = await listTransactions(ctxA, { pageSize: 100 });
    const csv = toCsv(rows);

    expect(csv).toContain("txn_alpha_1");
    expect(csv).not.toContain("txn_beta_1");
    expect(csv).not.toContain("beta@corp-b.example");
    expect(csv).not.toContain(ORG_B);
    // Internal tenancy metadata must not ride along in a downloadable artefact —
    // asserted against the *header vocabulary*, because the column name in a CSV
    // is snake_case and a camelCase substring check would sail straight past it.
    const header = csv.split("\n")[0];
    expect(header.split(",")).toEqual([
      "reference_id",
      "created_at",
      "status",
      "channel",
      "method",
      "customer_name",
      "customer_email",
      "amount",
      "fee",
      "net",
      "currency",
    ]);
    expect(csv.trim().split("\n")).toHaveLength(1 + rows.length);
  });

  it("B's export contains only B", async () => {
    await twoTenantsSeeded();
    const { rows } = await listTransactions(ctxB, { pageSize: 100 });
    const csv = toCsv(rows);
    expect(csv).toContain("txn_beta_1");
    expect(csv).not.toContain("txn_alpha_1");
  });
});

// ---------------------------------------------------------------------------
// T-7 — anti-enumeration
// ---------------------------------------------------------------------------
describe("T-7 guessed UUID / foreign id / unknown id are indistinguishable", () => {
  it("reads cannot be told apart, so ids carry no oracle", async () => {
    const { b } = await twoTenantsSeeded();
    const uuid = "0f4c1a37-9e3b-4f7a-9b62-7f1fd5d51e11";
    const foreign = await getTransaction(ctxA, b[0]!.id);
    const guessed = await getTransaction(ctxA, uuid);
    const unknown = await getTransaction(ctxA, "txn_nope");

    expect(foreign).toBeNull();
    expect(guessed).toBe(unknown);
    expect(await getTransactionWithSla(ctxA, uuid)).toBe(await getTransactionWithSla(ctxA, "txn_nope"));
  });

  it("writes answer both with the same code and the same message", async () => {
    const { b } = await twoTenantsSeeded();
    const foreign = await requestRefund(ctxA, { transactionId: b[1]!.id, amount: 10, reason: "x", requestedBy: "a" });
    const unknown = await requestRefund(ctxA, { transactionId: "0f4c1a37-9e3b-4f7a-9b62-7f1fd5d51e11", amount: 10, reason: "x", requestedBy: "a" });
    expect(foreign.ok).toBe(false);
    expect(unknown.ok).toBe(false);
    if (!foreign.ok && !unknown.ok) {
      expect(foreign.code).toBe(unknown.code);
      expect(foreign.message).toBe(unknown.message);
    }
  });

  it("the distinction lives in the audit log only", async () => {
    const { b } = await twoTenantsSeeded();
    await requestRefund(ctxA, { transactionId: b[1]!.id, amount: 10, reason: "x", requestedBy: "a" });
    await requestRefund(ctxA, { transactionId: "0f4c1a37-9e3b-4f7a-9b62-7f1fd5d51e11", amount: 10, reason: "x", requestedBy: "a" });
    expect(listTenantDenials()).toHaveLength(1);
    expect(listTenantDenials()[0]?.requestedOrg).toBe(ORG_B);
  });
});

// ---------------------------------------------------------------------------
// T-8 — pagination × sort × filter preserve isolation
// ---------------------------------------------------------------------------
describe("T-8 pagination/filter/sort preserve isolation", () => {
  it("no page at any offset of A's traversal contains a B row", async () => {
    seedDemoLedgerForOrganization(ctxA, { count: 25 });
    seedDemoLedgerForOrganization(ctxB, { count: 7 });

    const seen: string[] = [];
    let page = 1;
    // Walk to the end rather than a fixed depth: a bug that only shows on the
    // last page is still a bug.
    for (;;) {
      const res = await listTransactions(ctxA, { page, pageSize: 5 });
      expect(res.rows.every((r) => r.organizationId === ORG_A)).toBe(true);
      seen.push(...res.rows.map((r) => r.id));
      if (page >= res.pageCount) {
        expect(res.total).toBe(25);
        expect(res.pageCount).toBe(5);
        break;
      }
      page += 1;
      expect(page).toBeLessThan(20);
    }
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);

    const bRows = (await listTransactions(ctxB, { pageSize: 50 })).rows;
    expect(seen.some((id) => bRows.some((r) => r.id === id))).toBe(false);
  });

  it("every sort column and direction yields an A-only result set", async () => {
    await twoTenantsSeeded();
    for (const sort of ["date", "amount", "status", "sla"] as const) {
      for (const direction of ["asc", "desc"] as const) {
        const { rows } = await listTransactions(ctxA, { sort, direction, pageSize: 50 });
        expect(rows).toHaveLength(3);
        expect(rows.every((r) => r.organizationId === ORG_A), `${sort}/${direction}`).toBe(true);
      }
    }
  });

  it("sorting by amount desc cannot surface B's larger amounts", async () => {
    await twoTenantsSeeded();
    const { rows } = await listTransactions(ctxA, { sort: "amount", direction: "desc", pageSize: 50 });
    expect(rows[0]?.amount).toBeLessThan(9_000_000);
  });

  it("an out-of-range page clamps inside A's own page set, never into B's", async () => {
    await twoTenantsSeeded();
    const res = await listTransactions(ctxA, { page: 999, pageSize: 2 });
    expect(res.page).toBeLessThanOrEqual(res.pageCount);
    expect(res.rows.every((r) => r.organizationId === ORG_A)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-9 — aggregates and analytics metadata
// ---------------------------------------------------------------------------
describe("T-9 metrics, analytics and derived reads are per tenant", () => {
  it("A's metrics exclude B's volume and row count", async () => {
    await twoTenantsSeeded();
    const mA = await getLedgerMetrics(ctxA);
    const mB = await getLedgerMetrics(ctxB);
    expect(mA.total).toBe(3);
    expect(mB.total).toBe(3);
    // A's rows are ~1M, B's are ~9M: equal totals would mean a leak.
    expect(mA.totalVolume).toBeLessThan(mB.totalVolume);
    expect(mA.totalVolume).toBe(3_300_000);
  });

  it("A's analytics series never contains B's amounts", async () => {
    await twoTenantsSeeded();
    const seriesA = await getAnalyticsSeries(ctxA, 7);
    const seriesB = await getAnalyticsSeries(ctxB, 7);
    const totalA = seriesA.reduce((a, p) => a + p.total, 0);
    const totalB = seriesB.reduce((a, p) => a + p.total, 0);
    expect(totalA).toBe(3_300_000);
    expect(totalB).toBeGreaterThan(totalA);
  });

  it("getLedgerRows is scoped and returns copies", async () => {
    await twoTenantsSeeded();
    const rowsA = getLedgerRows(ctxA);
    expect(rowsA).toHaveLength(3);
    expect(rowsA.every((r) => r.organizationId === ORG_A)).toBe(true);
    const target = rowsA[0]!;
    target.amount = 1;
    expect((await getTransaction(ctxA, target.id))?.amount).not.toBe(1);
  });
});

// ---------------------------------------------------------------------------
// T-10 — create carries an owner
// ---------------------------------------------------------------------------
describe("T-10 create writes into the caller's partition only", () => {
  it("a created transaction is invisible to every other tenant", async () => {
    const created = await createTransaction(ctxA, {
      amount: 250_000,
      currency: "IDR",
      channel: "QRIS",
      customerName: "Solo Alpha",
      customerEmail: "solo@a.test",
      description: "only A",
      referenceId: "txn_solo_a",
    });
    expect(created.organizationId).toBe(ORG_A);

    expect((await listTransactions(ctxB, { pageSize: 50 })).rows).toEqual([]);
    expect(await getTransaction(ctxB, created.id)).toBeNull();
    expect((await listTransactions(ctxA, { pageSize: 50 })).total).toBe(1);
  });

  it("a blank context is a hard error, never a demo fallback", async () => {
    await expect(
      createTransaction({ organizationId: "  " } as OrganizationContext, {
        amount: 1,
        currency: "IDR",
        channel: "CARD",
        customerName: "x",
        customerEmail: "x@x.test",
      }),
    ).rejects.toThrow(/organization/i);
    expect(listTenantDenials()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T-11 — the provider read path is tenant-bound
// ---------------------------------------------------------------------------
describe("T-11 provider-backed ledger read is org-bound", () => {
  function providerRowsFor(orgId: string) {
    return [
      {
        id: `prov_${orgId}`,
        referenceId: `prov_${orgId}`,
        at: new Date().toISOString(),
        amount: 1_000,
        currency: "IDR",
        status: "SUCCEEDED" as const,
        channel: "CARD",
        methodLabel: "Visa •••• 4242",
      },
    ];
  }

  it("asks the provider for the caller's organization, per call", async () => {
    providerReadTransactions.mockImplementation(async (orgId?: string) => ({
      connected: true as const,
      data: providerRowsFor(orgId ?? "NONE"),
    }));

    const asA = await listTransactions(ctxA, { pageSize: 50 });
    expect(providerReadTransactions).toHaveBeenLastCalledWith(ORG_A);
    expect(asA.rows.map((r) => r.referenceId)).toEqual([`prov_${ORG_A}`]);

    const asB = await listTransactions(ctxB, { pageSize: 50 });
    expect(providerReadTransactions).toHaveBeenLastCalledWith(ORG_B);
    expect(asB.rows.map((r) => r.referenceId)).toEqual([`prov_${ORG_B}`]);
    expect(asA.rows[0]?.referenceId).not.toBe(asB.rows[0]?.referenceId);
  });

  it("attributes provider rows to the requesting tenant, never to a global default", async () => {
    providerReadTransactions.mockImplementation(async () => ({
      connected: true as const,
      data: providerRowsFor("whatever"),
    }));
    const { rows } = await listTransactions(ctxA, { pageSize: 50 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.organizationId).toBe(ORG_A);
    // B asking the provider gets B's copy — a provider row cannot be shared state.
    const asB = await listTransactions(ctxB, { pageSize: 50 });
    expect(asB.rows[0]?.organizationId).toBe(ORG_B);
    // Same provider row id, two different owners: the id is never shared state,
    // so B can read/repair it without touching A's copy.
    expect(asB.rows[0]?.id).toBe(rows[0]?.id);
    expect(asB.rows[0]?.organizationId).not.toBe(rows[0]?.organizationId);
  });

  it("never calls the provider with a missing organization", async () => {
    providerReadTransactions.mockResolvedValue({ connected: true, data: [] });
    await listTransactions(ctxA, { pageSize: 50 });
    await listTransactions(ctxB, { pageSize: 50 });
    const calledWith = providerReadTransactions.mock.calls.map((c) => c[0]);
    expect(calledWith.every((org) => typeof org === "string" && org.trim().length > 0)).toBe(true);
    expect(calledWith).not.toContain(undefined);
    expect(calledWith).not.toContain(DEMO_ORG);
  });

  it("a connected provider cannot make A's search match B's rows", async () => {
    providerReadTransactions.mockImplementation(async (orgId?: string) => ({
      connected: true as const,
      data: providerRowsFor(orgId ?? "NONE"),
    }));
    const { rows } = await listTransactions(ctxA, { q: `prov_${ORG_B}`, pageSize: 50 });
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T-12 — the quarantine fails closed once a second tenant exists
// ---------------------------------------------------------------------------
describe("T-12 legacy unscoped readers", () => {
  it("serve the single demo tenant, then refuse the moment a second exists", async () => {
    const { legacyLedgerRows } = await import("./transactions-unscoped");

    // Boot state: one tenant (the dev/demo ledger) — the legacy readers work.
    expect(countLedgerTenants()).toBe(1);
    expect(legacyLedgerRows("balance").length).toBeGreaterThan(0);
    expect(legacyLedgerRows("balance").every((r) => r.organizationId === DEMO_ORG)).toBe(true);

    seedDemoLedgerForOrganization(ctxA, { count: 4 });
    expect(countLedgerTenants()).toBe(2);
    expect(() => legacyLedgerRows("balance")).toThrow(/more than one tenant/i);
  });

  it("names the surface that tried to read across the boundary", async () => {
    const { legacyLedgerRows, UnscopedLedgerAccessError } = await import("./transactions-unscoped");
    seedDemoLedgerForOrganization(ctxA, { count: 1 });
    seedDemoLedgerForOrganization(ctxB, { count: 1 });
    try {
      legacyLedgerRows("audit");
      throw new Error("unreachable");
    } catch (e) {
      expect(e).toBeInstanceOf(UnscopedLedgerAccessError);
      expect((e as Error).message).toContain("audit");
      expect((e as Error).message).toMatch(/Wave 7B/);
    }
  });

  it("counts tenants from the store rather than from a caller-supplied claim", async () => {
    expect(countLedgerTenants()).toBe(1);
    seedDemoLedgerForOrganization(ctxA, { count: 2 });
    seedDemoLedgerForOrganization(ctxB, { count: 2 });
    expect(countLedgerTenants()).toBe(3);
  });

  it("the legacy list path is guarded the same way", async () => {
    const { legacyListTransactions } = await import("./transactions-unscoped");
    const single = await legacyListTransactions("customers", { pageSize: 50 });
    expect(single.rows.every((r) => r.organizationId === DEMO_ORG)).toBe(true);

    seedDemoLedgerForOrganization(ctxA, { count: 1 });
    await expect(legacyListTransactions("customers", { pageSize: 50 })).rejects.toThrow(/more than one tenant/i);
  });
});

// ---------------------------------------------------------------------------
// T-14 — the row itself carries an owner
// ---------------------------------------------------------------------------
describe("T-14 row ownership", () => {
  it("every row of every partition carries a non-empty owner", () => {
    seedDemoLedgerForOrganization(ctxA, { count: 3 });
    const owned: Transaction[] = getLedgerRows(ctxA);
    expect(owned.length).toBeGreaterThan(0);
    expect(owned.every((r) => typeof r.organizationId === "string" && r.organizationId.length > 0)).toBe(true);
    const demo: Transaction[] = getLedgerRows(parseOrganizationContext({ organizationId: DEMO_ORG }));
    expect(demo.every((r) => r.organizationId === DEMO_ORG)).toBe(true);
  });

  it("an orphan row cannot be read by any tenant (fail-closed on a missing owner)", async () => {
    // Simulate the defect Wave 7A is designed around: a row that exists but
    // belongs to nobody. It must be invisible, not "everyone's". Reached through
    // the store slot on purpose — the whole point is that no public API can
    // produce this state, so a test has to.
    seedDemoLedgerForOrganization(ctxA, { count: 2 });
    const store = (globalThis as unknown as { __kineticTxStore: { byOrganization: Map<string, Transaction[]> } }).__kineticTxStore;
    const orphan = { ...getLedgerRows(ctxA)[0]!, organizationId: "" } as Transaction;
    store.byOrganization.set("org_orphan", [orphan]);
    for (const ctx of [ctxA, ctxB, parseOrganizationContext({ organizationId: "org_orphan" })]) {
      expect(getLedgerRows(ctx).some((r) => r.organizationId === "")).toBe(false);
    }
    expect(countLedgerTenants()).toBeGreaterThanOrEqual(3);
  });
});
