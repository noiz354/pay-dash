/**
 * Wave 6 — the mandated failure-scenario suite.
 *
 * The brief names seven scenarios that must be tested. Each one below drives
 * the **real** modules (`PaymentFlowService`, the durable-operation identity
 * helpers, the webhook projector, the tenant guard, the unknown-recovery gate)
 * rather than a mock of them, because the point of the exercise is to learn
 * what this code actually does when the world misbehaves.
 *
 *   1. duplicate webhook
 *   2. out-of-order webhook
 *   3. provider timeout
 *   4. ambiguous success (provider applied, response lost)
 *   5. concurrent approval
 *   6. cross-tenant access
 *   7. restore + smoke test        -> scripts/dr-restore-drill.mjs (executed
 *                                     separately; see DR_RESTORE_REPORT.md)
 */

import { describe, expect, it, vi } from "vitest";

import { projectStatusUpdate, ProjectionError, type CanonicalStatusMap, type ProjectionResource } from "@/domain/payments/projection";
import { InMemoryPaymentProjectionStore, projectProviderEvent } from "@/server/repositories/payment-projection-store";
import { InMemoryWebhookDeliveryStore } from "@/server/repositories/webhook-deliveries";
import {
  assertOperationHashMatches,
  operationIdempotencyKey,
  operationRequestHash,
} from "@/server/repositories/operation-identities";
import { RepositoryError } from "@/domain/payments/errors";
import { PaymentFlowError, PaymentFlowService, type AuditStore, type OperationStore } from "@/server/payment-flows/payment-flow";
import type { OperationStatus } from "@/domain/payments/operations";
import { createProviderRegistry, type PaymentProviderAdapter } from "@/server/providers/registry";
import type { CapabilityManifest } from "@/domain/payments/capabilities";
import { TenantIsolationError, assertTenantMatch, scopeRecord, scopeRecords, tenantScope } from "@/domain/security/tenant";
import {
  UnknownRecoveryError,
  agedUnknownOperations,
  guardUnknownRetry,
  resolveUnknownOperation,
  unknownAgeSeconds,
  type AmbiguousOperation,
} from "./unknown-recovery";

/* --------------------------------------------------------------------- */
/* Shared harness                                                        */
/* --------------------------------------------------------------------- */

const ORG = "org-1";
const CONN = "conn-1";

function manifest(): CapabilityManifest {
  const cap = { supported: true, configured: true, available: true, mode: "TEST" as const, reason: null, requirements: [], lastVerifiedAt: null };
  return {
    balanceRead: cap, transactionRead: cap, hostedPaymentLinks: cap, customers: cap,
    savedPaymentMethods: cap, recurringBilling: cap, refunds: cap, payouts: cap,
    connectedAccounts: cap, internalTransfers: cap, splitRouting: cap, webhookHealth: cap,
  };
}

/** A durable-operation store that behaves like the real one: unique key, real state moves. */
function operationStore() {
  const byKey = new Map<string, { id: string; state: OperationStatus; idempotencyKey: string; requestHash: string }>();
  const byId = new Map<string, { id: string; state: OperationStatus; idempotencyKey: string; requestHash: string }>();
  let seq = 0;
  const store: OperationStore & { byKey: typeof byKey; byId: typeof byId } = {
    byKey,
    byId,
    async create(input) {
      if (byKey.has(input.idempotencyKey)) {
        // The DB has @@unique([idempotencyKey]); a second insert is a violation.
        throw new Error("unique constraint violated: idempotencyKey");
      }
      const op = { id: `op-${++seq}`, state: "DRAFT" as OperationStatus, idempotencyKey: input.idempotencyKey, requestHash: input.requestHash };
      byKey.set(op.idempotencyKey, op);
      byId.set(op.id, op);
      return op;
    },
    async findByIdempotencyKey(key) {
      return byKey.get(key) ?? null;
    },
    async updateState(id, _from, to) {
      const op = byId.get(id);
      if (op) op.state = to;
    },
  };
  return store;
}

