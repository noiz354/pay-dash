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
import { getPayoutBatches } from "@/server/data/payouts";

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

  it("CURRENT GAP — getPayoutBatches() is process-wide and rows carry no owner", () => {
    const batches = getPayoutBatches();
    expect(getPayoutBatches.length).toBe(0);
    if (batches.length > 0) {
      expect(Object.keys(batches[0])).not.toContain("organizationId");
    }
    record({
      surface: "server/data/payouts.getPayoutBatches",
      isolated: false,
      mechanism: "NONE — single-tenant demo store (D-09 / Wave 7)",
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
    // Wave 6 measured 2; Wave 7A closed the Transactions half, so the only
    // remaining gap is payouts — and this number must move with reality, which is
    // why `TRANSACTIONS_TENANT_ISOLATION_MATRIX.md` prints the same table.
    expect(gaps.length).toBe(1);
    expect(gaps.map((g) => g.surface)).toEqual(["server/data/payouts.getPayoutBatches"]);
  });
});
