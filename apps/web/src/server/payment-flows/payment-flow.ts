import "server-only";

import { hasPermission, type OrganizationRole, type Permission } from "@/domain/organization/roles";
import { requiresDualControl, isApproverDistinct, type DualControlKind } from "@/domain/security/step-up";
import { isTerminalOperation, transitionOperation, type OperationStatus } from "@/domain/payments/operations";
import type { AuditAction, AuditOutcome } from "@/domain/audit/audit";
import type { ProviderRegistry, ProviderConnectionContext, ProviderKey } from "@/server/providers/registry";
import { operationIdempotencyKey, operationRequestHash, assertOperationHashMatches } from "@/server/repositories/operation-identities";

/**
 * TEST-mode payment-flow orchestration (money-in / refunds / payouts).
 *
 * A flow is a defensible sequence that cannot execute a provider write without:
 *  1. a provider that supports the capability (registry capability gate);
 *  2. actor authorization (organization role permission);
 *  3. step-up/dual-control policy where money movement applies;
 *  4. a persisted-intent durable operation with a stable idempotency key;
 *  5. an audit event.
 *
 * Persistence is injected (an OperationStore + AuditStore); the production wiring
 * binds these to the DurableOperation/AuditEvent tables. This module is domain +
 * orchestration; no provider SDK, Prisma model, page, or action leaks in.
 */

export interface OperationStore {
  create(input: {
    organizationId: string;
    connectionId: string;
    actorId: string;
    operationType: string;
    resourceType: string;
    resourceId?: string;
    idempotencyKey: string;
    requestHash: string;
    amountMinor?: string;
    currency?: string;
  }): Promise<{ id: string; state: OperationStatus; idempotencyKey: string; requestHash: string }>;
  findByIdempotencyKey(idempotencyKey: string): Promise<{ id: string; state: OperationStatus; requestHash: string } | null>;
  updateState(id: string, from: OperationStatus, to: OperationStatus): Promise<void>;
}

export interface AuditStore {
  append(input: {
    organizationId: string;
    actorId: string;
    action: AuditAction;
    outcome: AuditOutcome;
    eventId?: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export interface FlowActor {
  id: string;
  roles: OrganizationRole[];
}

export interface FlowContext {
  organizationId: string;
  connectionId: string;
  provider: ProviderKey;
  mode: "TEST" | "LIVE";
  registry: ProviderRegistry;
  operations: OperationStore;
  audit: AuditStore;
  now?(): Date;
}

export interface ProviderFlowResult {
  operationId: string;
  provider: ProviderKey;
  providerResourceId: string | null;
  status: string;
  mode: "TEST" | "LIVE";
  /** Hosted-payment checkout URL (money-in only). */
  checkoutUrl?: string | null;
}

export class PaymentFlowError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "REQUIRES_APPROVAL" | "APPROVAL_MISMATCH" | "DUPLICATE" | "UNSUPPORTED" | "SUPERSEDED",
    message: string,
  ) {
    super(message);
    this.name = "PaymentFlowError";
  }
}

function authorize(actor: FlowActor, permission: Permission): void {
  if (!actor.roles.some((r) => hasPermission(r, permission))) {
    throw new PaymentFlowError("FORBIDDEN", "Actor is not authorized for this operation");
  }
}

/**
 * A provider outcome is ambiguous when the upstream result cannot be trusted as
 * "the write did not happen": a transport timeout, an upstream 5xx, or a
 * provider idempotency conflict. A definitive rejection (4xx, rate limit, auth)
 * is NOT ambiguous and lands in `FAILED`.
 */
function isAmbiguousOutcome(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  return code === "TIMEOUT" || code === "UNAVAILABLE" || code === "IDEMPOTENCY_CONFLICT";
}

function assertDualControl(args: {
  kind: DualControlKind;
  mode: "TEST" | "LIVE";
  amountMinor?: string;
  originalPaymentAmountMinor?: string;
  requesterId: string;
  approverId: string | null;
}): { required: boolean } {
  const required = requiresDualControl(args.kind, {
    mode: args.mode,
    amountMinor: args.amountMinor,
    originalPaymentAmountMinor: args.originalPaymentAmountMinor,
  });
  if (required && !args.approverId) {
    throw new PaymentFlowError("REQUIRES_APPROVAL", "This operation requires a separate approval");
  }
  if (required && args.approverId) {
    if (!isApproverDistinct(args.requesterId, args.approverId)) {
      throw new PaymentFlowError("APPROVAL_MISMATCH", "Requester cannot be the approver");
    }
  }
  return { required };
}

export class PaymentFlowService {
  constructor(private readonly ctx: FlowContext) {}