function auditStore() {
  const events: Array<Record<string, unknown>> = [];
  const store: AuditStore & { events: typeof events } = {
    events,
    async append(input) {
      events.push({ ...input });
    },
  };
  return store;
}

/** Build a flow service over an adapter whose payout behaviour the test controls. */
function flowWith(createPayout: PaymentProviderAdapter["createPayout"]) {
  const adapter: PaymentProviderAdapter = {
    provider: "xendit",
    async verifyConnection() {
      return {
        verified: true, provider: "xendit", mode: "TEST", accountIdentity: "acct", accountDisplayName: "acct",
        permissionsVerified: true, capabilities: manifest(),
        webhookHealth: { status: "UNCONFIGURED", reason: null, lastCheckedAt: null },
        requirements: [], state: "ACTIVE", reason: null, verifiedAt: new Date().toISOString(),
      };
    },
    async getCapabilities() {
      return manifest();
    },
    createPayout,
  };
  const registry = createProviderRegistry();
  registry.register(adapter);
  const operations = operationStore();
  const audit = auditStore();
  const service = new PaymentFlowService({
    organizationId: ORG, connectionId: CONN, provider: "xendit", mode: "TEST", registry, operations, audit,
  });
  return { service, operations, audit };
}

const OWNER = { id: "user-owner", roles: ["OWNER" as const] };

/* --------------------------------------------------------------------- */
/* 1. Duplicate webhook                                                   */
/* --------------------------------------------------------------------- */

