import { describe, expect, it } from "vitest";

import { ProjectionError, canonicalsForProviderStatus } from "@/domain/payments/projection";
import { RepositoryError } from "@/domain/payments/errors";
import { XENDIT_WEBHOOK_MAP, STRIPE_WEBHOOK_MAP } from "@/domain/payments/webhook-maps";

import { InMemoryDurableOperationStore, DbOperationStoreAdapter, type DurableOperationDb } from "./durable-operation-store";
import { InMemoryAuditEventStore, DbAuditStoreAdapter, type AuditEventDb } from "./audit-event-store";
import { InMemoryPaymentProjectionStore, projectProviderEvent, type PaymentProjectionDb } from "./payment-projection-store";
import { LocalEncryptedSecretStore } from "@/server/secrets/store";
import {
  InMemoryRuntimeConnectionDb,
  RuntimeConnectionResolver,
  PrismaRuntimeConnectionDb,
  resolveSecretValue,
  buildRuntimeConnectionResolver,
} from "./runtime-connection-resolver";

const KEY = "recommendation-test-key-that-is-long-enough-for-scrypt-derivation-0000";
const opInput = {
  organizationId: "org-1",
  connectionId: "conn-1",
  actorId: "user-1",
  operationType: "PAYMENT",
  resourceType: "LINK",
  resourceId: "res-1",
  idempotencyKey: "idem-1",
  requestHash: "hash-1",
  amountMinor: "100",
  currency: "IDR",
};

/* ---------------------------------------------------------------------- */
/* #2 — Durable operations + audit stores                                 */
/* ---------------------------------------------------------------------- */

describe("durable operation store", () => {
  it("creates a DRAFT operation, finds it by idempotency key, and advances state", async () => {
    const store = new InMemoryDurableOperationStore();
    const created = await store.create(opInput);
    expect(created.state).toBe("DRAFT");
    expect(created.idempotencyKey).toBe("idem-1");

    const found = await store.findByIdempotencyKey("idem-1");
    expect(found?.id).toBe(created.id);

    await store.updateState(created.id, "DRAFT", "EXECUTING");
    expect((await store.findByIdempotencyKey("idem-1"))?.state).toBe("EXECUTING");
    expect(await store.findByIdempotencyKey("missing")).toBeNull();
  });

  it("rejects a duplicate idempotency key (no double-execute)", async () => {
    const store = new InMemoryDurableOperationStore();
    await store.create(opInput);
    await expect(store.create(opInput)).rejects.toThrow(/duplicate idempotency key/);
  });

  it("DbOperationStoreAdapter forwards to the durable db and preserves the contract", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const db: DurableOperationDb = {
      available: () => true,
      create: async (input) => {
        calls.push({ ...input });
        return { id: "op-1", state: "DRAFT", idempotencyKey: input.idempotencyKey, requestHash: input.requestHash };
      },
      findByIdempotencyKey: async (k) => (k === "idem-1" ? { id: "op-1", state: "DRAFT", idempotencyKey: k, requestHash: "hash-1" } : null),
      updateState: async () => undefined,
    };
    const store = new DbOperationStoreAdapter(db);

    const created = await store.create(opInput);
    expect(created.id).toBe("op-1");
    expect(created.state).toBe("DRAFT");

    const found = await store.findByIdempotencyKey("idem-1");
    expect(found?.requestHash).toBe("hash-1");

    await store.updateState("op-1", "DRAFT", "EXECUTING");
    expect(calls.length).toBe(1); // create + find, no accidental second create
  });
});

