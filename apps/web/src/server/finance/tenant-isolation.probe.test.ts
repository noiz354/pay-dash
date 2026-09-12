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
import { scopeRecord, scopeRecords, tenantScope } from "@/domain/security/tenant";
import { getLedgerRows } from "@/server/data/transactions";
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

describe("tenant isolation matrix — legacy in-memory data layer", () => {
  /**
   * CURRENT GAP. `getLedgerRows()` takes no organization argument, so there is
   * no parameter through which isolation *could* be expressed. Every caller
   * sees the same process-wide rows.
   */
  it("CURRENT GAP — getLedgerRows() is process-wide and accepts no tenant scope", () => {
    const rows = getLedgerRows();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    // The function's own arity is the evidence: nothing to scope by.
    expect(getLedgerRows.length).toBe(0);
    // And no row carries an owning organization.
    expect(Object.keys(rows[0] ?? {})).not.toContain("organizationId");
    record({
      surface: "server/data/transactions.getLedgerRows",
      isolated: false,
      mechanism: "NONE — single-tenant demo store (D-09 / Wave 7)",
    });
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
    expect(gaps.length).toBe(2);
  });
});