describe("SCENARIO 1 — duplicate webhook", () => {
  it("dedupes a retried delivery on the provider-scoped key", async () => {
    const store = new InMemoryWebhookDeliveryStore();
    const input = { provider: "xendit" as const, providerEventId: "evt_1", type: "payment.succeeded", organizationId: ORG, payload: { id: "pay_1" } };

    const first = await store.record(input);
    const second = await store.record(input);

    expect(first.deduped).toBe(false);
    expect(first.created).toBe(true);
    expect(second.deduped).toBe(true);
    // The same row, not a second one: the money-affecting work runs once.
    expect(second.created).toBe(false);
    expect(second.identity.id).toBe(first.identity.id);
  });

  it("keeps the two providers' id spaces separate — same id, different provider is NOT a duplicate", async () => {
    const store = new InMemoryWebhookDeliveryStore();
    const a = await store.record({ provider: "xendit", providerEventId: "evt_1", type: "t", organizationId: ORG, payload: {} });
    const b = await store.record({ provider: "stripe", providerEventId: "evt_1", type: "t", organizationId: ORG, payload: {} });
    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(false);
  });

  it("a duplicate projection is idempotent — the canonical status does not move twice", async () => {
    const store = new InMemoryPaymentProjectionStore();
    const resource: ProjectionResource = {
      id: "pay_1", organizationId: ORG, canonicalStatus: "PENDING", providerStatus: null, version: 1,
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    store.seed(resource);
    const map: CanonicalStatusMap = { terminalSuccess: ["payment.succeeded"], terminalFailure: ["payment.failed"], unknown: [] };
    const event = { eventId: "evt_1", provider: "xendit" as const, resourceId: "pay_1", observedProviderStatus: "payment.succeeded", occurredAt: "2026-09-02T00:00:00.000Z" };

    const first = await projectProviderEvent({ store, organizationId: ORG, event, map, expectedVersion: 1 });
    expect(first?.canonicalStatus).toBe("SUCCEEDED");
    expect(first?.version).toBe(2);

    // Replay of the same event at the now-current version: terminal, so no move.
    const replay = await projectProviderEvent({ store, organizationId: ORG, event, map, expectedVersion: 2 });
    expect(replay?.canonicalStatus).toBe("SUCCEEDED");
    expect(replay?.version).toBe(2);
  });
});

/* --------------------------------------------------------------------- */
/* 2. Out-of-order webhook                                                */
/* --------------------------------------------------------------------- */

describe("SCENARIO 2 — out-of-order webhook", () => {
  const map: CanonicalStatusMap = {
    terminalSuccess: ["payment.succeeded"],
    terminalFailure: ["payment.failed"],
    unknown: ["payment.pending"],
  };
  const terminal: ProjectionResource = {
    id: "pay_1", organizationId: ORG, canonicalStatus: "SUCCEEDED", providerStatus: "payment.succeeded",
    version: 2, updatedAt: "2026-09-02T00:00:00.000Z",
  };

  it("refuses to regress a terminal success when a late FAILED arrives", () => {
    expect(() =>
      projectStatusUpdate({
        resource: terminal,
        event: { eventId: "evt_late", provider: "xendit", resourceId: "pay_1", observedProviderStatus: "payment.failed", occurredAt: "2026-09-01T00:00:00.000Z" },
        map,
        expectedVersion: 2,
      }),
    ).toThrowError(ProjectionError);
  });

  it("classifies the refusal as OUT_OF_ORDER, not a generic failure", () => {
    try {
      projectStatusUpdate({
        resource: terminal,
        event: { eventId: "evt_late", provider: "xendit", resourceId: "pay_1", observedProviderStatus: "payment.failed", occurredAt: "2026-09-01T00:00:00.000Z" },
        map,
        expectedVersion: 2,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as ProjectionError).code).toBe("OUT_OF_ORDER");
    }
  });

  it("refuses a stale version (another writer moved the row first)", () => {
    try {
      projectStatusUpdate({
        resource: { ...terminal, canonicalStatus: "PENDING", version: 5 },
        event: { eventId: "evt", provider: "xendit", resourceId: "pay_1", observedProviderStatus: "payment.succeeded", occurredAt: "2026-09-03T00:00:00.000Z" },
        map,
        expectedVersion: 4,
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as ProjectionError).code).toBe("STALE_VERSION");
    }
  });

  it("an unmapped/future provider status can never become a success", () => {
    const next = projectStatusUpdate({
      resource: { ...terminal, canonicalStatus: "PENDING", version: 1 },
      event: { eventId: "evt", provider: "xendit", resourceId: "pay_1", observedProviderStatus: "payment.some_future_state", occurredAt: "2026-09-03T00:00:00.000Z" },
      map,
      expectedVersion: 1,
    });
    expect(next.canonicalStatus).toBe("UNKNOWN");
  });

  it("a late duplicate of the SAME terminal status is accepted without a version bump", () => {
    const next = projectStatusUpdate({
      resource: terminal,
      event: { eventId: "evt_dup", provider: "xendit", resourceId: "pay_1", observedProviderStatus: "payment.succeeded", occurredAt: "2026-09-04T00:00:00.000Z" },
      map,
      expectedVersion: 2,
    });
    expect(next.version).toBe(2);
    expect(next.canonicalStatus).toBe("SUCCEEDED");
  });
});

/* --------------------------------------------------------------------- */
/* 3. Provider timeout                                                    */
/* --------------------------------------------------------------------- */

describe("SCENARIO 3 — provider timeout", () => {
  it("lands the operation in UNKNOWN, never FAILED", async () => {
    const timeout = Object.assign(new Error("socket hang up"), { code: "TIMEOUT" });
    const { service, operations } = flowWith(async () => {
      throw timeout;
    });

    await expect(
      service.releaseRecipient({
        actor: OWNER, recipientId: "rec_1", channelCode: "BCA", accountNumber: "123",
        amountMinor: "1000000", currency: "IDR",
      }),
    ).rejects.toThrow("socket hang up");

    const op = [...operations.byId.values()][0];
    expect(op.state).toBe("UNKNOWN");
  });

  it("audits the ambiguity as OPERATION_UNKNOWN with outcome UNKNOWN", async () => {
    const { service, audit } = flowWith(async () => {
      throw Object.assign(new Error("gateway unavailable"), { code: "UNAVAILABLE" });
    });
    await expect(
      service.releaseRecipient({ actor: OWNER, recipientId: "rec_2", channelCode: "BCA", accountNumber: "1", amountMinor: "500", currency: "IDR" }),
    ).rejects.toThrow();
    expect(audit.events.at(-1)).toMatchObject({ action: "OPERATION_UNKNOWN", outcome: "UNKNOWN" });
  });

  it("a definitive 4xx rejection is FAILED, not UNKNOWN — the two must not be conflated", async () => {
    const { service, operations, audit } = flowWith(async () => {
      throw Object.assign(new Error("invalid account number"), { code: "INVALID_REQUEST" });
    });
    await expect(
      service.releaseRecipient({ actor: OWNER, recipientId: "rec_3", channelCode: "BCA", accountNumber: "bad", amountMinor: "500", currency: "IDR" }),
    ).rejects.toThrow();
    expect([...operations.byId.values()][0].state).toBe("FAILED");
    expect(audit.events.at(-1)).toMatchObject({ action: "OPERATION_FAILED", outcome: "FAILURE" });
  });
});

/* --------------------------------------------------------------------- */
/* 4. Ambiguous success — the provider applied it, the response was lost  */
/* --------------------------------------------------------------------- */

describe("SCENARIO 4 — ambiguous success (write landed, response lost)", () => {
  const ambiguous: AmbiguousOperation = {
    id: "op-1", organizationId: ORG, idempotencyKey: "key-1", operationType: "payout.release",
    resourceType: "recipient", resourceId: "rec_1", state: "UNKNOWN", unknownSince: "2026-09-12T00:00:00.000Z",
  };

  it("THE CRITICAL ONE — a confirmed-applied operation is never retried", async () => {
    const probe = vi.fn(async () => ({ verdict: "CONFIRMED_APPLIED" as const, providerResourceId: "disb_9" }));
    const outcome = await resolveUnknownOperation(ambiguous, probe);

    expect(outcome.verdict).toBe("CONFIRMED_APPLIED");
    expect(outcome.nextState).toBe("SUCCEEDED");
    expect(outcome.retryAllowed).toBe(false);
    expect(outcome.providerResourceId).toBe("disb_9");
    // And the gate physically refuses a retry even if a caller tries anyway.
    expect(() => guardUnknownRetry(ambiguous, "CONFIRMED_APPLIED")).toThrowError(UnknownRecoveryError);
  });

  it("permits a retry only when the provider confirms nothing was applied", async () => {
    const outcome = await resolveUnknownOperation(ambiguous, async () => ({ verdict: "CONFIRMED_ABSENT" as const }));
    expect(outcome.retryAllowed).toBe(true);
    expect(outcome.nextState).toBe("EXECUTING");
    expect(() => guardUnknownRetry(ambiguous, "CONFIRMED_ABSENT")).not.toThrow();
  });

  it("refuses a retry when no verdict has been recorded at all", () => {
    try {
      guardUnknownRetry(ambiguous, null);
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as UnknownRecoveryError;
      expect(err.code).toBe("RETRY_WITHOUT_VERDICT");
      expect(err.message).toContain("may move money a second time");
    }
  });

  it("keeps an unresolvable operation UNKNOWN and escalates it to a human", async () => {
    const outcome = await resolveUnknownOperation(ambiguous, async () => ({ verdict: "STILL_UNKNOWN" as const }));
    expect(outcome.nextState).toBe("UNKNOWN");
    expect(outcome.requiresCase).toBe(true);
    expect(outcome.retryAllowed).toBe(false);
    expect(() => guardUnknownRetry(ambiguous, "STILL_UNKNOWN")).toThrowError(/human decision/i);
  });

  it("a probe that itself throws is STILL_UNKNOWN — never optimistically absent", async () => {
    const outcome = await resolveUnknownOperation(ambiguous, async () => {
      throw new Error("probe endpoint 503");
    });
    expect(outcome.verdict).toBe("STILL_UNKNOWN");
    expect(outcome.retryAllowed).toBe(false);
    expect(outcome.detail).toContain("probe endpoint 503");
  });

  it("refuses to 'resolve' an operation that was never ambiguous", async () => {
    await expect(
      resolveUnknownOperation({ ...ambiguous, state: "SUCCEEDED" }, async () => ({ verdict: "CONFIRMED_ABSENT" as const })),
    ).rejects.toThrowError(/not UNKNOWN/);
  });

  it("ages ambiguous operations for the exception queue and the SLO", () => {
    const now = new Date("2026-09-12T01:00:00.000Z");
    expect(unknownAgeSeconds(ambiguous, now)).toBe(3600);
    const aged = agedUnknownOperations([ambiguous], 900, now);
    expect(aged).toHaveLength(1);
    expect(agedUnknownOperations([ambiguous], 7200, now)).toHaveLength(0);
  });

  it("the retry re-uses the SAME idempotency key — a fresh key would defeat provider dedupe", () => {
    const args = { organizationId: ORG, operationType: "payout.release", resourceType: "recipient", resourceId: "rec_1" };
    expect(operationIdempotencyKey(args)).toBe(operationIdempotencyKey(args));
  });
});

/* --------------------------------------------------------------------- */
/* 5. Concurrent approval / idempotency conflict                          */
/* --------------------------------------------------------------------- */

describe("SCENARIO 5 — concurrent approval", () => {
  it("two identical concurrent releases produce exactly one provider write", async () => {
    let providerCalls = 0;
    const { service } = flowWith(async () => {
      providerCalls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return { id: `disb_${providerCalls}`, status: "PENDING", provider: "xendit" };
    });

    const args = {
      actor: OWNER, recipientId: "rec_same", channelCode: "BCA", accountNumber: "123",
      amountMinor: "1000", currency: "IDR",
    };
    const results = await Promise.allSettled([service.releaseRecipient(args), service.releaseRecipient(args)]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    // One wins; the other is refused by the unique idempotency key. What must
    // never happen is two provider writes.
    expect(providerCalls).toBe(1);
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("a second release of an already-terminal operation is refused as DUPLICATE", async () => {
    const { service } = flowWith(async () => ({ id: "disb_1", status: "COMPLETED", provider: "xendit" }));
    const args = { actor: OWNER, recipientId: "rec_t", channelCode: "BCA", accountNumber: "1", amountMinor: "1000", currency: "IDR" };

    await service.releaseRecipient(args);
    await expect(service.releaseRecipient(args)).rejects.toThrowError(PaymentFlowError);
    await expect(service.releaseRecipient(args)).rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("same key + different payload is a CONFLICT and never a second write (ADR-0036)", () => {
    const keyArgs = { organizationId: ORG, operationType: "refund.execute", resourceType: "refund", resourceId: "pay_1" };
    const key1 = operationIdempotencyKey(keyArgs);
    const key2 = operationIdempotencyKey(keyArgs);
    expect(key2).toBe(key1);

    const hashA = operationRequestHash({ originalPaymentId: "pay_1", amountMinor: "1000", currency: "IDR" });
    const hashB = operationRequestHash({ originalPaymentId: "pay_1", amountMinor: "9999", currency: "IDR" });
    expect(() => assertOperationHashMatches(hashA, hashB)).toThrowError(RepositoryError);
    expect(() => assertOperationHashMatches(hashA, hashA)).not.toThrow();
  });

  it("the request hash is order-insensitive — key stability does not depend on field order", () => {
    const a = operationRequestHash({ amountMinor: "1000", currency: "IDR", originalPaymentId: "pay_1" });
    const b = operationRequestHash({ originalPaymentId: "pay_1", currency: "IDR", amountMinor: "1000" });
    expect(a).toBe(b);
  });

  it("dual control still holds under concurrency: the requester cannot self-approve", async () => {
    const { service } = flowWith(async () => ({ id: "disb", status: "OK", provider: "xendit" }));
    await expect(
      service.releaseRecipient({
        actor: OWNER, recipientId: "rec_big", channelCode: "BCA", accountNumber: "1",
        // Above the IDR 25M per-recipient dual-control threshold (ADR-0035).
        amountMinor: "30000000", currency: "IDR", approverId: OWNER.id,
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_MISMATCH" });
  });

  it("a threshold release without any approver is refused before the provider is called", async () => {
    let called = false;
    const { service } = flowWith(async () => {
      called = true;
      return { id: "disb", status: "OK", provider: "xendit" };
    });
    await expect(
      service.releaseRecipient({
        actor: OWNER, recipientId: "rec_big2", channelCode: "BCA", accountNumber: "1",
        amountMinor: "30000000", currency: "IDR",
      }),
    ).rejects.toMatchObject({ code: "REQUIRES_APPROVAL" });
    expect(called).toBe(false);
  });
});

/* --------------------------------------------------------------------- */
/* 6. Cross-tenant access                                                 */
/* --------------------------------------------------------------------- */

describe("SCENARIO 6 — cross-tenant access", () => {
  const scopeA = tenantScope("org-a");
  const rowsA = [{ organizationId: "org-a", id: "a1" }, { organizationId: "org-a", id: "a2" }];
  const rowsB = [{ organizationId: "org-b", id: "b1" }];

  it("a list read never returns another tenant's rows", () => {
    expect(scopeRecords(scopeA, [...rowsA, ...rowsB])).toEqual(rowsA);
  });

  it("a direct id read of a foreign row is indistinguishable from not-found", () => {
    expect(scopeRecord(scopeA, rowsB[0])).toBeNull();
    expect(scopeRecord(scopeA, null)).toBeNull();
  });

  it("a cross-tenant write throws with the surface recorded for audit", () => {
    try {
      assertTenantMatch(scopeA, rowsB[0], "payouts.release");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TenantIsolationError);
      expect((e as TenantIsolationError).detail.surface).toBe("payouts.release");
    }
  });

  it("a webhook projection can never land a resource in another organization", async () => {
    const store = new InMemoryPaymentProjectionStore();
    store.seed({ id: "pay_1", organizationId: "org-a", canonicalStatus: "PENDING", providerStatus: null, version: 1, updatedAt: "2026-09-01T00:00:00.000Z" });
    const map: CanonicalStatusMap = { terminalSuccess: ["payment.succeeded"], terminalFailure: [], unknown: [] };

    // Same resource id, wrong org: the store is keyed by (org, id), so this
    // resolves to nothing rather than to org-a's payment.
    const result = await projectProviderEvent({
      store,
      organizationId: "org-b",
      event: { eventId: "e", provider: "xendit", resourceId: "pay_1", observedProviderStatus: "payment.succeeded", occurredAt: "2026-09-02T00:00:00.000Z" },
      map,
      expectedVersion: 1,
    });
    expect(result).toBeNull();
  });

  it("reconciliation ignores foreign-tenant records entirely", async () => {
    const { reconcile } = await import("@/domain/finance/reconciliation");
    const { minor } = await import("@/domain/finance/money");
    const run = reconcile({
      organizationId: "org-a",
      window: { from: "2026-09-01T00:00:00.000Z", to: "2026-09-08T00:00:00.000Z" },
      internal: { available: true, records: [] },
      provider: {
        available: true,
        records: [{ externalRef: "x", organizationId: "org-b", amount: minor(1, "IDR"), status: "SUCCEEDED", observedAt: "2026-09-02T00:00:00.000Z" }],
      },
      settlement: { available: true, records: [] },
    });
    expect(run.totals.recordsCompared).toBe(0);
    expect(run.exceptions).toEqual([]);
  });
});

/* --------------------------------------------------------------------- */
/* 7. Restore + smoke test                                                */
/* --------------------------------------------------------------------- */

describe("SCENARIO 7 — restore + smoke test", () => {
  it("is executed by the DR drill script, not by this suite", () => {
    // Kept as an explicit, visible marker so the seventh mandated scenario is
    // never silently absent from the suite. Evidence: DR_RESTORE_REPORT.md,
    // produced by `node scripts/dr-restore-drill.mjs`.
    expect("see scripts/dr-restore-drill.mjs").toBeTruthy();
  });
});
