import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

/**
 * Audit ledger (audit-ledger). Immutable security/financial audit events with a
 * strict action vocabulary and a redaction policy. Secrets, OTPs, PAN/CVV, full
 * account identifiers, raw provider payloads, and KYC document bytes are never
 * written to an audit event.
 */

export const AuditOutcomeSchema = z.enum(["SUCCESS", "FAILURE", "UNKNOWN", "SKIPPED"]);
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

export const AuditActionSchema = z.enum([
  "PROVIDER_CONNECT_ATTEMPT",
  "PROVIDER_CONNECT_VERIFIED",
  "PROVIDER_CONNECT_DISCONNECT",
  "PROVIDER_ROTATE",
  "SECRET_STORED",
  "SECRET_ROTATED",
  "MFA_CHALLENGE_ISSUED",
  "MFA_PROOF_VERIFIED",
  "OPERATION_CREATED",
  "OPERATION_APPROVED",
  "OPERATION_EXECUTING",
  "OPERATION_SUCCEEDED",
  "OPERATION_FAILED",
  "OPERATION_UNKNOWN",
  "PAYOUT_RELEASE",
  "REFUND_EXECUTE",
  "TRANSFER_EXECUTE",
  "SPLIT_ACTIVATE",
  "WEBHOOK_RECEIVED",
  "WEBHOOK_REPLAYED",
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

const AuditMetadataSchema = z
  .object({
    organizationId: z.string().min(1),
    actorId: z.string().min(1),
    provider: z.string().optional(),
    connectionId: z.string().optional(),
    canonicalResourceId: z.string().optional(),
    operationId: z.string().optional(),
    correlationId: z.string().optional(),
    mode: z.enum(["TEST", "LIVE"]).optional(),
    stateBefore: z.string().optional(),
    stateAfter: z.string().optional(),
    amountMinor: z.string().optional(),
    currency: z.string().optional(),
  })
  .strict();

export type AuditMetadata = z.infer<typeof AuditMetadataSchema>;

const AuditEventSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  actorId: z.string().min(1),
  action: AuditActionSchema,
  outcome: AuditOutcomeSchema,
  metadata: AuditMetadataSchema,
  timestamp: z.string().datetime(),
  version: z.number().int().positive(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/** Keys that must never appear in audit metadata. */
const FORBIDDEN_METADATA_KEYS = [
  "secret",
  "authorization",
  "xendit_secret_key",
  "stripe_secret_key",
  "webhook_secret",
  "otp",
  "token",
  "cvv",
  "pan",
  "card_number",
];

export function auditMetadataIsSafe(metadata: Record<string, unknown>): boolean {
  for (const key of Object.keys(metadata)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_METADATA_KEYS.some((k) => lower.includes(k))) {
      return false;
    }
  }
  return true;
}

/**
 * Build an idempotent audit event id from a logical operation so deterministic
 * producers can be deduped. Free-form metadata is not part of the id.
 */
export function auditEventId(logicalKey: string): string {
  return createHash("sha256").update(logicalKey).digest("hex").slice(0, 32);
}

export function makeAuditEvent(input: {
  organizationId: string;
  actorId: string;
  action: AuditAction;
  outcome: AuditOutcome;
  metadata: AuditMetadata;
  eventId?: string;
  timestamp?: string;
  version?: number;
}): AuditEvent {
  if (!auditMetadataIsSafe(input.metadata as unknown as Record<string, unknown>)) {
    throw new Error("Refusing to create an audit event with a forbidden metadata key");
  }
  const event: AuditEvent = {
    id: input.eventId ?? auditEventId(`${input.organizationId}:${input.actorId}:${input.action}:${new Date().toISOString()}:${randomUUID()}`),
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: input.action,
    outcome: input.outcome,
    metadata: input.metadata,
    timestamp: input.timestamp ?? new Date().toISOString(),
    version: input.version ?? 1,
  };
  return AuditEventSchema.parse(event);
}