  private providerConnection(): ProviderConnectionContext {
    return {
      organizationId: this.ctx.organizationId,
      connectionId: this.ctx.connectionId,
      provider: this.ctx.provider,
      mode: this.ctx.mode,
    };
  }

  private async persistOperation(
    actorId: string,
    operationType: string,
    resourceType: string,
    resourceId: string | undefined,
    payload: unknown,
    amountMinor?: string,
    currency?: string,
  ): Promise<{ id: string; idempotencyKey: string; requestHash: string; state: OperationStatus }> {
    const idempotencyKey = operationIdempotencyKey({
      organizationId: this.ctx.organizationId,
      operationType,
      resourceType,
      resourceId,
    });
    const requestHash = operationRequestHash(payload);
    const existing = await this.ctx.operations.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      assertOperationHashMatches(existing.requestHash, requestHash);
      if (isTerminalOperation(existing.state)) {
        throw new PaymentFlowError("DUPLICATE", "A terminal operation with this idempotency key already exists");
      }
      return { id: existing.id, idempotencyKey, requestHash, state: existing.state };
    }
    return this.ctx.operations.create({
      organizationId: this.ctx.organizationId,
      connectionId: this.ctx.connectionId,
      actorId,
      operationType,
      resourceType,
      resourceId,
      idempotencyKey,
      requestHash,
      amountMinor,
      currency,
    });
  }

  private async audit(actorId: string, action: AuditAction, outcome: AuditOutcome, eventId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.ctx.audit.append({
      organizationId: this.ctx.organizationId,
      actorId,
      action,
      outcome,
      eventId,
      metadata,
    });
  }

  private async transitionTo(operation: { id: string; state: OperationStatus }, to: OperationStatus): Promise<void> {
    if (operation.state === to) {
      // Resume of an in-flight operation (EXECUTING/UNKNOWN): no redundant write,
      // no invalid same-state transition.
      return;
    }
    const next = transitionOperation(operation.state, to);
    await this.ctx.operations.updateState(operation.id, operation.state, next);
    operation.state = next;
  }

  private async failOperation(
    operation: { id: string; state: OperationStatus },
    actorId: string,
    resourceType: string,
    err: unknown,
  ): Promise<never> {
    const ambiguous = isAmbiguousOutcome(err);
    await this.transitionTo(operation, ambiguous ? "UNKNOWN" : "FAILED");
    await this.audit(actorId, ambiguous ? "OPERATION_UNKNOWN" : "OPERATION_FAILED", ambiguous ? "UNKNOWN" : "FAILURE", operation.id, {
      resourceType,
      provider: this.ctx.provider,
      mode: this.ctx.mode,
    });
    throw err;
  }

  /* ----------------------------- money-in (hosted payment) ----------------------------- */

  async createHostedPayment(args: {
    actor: FlowActor;
    externalId: string;
    amountMinor: string;
    currency: string;
    description?: string;
    payerEmail?: string | null;
  }): Promise<ProviderFlowResult> {
    authorize(args.actor, "money_in.create");
    const payload = { externalId: args.externalId, amountMinor: args.amountMinor, currency: args.currency, description: args.description, payerEmail: args.payerEmail };
    const operation = await this.persistOperation(args.actor.id, "money_in.hosted_payment", "payment", args.externalId, payload, args.amountMinor, args.currency);
    await this.transitionTo(operation, "EXECUTING");
    try {
      const result = await this.ctx.registry.invokeCapability(this.ctx.provider, "hostedPaymentLinks", this.providerConnection(), {
        externalId: args.externalId,
        amount: Number(args.amountMinor),
        currency: args.currency,
        description: args.description,
        payerEmail: args.payerEmail,
      }) as { id: string; checkoutUrl: string; status: string; provider: string };
      await this.transitionTo(operation, "SUCCEEDED");
      await this.audit(args.actor.id, "OPERATION_SUCCEEDED", "SUCCESS", operation.id, { resourceType: "payment", provider: this.ctx.provider, mode: this.ctx.mode });
      return {
        operationId: operation.id,
        provider: this.ctx.provider,
        providerResourceId: result.id,
        status: result.status,
        mode: this.ctx.mode,
        checkoutUrl: result.checkoutUrl ?? null,
      };
    } catch (err) {
      await this.failOperation(operation, args.actor.id, "payment", err);
      throw err;
    }
  }

