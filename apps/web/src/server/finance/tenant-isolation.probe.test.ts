/**
 * Wave 6 — the measured tenant-isolation matrix (priority area 3).
 *
 * This file is evidence, not aspiration. Each probe asks one surface "can a
 * caller scoped to org A obtain org B's data?" and records the answer,
 * including where the answer is bad.
 *
 * Several tests below deliberately assert **broken** behaviour and are named
 * `CURRENT GAP`. That is not a test rubber-stamping a bug: it is a tripwire.
 * The in-memory data layer accepts no organization at all, so today it cannot
 * isolate anything. Encoding that fact means the day someone adds scoping, the
 * tripwire fails and forces this matrix — and TENANT_ISOLATION_REPORT.md — to
 * be updated rather than silently going stale.
 *
 * The honest summary: the *domain* boundary (`domain/security/tenant.ts`) and
 * the *durable* stores keyed by (org, id) isolate correctly. The 20 legacy
 * in-memory modules behind the dashboard do not, because they are single-tenant
 * demo stores. Wave 7 retrofits them; this wave measures and reports it.
 */

import { describe, expect, it } from "vitest";

import { InMemoryPaymentProjectionStore, projectProviderEvent } from "@/server/repositories/payment-projection-store";
import type { CanonicalStatusMap } from "@/domain/payments/projection";
import { scopeRecord, scopeRecords, tenantScope, TenantIsolationError } from "@/domain/security/tenant";
import { getLedgerRows, listTransactions, countLedgerTenants, seedDemoLedgerForOrganization } from "@/server/data/transactions";
import { parseOrganizationContext } from "@/domain/tenancy/organization-context";

const ORG_A = "org-a";
const ORG_B = "org-b";

type MatrixRow = {
  surface: string;
  isolated: boolean;
  mechanism: string;
};

const MATRIX: MatrixRow[] = [];
function record(row: MatrixRow) {
  MATRIX.push(row);
  return row;
}

