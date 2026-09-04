import "server-only";

import { PaymentFlowService, type ProviderFlowResult, type FlowActor, type OperationStore, type AuditStore } from "./payment-flow";
import { buildProviderRuntimeRegistry } from "./money-in-runtime";
import { buildRuntimeConnectionResolver, type RuntimeConnectionResolver } from "@/server/repositories/runtime-connection-resolver";
import { buildOperationStore } from "@/server/repositories/durable-operation-store";
import { buildAuditStore } from "@/server/repositories/audit-event-store";
import type { ProviderRegistry } from "@/server/providers/registry";
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";

/** Injectable deps so the write helpers can be unit-tested with a stub registry. */
export type ProviderWriteDeps = {
  resolver?: RuntimeConnectionResolver;
  registry?: ProviderRegistry;
  operations?: OperationStore;
  audit?: AuditStore;
};

/**
 * Provider write helper (rekomendasi #5). Routes refund / payout through the
 * payment-flow orchestration (idempotency + durable operation + authz/step-up +
 * audit) when a persisted ACTIVE connection + unsealed secret resolves for an
 * org. Returns `{ connected: false }` when no connection resolves so the caller
 * can fall back to the in-memory dev/demo store. When a connection resolves, the
 * provider result is authoritative and any provider failure propagates (never
 * mocked).
 */

export type ProviderWriteResolution =
  | { connected: false }
  | { connected: true; organizationId: string; connectionId: string; provider: "xendit" | "stripe"; mode: "TEST" | "LIVE" };

export async function resolveProviderWrite(organizationId?: string, deps: ProviderWriteDeps = {}): Promise<ProviderWriteResolution> {
  const resolver = deps.resolver ?? (await buildRuntimeConnectionResolver());
  const resolved = await resolver.resolveFirstActive(organizationId ?? DEFAULT_DEMO_ORG);
  if (!resolved) {
    return { connected: false };
  }
  return {
    connected: true,
    organizationId: resolved.connection.organizationId,
    connectionId: resolved.connection.connectionId,
    provider: resolved.connection.provider,
    mode: resolved.connection.mode,
  };
}

async function buildService(res: Extract<ProviderWriteResolution, { connected: true }>, deps: ProviderWriteDeps = {}): Promise<PaymentFlowService> {
  const resolver = deps.resolver ?? (await buildRuntimeConnectionResolver());
  const registry = deps.registry ?? buildProviderRuntimeRegistry(resolver);
  const operations = deps.operations ?? (await buildOperationStore());
  const audit = deps.audit ?? (await buildAuditStore());
  return new PaymentFlowService({
    organizationId: res.organizationId,
    connectionId: res.connectionId,
    provider: res.provider,
    mode: res.mode,
    registry,
    operations,
    audit,
  });
}

export async function tryProviderRefund(
  input: {
    organizationId?: string;
    actor?: FlowActor;
    originalPaymentId: string;
    amountMinor: string;
    currency: string;
    originalPaymentAmountMinor: string;
    approverId?: string | null;
  },
  deps: ProviderWriteDeps = {},
): Promise<{ connected: false } | { connected: true; result: ProviderFlowResult }> {
  const res = await resolveProviderWrite(input.organizationId, deps);
  if (!res.connected) {
    return { connected: false };
  }
  const service = await buildService(res, deps);
  const actor: FlowActor = input.actor ?? { id: "system", roles: ["OWNER"] };
  const result = await service.executeRefund({
    actor,
    originalPaymentId: input.originalPaymentId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    originalPaymentAmountMinor: input.originalPaymentAmountMinor,
    approverId: input.approverId ?? null,
  });
  return { connected: true, result };
}

export async function tryProviderPayout(
  input: {
    organizationId?: string;
    actor?: FlowActor;
    recipientId: string;
    channelCode: string;
    accountNumber: string;
    accountHolderName?: string;
    amountMinor: string;
    currency: string;
    approverId?: string | null;
  },
  deps: ProviderWriteDeps = {},
): Promise<{ connected: false } | { connected: true; result: ProviderFlowResult }> {
  const res = await resolveProviderWrite(input.organizationId, deps);
  if (!res.connected) {
    return { connected: false };
  }
  const service = await buildService(res, deps);
  const actor: FlowActor = input.actor ?? { id: "system", roles: ["OWNER"] };
  const result = await service.releaseRecipient({
    actor,
    recipientId: input.recipientId,
    channelCode: input.channelCode,
    accountNumber: input.accountNumber,
    accountHolderName: input.accountHolderName,
    amountMinor: input.amountMinor,
    currency: input.currency,
    approverId: input.approverId ?? null,
  });
  return { connected: true, result };
}