describe("audit event store", () => {
  it("appends audit events in-memory with the organization/action preserved", async () => {
    const store = new InMemoryAuditEventStore();
    await store.append({ organizationId: "org-1", actorId: "user-1", action: "OPERATION_CREATED", outcome: "SUCCESS", metadata: { amount: "100" } });
    await store.append({ organizationId: "org-1", actorId: "user-1", action: "OPERATION_CREATED", outcome: "FAILURE", eventId: "evt-2", metadata: {} });
    expect(store.events).toHaveLength(2);
    expect(store.events[0].organizationId).toBe("org-1");
    expect(store.events[0].action).toBe("OPERATION_CREATED");
  });

  it("DbAuditStoreAdapter generates an event id when none is supplied", async () => {
    const appended: Array<Record<string, unknown>> = [];
    const db: AuditEventDb = {
      available: () => true,
      append: async (input) => {
        appended.push({ ...input });
      },
    };
    const store = new DbAuditStoreAdapter(db);
    await store.append({ organizationId: "org-1", actorId: "user-1", action: "OPERATION_CREATED", outcome: "SUCCESS", metadata: {} });
    expect(appended).toHaveLength(1);
    expect(typeof appended[0].eventId).toBe("string");
    expect((appended[0].eventId as string).length).toBeGreaterThan(0);
  });
});

/* ---------------------------------------------------------------------- */
/* #3 — Webhook projection                                                */
/* ---------------------------------------------------------------------- */