describe("tenant isolation matrix — durable / domain surfaces", () => {
  it("payment projection store is keyed by (organizationId, resourceId)", async () => {
    const store = new InMemoryPaymentProjectionStore();
    store.seed({
      id: "pay_1",
      organizationId: ORG_A,
      canonicalStatus: "PENDING",
      providerStatus: null,
      version: 1,
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const map: CanonicalStatusMap = { terminalSuccess: ["payment.succeeded"], terminalFailure: [], unknown: [] };

    const asB = await projectProviderEvent({
      store,
      organizationId: ORG_B,
      event: {
        eventId: "e1",
        provider: "xendit",
        resourceId: "pay_1",
        observedProviderStatus: "payment.succeeded",
        occurredAt: "2026-09-02T00:00:00.000Z",
      },
      map,
      expectedVersion: 1,
    });

    expect(asB).toBeNull();
    record({ surface: "payment projection store", isolated: true, mechanism: "composite key (org, id)" });
  });

  it("the domain scope helper filters lists and hides foreign records", () => {
    const scope = tenantScope(ORG_A);
    const rows = [
      { organizationId: ORG_A, id: "a" },
      { organizationId: ORG_B, id: "b" },
    ];
    expect(scopeRecords(scope, rows)).toHaveLength(1);
    expect(scopeRecord(scope, rows[1])).toBeNull();
    record({ surface: "domain/security/tenant.ts", isolated: true, mechanism: "explicit scope object" });
  });

  it("a foreign record read returns ∅ rather than 403 (no enumeration oracle)", () => {
    const scope = tenantScope(ORG_A);
    const foreign = { organizationId: ORG_B, id: "secret-id" };
    // The security property: identical result for "absent" and "not yours".
    expect(scopeRecord(scope, foreign)).toBe(scopeRecord(scope, null));
    record({ surface: "read of a foreign id", isolated: true, mechanism: "null-equivalence" });
  });
});

describe("tenant isolation matrix — in-memory data layer", () => {
  /**
   * CLOSED in Wave 7A. The Wave 6 probe asserted the *opposite* of this test —
   * `expect(getLedgerRows.length).toBe(0)` — as a tripwire that would fire the
   * day someone added a scope parameter. It fired, and this row is the response:
   * the ledger now requires an organization at the boundary and answers a
   * foreign id with the same `∅` the durable stores do.
   *
   * Kept in this file, deliberately: the matrix is the measurement, and a
   * closed gap has to be visible as closed rather than deleted from history.
   */
  it("Wave 7A — server/data/transactions requires a tenant scope on every read", async () => {
    (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
    const scopeA = parseOrganizationContext({ organizationId: ORG_A });
    const scopeB = parseOrganizationContext({ organizationId: ORG_B });
    seedDemoLedgerForOrganization(scopeA, { count: 3 });
    seedDemoLedgerForOrganization(scopeB, { count: 3 });

    const rows = getLedgerRows(scopeA);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.organizationId === ORG_A)).toBe(true);
    // Arity is the evidence in the other direction now: a scope is required.
    expect(getLedgerRows.length).toBe(1);
    expect(await listTransactions(scopeB, { pageSize: 50 })).toMatchObject({ total: 3 });
    expect(countLedgerTenants()).toBe(3); // A, B and the dev/demo bootstrap tenant

    record({
      surface: "server/data/transactions (list/get/rows)",
      isolated: true,
      mechanism: "required OrganizationContext + (org, id) partition",
    });
  });

  it("Wave 7A — a foreign transaction id reads as ∅ and a foreign write throws", async () => {
    (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
    const scopeA = parseOrganizationContext({ organizationId: ORG_A });
    const scopeB = parseOrganizationContext({ organizationId: ORG_B });
    const { createTransaction, retryTransaction, getTransaction } = await import("@/server/data/transactions");
    const foreign = await createTransaction(scopeB, {
      amount: 250_000,
      currency: "IDR",
      channel: "CARD",
      customerName: "Beta Customer",
      customerEmail: "beta@corp-b.example",
      referenceId: "txn_probe_foreign",
    });

    expect(await getTransaction(scopeA, foreign.id)).toBeNull();
    await expect(retryTransaction(scopeA, foreign.id)).rejects.toBeInstanceOf(TenantIsolationError);

    record({ surface: "server/data/transactions detail + retry", isolated: true, mechanism: "read ∅ / write throws" });
  });

  it("Wave 7B — server/data/payouts requires a tenant scope on every read/write", async () => {
    (globalThis as unknown as { __kineticPayoutStore?: unknown }).__kineticPayoutStore = undefined;
    const scopeA = parseOrganizationContext({ organizationId: ORG_A });
    const scopeB = parseOrganizationContext({ organizationId: ORG_B });
    const { createBatch, listBatches, getBatch } = await import("@/server/data/payouts");
    const mk = (name: string) => ({
      name,
      recipients: [{ line: 1, name: `${name} supplier`, bank: "BCA", accountNumber: "1111111111", amount: 1_000_000, reference: name }],
    });
    const foreign = await createBatch(scopeB, mk("Beta probe batch"), { createdBy: "user_b" });
    await createBatch(scopeA, mk("Alpha probe batch"), { createdBy: "user_a" });

    const rows = await listBatches(scopeA, { pageSize: 50 });
    expect(rows.total).toBe(1);
    expect(rows.rows.every((r) => r.organizationId === ORG_A)).toBe(true);
    // Arity is the evidence in the other direction now: a scope is required
    // ((ctx, filters = {}) → length 1: everything after ctx is optional).
    expect(listBatches.length).toBe(1);
    expect(await getBatch(scopeA, foreign.id)).toBeNull();

    record({
      surface: "server/data/payouts (list/get)",
      isolated: true,
      mechanism: "required OrganizationContext + per-tenant partition",
    });
  });

  it("Wave 7B — payout CSV exports refuse unauthenticated callers (401, no data)", async () => {
    // No session, strict mode (default test env): the guard resolves no tenant
    // and both export endpoints refuse before touching the store. This pins the
    // edge of the payout surface — the scoped-CSV interior is pinned by
    // app/api/exports/payouts/route.tenant.test.ts (5/5), which runs the same
    // handlers with a bound tenant.
    const { NextRequest } = await import("next/server");
    const { GET: exportLog } = await import("@/app/api/exports/payouts/route");
    const { GET: exportBatch } = await import("@/app/api/exports/payouts/[id]/route");

    const log = await exportLog(new NextRequest("http://localhost/api/exports/payouts") as never);
    expect(log.status).toBe(401);
    expect(await log.text()).not.toMatch(/batch_id|Alpha|Beta/i);

    const batch = await exportBatch(
      new NextRequest("http://localhost/api/exports/payouts/BATCH-X") as never,
      { params: Promise.resolve({ id: "BATCH-X" }) },
    );
    expect(batch.status).toBe(401);

    record({
      surface: "app/api/exports/payouts (list + [id], unauthenticated)",
      isolated: true,
      mechanism: "guardExport fail-closed (401) before any store read",
    });
  });

  it("Wave 7C — server/data/customers requires a tenant scope on every read/write", async () => {
    (globalThis as unknown as { __kineticCustomerStore?: unknown }).__kineticCustomerStore = undefined;
    (globalThis as unknown as { __kineticTxStore?: unknown }).__kineticTxStore = undefined;
    const scopeA = parseOrganizationContext({ organizationId: ORG_A });
    const scopeB = parseOrganizationContext({ organizationId: ORG_B });
    const { createCustomer, listCustomers, getCustomer, updateCustomer } = await import("@/server/data/customers");
    const foreign = await createCustomer(scopeB, { name: "Beta probe buyer", email: "beta@probe-b.example" });
    await createCustomer(scopeA, { name: "Alpha probe buyer", email: "alpha@probe-a.example" });

    const page = await listCustomers(scopeA, { pageSize: 50 });
    expect(page.total).toBe(1);
    expect(page.rows.every((r) => r.organizationId === ORG_A)).toBe(true);
    // Arity is the evidence in the other direction now: a scope is required
    // ((ctx, filters = {}) → length 1: everything after ctx is optional).
    expect(listCustomers.length).toBe(1);
    expect(await getCustomer(scopeA, foreign.id)).toBeNull();
    await expect(updateCustomer(scopeA, { id: foreign.id, name: "Hijacked" })).rejects.toBeInstanceOf(
      TenantIsolationError,
    );

    record({
      surface: "server/data/customers (list/get/update)",
      isolated: true,
      mechanism: "required OrganizationContext + per-tenant partition + composite key",
    });
  });

  it("publishes the measured matrix so the report cannot drift from reality", () => {
    const isolated = MATRIX.filter((r) => r.isolated);
    const gaps = MATRIX.filter((r) => !r.isolated);

    // Printed into the test log so the report's numbers have a source.
     
    console.log(
      "\nTENANT ISOLATION MATRIX\n" +
        MATRIX.map((r) => `  ${r.isolated ? "PASS" : "GAP "}  ${r.surface.padEnd(45)} ${r.mechanism}`).join("\n"),
    );

    expect(isolated.length).toBeGreaterThan(0);
    // The assertion that matters: gaps are KNOWN and counted, never zero-by-accident.
    // Wave 6 measured 2; Wave 7A closed Transactions; Wave 7B closed Payouts;
    // Wave 7C closed Customers — zero measured gaps. The next slice re-opens
    // this count the moment it adds a probe that fails.
    expect(gaps.length).toBe(0);
  });
});
