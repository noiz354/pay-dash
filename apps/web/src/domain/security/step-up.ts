import { createHash, randomBytes } from "node:crypto";

/**
 * Financial step-up (financial-step-up). Provides operation-bound MFA proof
 * binding and a dual-control policy. The challenge proof is bound to the
 * operation, actor, organization, amount/currency, destinations, and a nonce,
 * and is short-lived and single-use. SMS alone is insufficient; WebAuthn/TOTP
 * carry the actual proof (this module is the binding/expiry logic).
 */

export interface StepUpBinding {
  operationType: string;
  organizationId: string;
  actorId: string;
  resourceId?: string;
  resourceVersion?: number;
  amountMinor?: string; // canonical decimal string
  currency?: string;
  destinationCount?: number;
  destinationRefs?: string[]; // sorted before hashing
  splitRuleVersion?: number;
  nonce: string;
  expiresAt: string; // ISO timestamp
}

export interface StepUpChallenge {
  challengeId: string;
  binding: StepUpBinding;
  digest: string;
  expiresAt: string;
  nonce: string;
  used: boolean;
}

export function createNonce(): string {
  return randomBytes(20).toString("hex");
}

export function challengeDigest(binding: StepUpBinding): string {
  const canonical = {
    operationType: binding.operationType,
    organizationId: binding.organizationId,
    actorId: binding.actorId,
    resourceId: binding.resourceId ?? null,
    resourceVersion: binding.resourceVersion ?? null,
    amountMinor: binding.amountMinor ?? null,
    currency: binding.currency ?? null,
    destinationCount: binding.destinationCount ?? null,
    destinationRefs: [...(binding.destinationRefs ?? [])].sort(),
    splitRuleVersion: binding.splitRuleVersion ?? null,
    nonce: binding.nonce,
    expiresAt: binding.expiresAt,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function createStepUpChallenge(binding: StepUpBinding): StepUpChallenge {
  if (!binding.nonce) {
    return createStepUpChallenge({ ...binding, nonce: createNonce() });
  }
  return {
    challengeId: createHash("sha256").update(`${binding.nonce}:${binding.actorId}`).digest("hex").slice(0, 24),
    binding,
    digest: challengeDigest(binding),
    expiresAt: binding.expiresAt,
    nonce: binding.nonce,
    used: false,
  };
}

export type ProofVerification = { valid: true } | { valid: false; reason: string };

/**
 * Verify a presented proof against the stored challenge. A proof is valid only
 * when: the challenge is unused, it has not expired, the nonce matches, and the
 * binding (operation/amount/currency/destination/version) is unchanged.
 */
export function verifyStepUpProof(
  challenge: StepUpChallenge,
  presented: StepUpBinding,
  now: Date,
): ProofVerification {
  if (challenge.used) {
    return { valid: false, reason: "PROOF_ALREADY_USED" };
  }
  if (new Date(challenge.expiresAt).getTime() <= now.getTime()) {
    return { valid: false, reason: "PROOF_EXPIRED" };
  }
  if (challenge.nonce !== presented.nonce) {
    return { valid: false, reason: "NONCE_MISMATCH" };
  }
  if (challengeDigest(presented) !== challenge.digest) {
    return { valid: false, reason: "OPERATION_CHANGED" };
  }
  return { valid: true };
}

export function markProofUsed(challenge: StepUpChallenge): StepUpChallenge {
  return { ...challenge, used: true };
}

export type DualControlKind =
  | "payout.recipient"
  | "payout.batch"
  | "refund.amount"
  | "refund.pct"
  | "platform.transfer"
  | "split.activation"
  | "recurring.immediate";

export interface DualControlPolicy {
  payoutDualControlPerRecipientMinor: string; // e.g. "25000000" (IDR 25M)
  payoutDualControlPerBatchMinor: string; // e.g. "100000000" (IDR 100M)
  refundDualControlAmountMinor: string; // e.g. "10000000" (IDR 10M)
  refundDualControlMaxPct: number; // e.g. 0.5 (50%)
  recurringImmediateAmountMinor: string; // e.g. "10000000" (IDR 10M)
}

export const DEFAULT_DUAL_CONTROL_POLICY: DualControlPolicy = {
  payoutDualControlPerRecipientMinor: "25000000",
  payoutDualControlPerBatchMinor: "100000000",
  refundDualControlAmountMinor: "10000000",
  refundDualControlMaxPct: 0.5,
  recurringImmediateAmountMinor: "10000000",
};

function gteMinor(value: string | undefined, threshold: string): boolean {
  if (value === undefined) {
    return false;
  }
  return BigInt(value) >= BigInt(threshold);
}

/**
 * Dual-control applicability for the current operation. LIVE platform transfers
 * and split-rule activations always require dual control. Money-movement
 * thresholds are configurable per currency/amount.
 */
export function requiresDualControl(
  kind: DualControlKind,
  args: {
    mode: "TEST" | "LIVE";
    amountMinor?: string;
    batchAmountMinor?: string;
    originalPaymentAmountMinor?: string;
    policy?: DualControlPolicy;
  },
): boolean {
  const policy = args.policy ?? DEFAULT_DUAL_CONTROL_POLICY;
  switch (kind) {
    case "payout.recipient":
      return gteMinor(args.amountMinor, policy.payoutDualControlPerRecipientMinor);
    case "payout.batch":
      return gteMinor(args.batchAmountMinor, policy.payoutDualControlPerBatchMinor);
    case "refund.amount":
      return gteMinor(args.amountMinor, policy.refundDualControlAmountMinor);
    case "refund.pct": {
      if (!args.amountMinor || !args.originalPaymentAmountMinor || args.originalPaymentAmountMinor === "0") {
        return false;
      }
      const pct = Number((BigInt(args.amountMinor) * BigInt(100)) / BigInt(args.originalPaymentAmountMinor)) / 100;
      return pct > policy.refundDualControlMaxPct;
    }
    case "platform.transfer":
      return args.mode === "LIVE";
    case "split.activation":
      return args.mode === "LIVE";
    case "recurring.immediate":
      return gteMinor(args.amountMinor, policy.recurringImmediateAmountMinor);
  }
}

export function isApproverDistinct(requesterId: string, approverId: string): boolean {
  return requesterId !== approverId;
}