  /* ----------------------------- refunds ----------------------------- */

  async executeRefund(args: {
    actor: FlowActor;
    originalPaymentId: string;
    amountMinor: string;
    currency: string;
    originalPaymentAmountMinor: string;
    approverId?: string | null;
  }): Promise<ProviderFlowResult> {
    authorize(args.actor, "refund.execute");
    assertDualControl({
      kind: "refund.amount",
      mode: this.ctx.mode,
      amountMinor: args.amountMinor,
      originalPaymentAmountMinor: args.originalPaymentAmountMinor,
      requesterId: args.actor.id,
      approverId: args.approverId ?? null,
    });
    const payload = { originalPaymentId: args.originalPaymentId, amountMinor: args.amountMinor, currency: args.currency };
    const operation = await this.persistOperation(args.actor.id, "refund.execute", "refund", args.originalPaymentId, payload, args.amountMinor, args.currency);
    await this.transitionTo(operation, "EXECUTING");
    try {
      const result = await this.ctx.registry.invokeCapability(this.ctx.provider, "refunds", this.providerConnection(), {
        idempotencyKey: operation.idempotencyKey,
        paymentId: args.originalPaymentId,
        amount: Number(args.amountMinor),
        currency: args.currency,
      }) as { id: string; status: string; provider: string };
      await this.transitionTo(operation, "SUCCEEDED");
      await this.audit(args.actor.id, "OPERATION_SUCCEEDED", "SUCCESS", operation.id, { resourceType: "refund", provider: this.ctx.provider, mode: this.ctx.mode });
      return { operationId: operation.id, provider: this.ctx.provider, providerResourceId: result.id, status: result.status, mode: this.ctx.mode };
    } catch (err) {
      await this.failOperation(operation, args.actor.id, "refund", err);
      throw err;
    }
  }

  /* ----------------------------- payouts ----------------------------- */

  async releaseRecipient(args: {
    actor: FlowActor;
    recipientId: string;
    channelCode: string;
    accountNumber: string;
    accountHolderName?: string;
    amountMinor: string;
    currency: string;
    approverId?: string | null;
  }): Promise<ProviderFlowResult> {
    authorize(args.actor, "payout.release");
    assertDualControl({
      kind: "payout.recipient",
      mode: this.ctx.mode,
      amountMinor: args.amountMinor,
      requesterId: args.actor.id,
      approverId: args.approverId ?? null,
    });
    const payload = { recipientId: args.recipientId, channelCode: args.channelCode, amountMinor: args.amountMinor, currency: args.currency };
    const operation = await this.persistOperation(args.actor.id, "payout.release", "recipient", args.recipientId, payload, args.amountMinor, args.currency);
    await this.transitionTo(operation, "EXECUTING");
    try {
      const result = await this.ctx.registry.invokeCapability(this.ctx.provider, "payouts", this.providerConnection(), {
        idempotencyKey: operation.idempotencyKey,
        referenceId: args.recipientId,
        channelCode: args.channelCode,
        accountNumber: args.accountNumber,
        accountHolderName: args.accountHolderName,
        amount: Number(args.amountMinor),
        currency: args.currency,
      }) as { id: string; status: string; provider: string };
      await this.transitionTo(operation, "SUCCEEDED");
      await this.audit(args.actor.id, "OPERATION_SUCCEEDED", "SUCCESS", operation.id, { resourceType: "recipient", provider: this.ctx.provider, mode: this.ctx.mode });
      return { operationId: operation.id, provider: this.ctx.provider, providerResourceId: result.id, status: result.status, mode: this.ctx.mode };
    } catch (err) {
      await this.failOperation(operation, args.actor.id, "recipient", err);
      throw err;
    }
  }
}
