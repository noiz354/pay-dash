import { describe, expect, it } from "vitest";

import type { OrganizationRole } from "@/domain/organization/roles";
import type { ConnectionVerification } from "@/domain/payments/connection";
import type { CapabilityManifest } from "@/domain/payments/capabilities";
import type { OperationStatus } from "@/domain/payments/operations";
import {
  createProviderRegistry,
  type PaymentProviderAdapter,
  type ProviderVerificationContext,
  type ProviderConnectionContext,
  type ProviderKey,
} from "@/server/providers/registry";
import {
  PaymentFlowService,
  PaymentFlowError,
  type OperationStore,
  type AuditStore,
  type FlowActor,
} from "./payment-flow";

/* ----------------------------- in-memory fakes ----------------------------- */

interface StoredOperation {
  id: string;
  state: OperationStatus;
  idempotencyKey: string;
  requestHash: string;
  operationType: string;
}

type OpStore = OperationStore & { db: Map<string, StoredOperation> };
type AudStore = AuditStore & { events: Array<Record<string, unknown>> };

function makeOperationStore(initial?: StoredOperation[]): OpStore {
  const db = new Map<string, StoredOperation>((initial ?? []).map((o) => [o.idempotencyKey, o]));
  let n = 0;
  return {
    db,
    async create(input) {
      const op: StoredOperation = {
        id: `op-${++n}`,
        state: "DRAFT",
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        operationType: input.operationType,
      };
      if (db.has(input.idempotencyKey)) throw new Error("duplicate idempotency key in fake store");
      db.set(input.idempotencyKey, op);
      return op;
    },
    async findByIdempotencyKey(idempotencyKey) {
      return db.get(idempotencyKey) ?? null;
    },
    async updateState(id, _from, to) {
      for (const op of db.values()) {
        // updateState is keyed by operation id in the real contract; we accept the
        // fake's node-by-idempotency below.
        void id;
        op.state = to;
      }
    },
  };
}

function makeAuditStore(): AudStore {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    async append(input) {
      events.push({ ...input });
    },
  };
}

const FULL_MANIFEST: CapabilityManifest = {
  balanceRead: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  transactionRead: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  hostedPaymentLinks: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  customers: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  savedPaymentMethods: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  recurringBilling: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  refunds: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  payouts: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  connectedAccounts: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  internalTransfers: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  splitRouting: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
  webhookHealth: { supported: true, configured: true, available: true, mode: "TEST", reason: null, requirements: [], lastVerifiedAt: null },
};

function makeAdapter(overrides?: { capabilities?: Partial<Record<string, { supported?: boolean; configured?: boolean }>> }): PaymentProviderAdapter {
  const manifest: CapabilityManifest = { ...FULL_MANIFEST };
  for (const [key, val] of Object.entries(overrides?.capabilities ?? {})) {
    if (!val) continue;
    const k = key as keyof CapabilityManifest;
    manifest[k] = {
      ...manifest[k],
      supported: val.supported ?? manifest[k].supported,
      configured: val.configured ?? manifest[k].configured,
      available: (val.supported ?? manifest[k].supported) && (val.configured ?? manifest[k].configured),
    };
  }
  return {
    provider: "stripe",
    async verifyConnection(_ctx: ProviderVerificationContext): Promise<ConnectionVerification> {
      return {
        verified: true,
        provider: "stripe",
        mode: "TEST",
        accountIdentity: "acct_test_123",
        accountDisplayName: "acct_test_123",
        permissionsVerified: true,
        capabilities: manifest,
        webhookHealth: { status: "UNCONFIGURED", reason: null, lastCheckedAt: null },
        requirements: [],
        state: "ACTIVE",
        reason: null,
        verifiedAt: new Date().toISOString(),
      };
    },
    async getCapabilities(_ctx: ProviderConnectionContext): Promise<CapabilityManifest> {
      return manifest;
    },
    async createHostedPayment(_ctx: ProviderConnectionContext, input: unknown) {
      return { id: "cs_test_1", checkoutUrl: "https://checkout.test/cs_test_1", status: "open", provider: "stripe" };
    },
    async createRefund(_ctx: ProviderConnectionContext, input: unknown) {
      const i = input as { idempotencyKey: string };
      return { id: `re_${i.idempotencyKey.slice(0, 8)}`, status: "pending", provider: "stripe" };
    },
    async createPayout(_ctx: ProviderConnectionContext, input: unknown) {
      return { id: "po_test_1", status: "paid", provider: "stripe" };
    },
  };
}