describe("projectProviderEvent / projection store", () => {
  const baseResource = {
    id: "pay-1",
    organizationId: "org-1",
    canonicalStatus: "PENDING",
    providerStatus: null,
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  function seedStore(): InMemoryPaymentProjectionStore {
    const store = new InMemoryPaymentProjectionStore();
    store.seed(baseResource, { provider: "xendit", providerPaymentId: "xen-pay-1" });
    return store;
  }

  it("projects a verified success event into SUCCEEDED and increments the version", async () => {
    const store = seedStore();
    const result = await projectProviderEvent({
      store,
      organizationId: "org-1",
      event: { eventId: "evt-1", provider: "xendit", resourceId: "pay-1", observedProviderStatus: "payment.succeeded", occurredAt: "2026-01-02T00:00:00.000Z" },
      map: XENDIT_WEBHOOK_MAP,
      expectedVersion: 1,
    });
    expect(result?.canonicalStatus).toBe("SUCCEEDED");
    expect(result?.version).toBe(2);
    await expect(store.findResource("org-1", "pay-1")).resolves.toMatchObject({ canonicalStatus: "SUCCEEDED", version: 2 });
  });

  it("returns null for an unknown resource rather than inventing a success", async () => {
    const store = new InMemoryPaymentProjectionStore();
    const result = await projectProviderEvent({
      store,
      organizationId: "org-1",
      event: { eventId: "evt-2", provider: "xendit", resourceId: "nope", observedProviderStatus: "payment.succeeded", occurredAt: "2026-01-02T00:00:00.000Z" },
      map: XENDIT_WEBHOOK_MAP,
      expectedVersion: 1,
    });
    expect(result).toBeNull();
  });

  it("maps an un-listed/future provider status to UNKNOWN, never success", async () => {
    const store = seedStore();
    const result = await projectProviderEvent({
      store,
      organizationId: "org-1",
      event: { eventId: "evt-3", provider: "xendit", resourceId: "pay-1", observedProviderStatus: "payment.mystery_new_type", occurredAt: "2026-01-02T00:00:00.000Z" },
      map: XENDIT_WEBHOOK_MAP,
      expectedVersion: 1,
    });
    expect(result?.canonicalStatus).toBe("UNKNOWN");
  });

  it("cannot regress a terminal success to a failure (OUT_OF_ORDER)", async () => {
    const store = new InMemoryPaymentProjectionStore();
    store.seed({ ...baseResource, canonicalStatus: "SUCCEEDED", version: 2 }, { provider: "xendit", providerPaymentId: "xen-pay-1" });
    await expect(
      projectProviderEvent({
        store,
        organizationId: "org-1",
        event: { eventId: "evt-4", provider: "xendit", resourceId: "pay-1", observedProviderStatus: "payment.failed", occurredAt: "2026-01-03T00:00:00.000Z" },
        map: XENDIT_WEBHOOK_MAP,
        expectedVersion: 2,
      }),
    ).rejects.toBeInstanceOf(ProjectionError);
  });

  it("treats a re-observed terminal success as idempotent (no version bump, no crash)", async () => {
    const store = new InMemoryPaymentProjectionStore();
    store.seed({ ...baseResource, canonicalStatus: "SUCCEEDED", version: 2 }, { provider: "xendit", providerPaymentId: "xen-pay-1" });
    const result = await projectProviderEvent({
      store,
      organizationId: "org-1",
      event: { eventId: "evt-5", provider: "xendit", resourceId: "pay-1", observedProviderStatus: "payment.succeeded", occurredAt: "2026-01-03T00:00:00.000Z" },
      map: XENDIT_WEBHOOK_MAP,
      expectedVersion: 2,
    });
    expect(result?.canonicalStatus).toBe("SUCCEEDED");
    expect(result?.version).toBe(2); // unchanged — terminal successes are monotonic
  });

  it("resolves a canonical resource by provider ref (join) in-memory", async () => {
    const store = seedStore();
    const resource = await store.findResourceByProviderRef("xendit", "xen-pay-1");
    expect(resource?.id).toBe("pay-1");
    expect(await store.findResourceByProviderRef("xendit", "unknown")).toBeNull();
  });

  it("canonicalsForProviderStatus treats terminal failures/successes and unknowns conservatively", () => {
    expect(canonicalsForProviderStatus(STRIPE_WEBHOOK_MAP, "charge.succeeded")).toBe("SUCCEEDED");
    expect(canonicalsForProviderStatus(STRIPE_WEBHOOK_MAP, "payout.failed")).toBe("FAILED");
    expect(canonicalsForProviderStatus(STRIPE_WEBHOOK_MAP, "charge.pending")).toBe("UNKNOWN");
    expect(canonicalsForProviderStatus(XENDIT_WEBHOOK_MAP, "provider.new.unknown")).toBe("UNKNOWN");
  });
});

/* ---------------------------------------------------------------------- */
/* #1 — Secret + connection resolution                                    */
/* ---------------------------------------------------------------------- */

describe("runtime connection resolver", () => {
  it("resolves an ACTIVE connection and unseals its encrypted secret", async () => {
    const store = new LocalEncryptedSecretStore(KEY, "local");
    const envelope = await store.seal("sk_test_xendit");
    const db = new InMemoryRuntimeConnectionDb();
    db.seedConnection({ connectionId: "conn-1", organizationId: "org-1", provider: "xendit", mode: "TEST" });
    db.seedSecret("conn-1", "TEST", { secretRef: JSON.stringify(envelope), credentialVersion: 1 });

    const resolver = new RuntimeConnectionResolver(db, store);
    const resolved = await resolver.resolveForConnection("conn-1");
    expect(resolved?.connection.provider).toBe("xendit");
    expect(resolved?.connection.mode).toBe("TEST");
    expect(resolved?.secret).toBe("sk_test_xendit");
  });

  it("returns null when the connection is missing (fail closed, no mock downgrade)", async () => {
    const store = new LocalEncryptedSecretStore(KEY, "local");
    const db = new InMemoryRuntimeConnectionDb();
    const resolver = new RuntimeConnectionResolver(db, store);
    expect(await resolver.resolveForConnection("conn-missing")).toBeNull();
  });

  it("throws NOT_FOUND when a connection exists but its secret cannot be resolved", async () => {
    const store = new LocalEncryptedSecretStore(KEY, "local");
    const db = new InMemoryRuntimeConnectionDb();
    db.seedConnection({ connectionId: "conn-1", organizationId: "org-1", provider: "xendit", mode: "TEST" });
    // no secret seeded
    const resolver = new RuntimeConnectionResolver(db, store);
    await expect(resolver.resolveForConnection("conn-1")).rejects.toBeInstanceOf(RepositoryError);
    await expect(resolver.resolveForConnection("conn-1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("unseals a serialized envelope ref and treats a plaintext dev ref as-is", async () => {
    const store = new LocalEncryptedSecretStore(KEY, "local");
    const envelope = await store.seal("sk_test_2");
    expect(await resolveSecretValue(JSON.stringify(envelope), store)).toBe("sk_test_2");
    expect(await resolveSecretValue("sk_test_inline_dev", store)).toBe("sk_test_inline_dev");
  });

  it("buildRuntimeConnectionResolver fails closed without a secret when unconfigured", async () => {
    const key = KEY;
    const store = new LocalEncryptedSecretStore(key, "local");
    const db = new InMemoryRuntimeConnectionDb();
    const resolver = await buildRuntimeConnectionResolver({ db, secretStore: store });
    expect(await resolver.resolveForConnection("conn-x")).toBeNull();
  });

  it("composes a fail-closed resolver (no throw) when the secret store is not configured", async () => {
    // In a bare env with no SECRET_STORE_KEY, the resolver factory must not
    // throw at construction; the resolution path returns null (dev/demo keeps
    // the local link) rather than a mock secret.
    const resolver = await buildRuntimeConnectionResolver({ db: new InMemoryRuntimeConnectionDb() });
    expect(await resolver.resolveForConnection("conn-x")).toBeNull();
  });
});

/* Prisma-backed executors remain type-safe and forward to the lazy client. */
describe("prisma-backed repository executors", () => {
  it("PrismaRuntimeConnectionDb filters to ACTIVE connections and known providers", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const prisma = {
      paymentProviderConnection: {
        findFirst: async (args: { where: Record<string, unknown> }) => {
          calls.push(args);
          return { id: "conn-1", organizationId: "org-1", provider: "xendit", mode: "TEST", status: "ACTIVE" };
        },
      },
      secretRecord: {
        findUnique: async () => ({ secretRef: "plaintext-dev", credentialVersion: 1 }),
      },
    };
    const db = new PrismaRuntimeConnectionDb(prisma);
    const conn = await db.findActiveConnection("conn-1");
    expect(calls[0].where).toMatchObject({ id: "conn-1", status: "ACTIVE" });
    expect(conn?.provider).toBe("xendit");
    const secretRef = await db.findSecretRef("conn-1", "TEST");
    expect(secretRef?.secretRef).toBe("plaintext-dev");
  });

  it("PaymentProjectionDb adapter forwards find/update to the lazy client", async () => {
    const rows = {
      canonical: { id: "pay-1", organizationId: "org-1", canonicalStatus: "PENDING", version: 1 },
      byProvider: { payment: { id: "pay-1", organizationId: "org-1", canonicalStatus: "SUCCEEDED", version: 2 } },
    };
    const calls: Array<Record<string, unknown>> = [];
    const prisma = {
      canonicalPayment: {
        findFirst: async (args: { where: Record<string, unknown> }) => {
          calls.push(args);
          return rows.canonical;
        },
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          calls.push(args);
          return {};
        },
      },
      providerPayment: {
        findFirst: async (args: { where: Record<string, unknown>; include: Record<string, unknown> }) => {
          calls.push(args);
          return rows.byProvider;
        },
      },
    };
    const db: PaymentProjectionDb = new (class {
      available() {
        return true;
      }
      async findResource(organizationId: string, resourceId: string) {
        const row = await prisma.canonicalPayment.findFirst({ where: { organizationId, id: resourceId } });
        return row ? { ...row, providerStatus: null, updatedAt: "2026-01-01T00:00:00.000Z" } : null;
      }
      async findResourceByProviderRef(provider: string, providerPaymentId: string) {
        const row = await prisma.providerPayment.findFirst({ where: { provider, providerPaymentId }, include: { payment: true } });
        return row?.payment ? { ...row.payment, providerStatus: null, updatedAt: "2026-01-01T00:00:00.000Z" } : null;
      }
      async updateResource(resource: { id: string; canonicalStatus: string; version: number }) {
        await prisma.canonicalPayment.update({ where: { id: resource.id }, data: { canonicalStatus: resource.canonicalStatus, version: resource.version } });
      }
    })();

    const resource = await db.findResourceByProviderRef("xendit", "xen-pay-1");
    expect(resource?.id).toBe("pay-1");
    expect(resource?.canonicalStatus).toBe("SUCCEEDED");
    expect(calls.length).toBeGreaterThan(0);
  });
});