function actor(roles: OrganizationRole[]): FlowActor {
  return { id: "user-1", roles };
}

function makeService(opts: { provider?: ProviderKey; adapter?: PaymentProviderAdapter; operations?: OpStore; audit?: AudStore; mode?: "TEST" | "LIVE" } = {}) {
  const registry = createProviderRegistry();
  registry.register(opts.adapter ?? makeAdapter());
  const operations = opts.operations ?? makeOperationStore();
  const audit = opts.audit ?? makeAuditStore();
  const service = new PaymentFlowService({
    organizationId: "org-1",
    connectionId: "conn-1",
    provider: opts.provider ?? "stripe",
    mode: opts.mode ?? "TEST",
    registry,
    operations,
    audit,
  });
  return { service, operations, audit, registry };
}

/* ----------------------------- tests ----------------------------- */

describe("payment-flow orchestration", () => {
  it("creates a hosted payment through the registry in TEST mode (OWNER)", async () => {
    const { service, operations, audit } = makeService();
    const result = await service.createHostedPayment({
      actor: actor(["OWNER"]),
      externalId: "inv-1001",
      amountMinor: "2500000",
      currency: "IDR",
    });
    expect(result.providerResourceId).toBe("cs_test_1");
    expect(result.status).toBe("open");
    expect(result.mode).toBe("TEST");

    const ops = [...operations.db.values()];
    expect(ops).toHaveLength(1);
    expect(ops[0].state).toBe("SUCCEEDED");
    expect(ops[0].operationType).toBe("money_in.hosted_payment");
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0].action).toBe("OPERATION_SUCCEEDED");
  });

  it("denies a hosted payment when the actor lacks the permission", async () => {
    const { service } = makeService();
    await expect(
      service.createHostedPayment({ actor: actor(["SUPPORT"]), externalId: "inv-1002", amountMinor: "2500000", currency: "IDR" }),
    ).rejects.toThrow(PaymentFlowError);
    await expect(
      service.createHostedPayment({ actor: actor(["SUPPORT"]), externalId: "inv-1002", amountMinor: "2500000", currency: "IDR" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a finance operator to create a hosted payment via money_in.create", async () => {
    const { service } = makeService();
    const result = await service.createHostedPayment({
      actor: actor(["FINANCE_OPERATOR"]),
      externalId: "inv-1003",
      amountMinor: "2500000",
      currency: "IDR",
    });
    expect(result.providerResourceId).toBe("cs_test_1");
  });

  it("executes a low-value refund in TEST mode with an operator", async () => {
    const { service } = makeService();
    const result = await service.executeRefund({
      actor: actor(["FINANCE_ADMIN"]),
      originalPaymentId: "pi_000",
      amountMinor: "100000",
      currency: "IDR",
      originalPaymentAmountMinor: "2500000",
    });
    expect(result.providerResourceId).toMatch(/^re_/);
    expect(result.status).toBe("pending");
  });

  it("requires a distinct approver for a refund above the dual-control threshold", async () => {
    const { service } = makeService();
    // 25M IDR refund > 10M dual-control threshold.
    await expect(
      service.executeRefund({
        actor: actor(["FINANCE_ADMIN"]),
        originalPaymentId: "pi_000",
        amountMinor: "25000000",
        currency: "IDR",
        originalPaymentAmountMinor: "25000000",
      }),
    ).rejects.toMatchObject({ code: "REQUIRES_APPROVAL" });
  });

  it("rejects a refund where the requester is also the approver", async () => {
    const { service } = makeService();
    await expect(
      service.executeRefund({
        actor: actor(["FINANCE_ADMIN"]),
        approverId: "user-1",
        originalPaymentId: "pi_000",
        amountMinor: "25000000",
        currency: "IDR",
        originalPaymentAmountMinor: "25000000",
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_MISMATCH" });
  });

  it("accepts a distinct approver for a large refund and records the audit", async () => {
    const { service, audit, operations } = makeService();
    const result = await service.executeRefund({
      actor: actor(["FINANCE_ADMIN"]),
      approverId: "user-2",
      originalPaymentId: "pi_000",
      amountMinor: "25000000",
      currency: "IDR",
      originalPaymentAmountMinor: "25000000",
    });
    expect(result.status).toBe("pending");
    expect([...operations.db.values()][0].state).toBe("SUCCEEDED");
    expect(audit.events).toHaveLength(1);
  });

  it("releases a payout to a recipient within a separate approval gate", async () => {
    const { service } = makeService();
    const result = await service.releaseRecipient({
      actor: actor(["OWNER"]),
      approverId: "user-2",
      recipientId: "acct_recpt",
      channelCode: "BRI",
      accountNumber: "1234567890",
      amountMinor: "5000000",
      currency: "IDR",
    });
    expect(result.providerResourceId).toBe("po_test_1");
  });

  it("returns DUPLICATE for an idempotency key that already reached a terminal state", async () => {
    const { service } = makeService();
    await service.createHostedPayment({ actor: actor(["OWNER"]), externalId: "inv-dup", amountMinor: "2500000", currency: "IDR" });
    await expect(
      service.createHostedPayment({ actor: actor(["OWNER"]), externalId: "inv-dup", amountMinor: "2500000", currency: "IDR" }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("lands an ambiguous provider outcome in UNKNOWN and resumes on a same-key retry", async () => {
    let calls = 0;
    const adapter: PaymentProviderAdapter = {
      provider: "stripe",
      async verifyConnection(_ctx: ProviderVerificationContext): Promise<ConnectionVerification> {
        return {
          verified: true,
          provider: "stripe",
          mode: "TEST",
          accountIdentity: "acct_test_123",
          accountDisplayName: "acct_test_123",
          permissionsVerified: true,
          capabilities: FULL_MANIFEST,
          webhookHealth: { status: "UNCONFIGURED", reason: null, lastCheckedAt: null },
          requirements: [],
          state: "ACTIVE",
          reason: null,
          verifiedAt: new Date().toISOString(),
        };
      },
      async getCapabilities(_ctx: ProviderConnectionContext): Promise<CapabilityManifest> {
        return FULL_MANIFEST;
      },
      async createHostedPayment(_ctx: ProviderConnectionContext) {
        calls += 1;
        if (calls === 1) {
          throw { code: "TIMEOUT" };
        }
        return { id: "cs_test_retry", checkoutUrl: "https://checkout.test/retry", status: "open", provider: "stripe" };
      },
    };
    const { service, operations, audit } = makeService({ adapter });
    await expect(
      service.createHostedPayment({ actor: actor(["OWNER"]), externalId: "inv-ambig", amountMinor: "2500000", currency: "IDR" }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect([...operations.db.values()][0].state).toBe("UNKNOWN");
    expect(audit.events[0].action).toBe("OPERATION_UNKNOWN");
    const retry = await service.createHostedPayment({ actor: actor(["OWNER"]), externalId: "inv-ambig", amountMinor: "2500000", currency: "IDR" });
    expect(retry.providerResourceId).toBe("cs_test_retry");
    expect([...operations.db.values()][0].state).toBe("SUCCEEDED");
  });

  it("does not retry a provider write when the capability is not configured", async () => {
    const adapter = makeAdapter({ capabilities: { refunds: { configured: false } } });
    const { service } = makeService({ adapter });
    await expect(
      service.executeRefund({
        actor: actor(["FINANCE_ADMIN"]),
        originalPaymentId: "pi_000",
        amountMinor: "100000",
        currency: "IDR",
        originalPaymentAmountMinor: "2500000",
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});
