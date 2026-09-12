import "server-only";

/**
 * Wave 6 — resolving ambiguous provider outcomes (INV-I1).
 *
 * `payment-flow.ts` already does the hard part correctly: a transport timeout,
 * an upstream 5xx, or a provider idempotency conflict lands the durable
 * operation in `UNKNOWN` rather than `FAILED`, because "the response was lost"
 * is not the same as "the write did not happen".
 *
 * What was missing is everything after that. `domain/payments/operations.ts`
 * permits `UNKNOWN → EXECUTING`, so a well-meaning retry button on an operation
 * whose payout actually succeeded pays the recipient twice. The docblock in
 * that file already states the intended rule — *"ambiguous outcome is
 * reconciled before any retry"* — but nothing implemented it.
 *
 * This module implements it:
 *
 *   UNKNOWN --probe--> CONFIRMED_APPLIED  -> SUCCEEDED  (no retry, ever)
 *                      CONFIRMED_ABSENT   -> retry permitted, same key
 *                      STILL_UNKNOWN      -> stays UNKNOWN, opens a case
 *
 * The probe asks the provider about the **stable idempotency key**, not about a
 * provider resource id we may never have received — if the response was lost we
 * have no id, which is precisely why the key must be derived from the logical
 * operation (ADR-0036) rather than randomly generated.
 */

import type { OperationStatus } from "@/domain/payments/operations";

export type UnknownVerdict = "CONFIRMED_APPLIED" | "CONFIRMED_ABSENT" | "STILL_UNKNOWN";

export type AmbiguousOperation = {
  readonly id: string;
  readonly organizationId: string;
  readonly idempotencyKey: string;
  readonly operationType: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly state: OperationStatus;
  /** When the operation entered `UNKNOWN`. Drives the SLO burn signal. */
  readonly unknownSince: string;
};

/**
 * The provider-side question: "did the write behind this idempotency key take
 * effect?" An adapter that cannot answer must return `STILL_UNKNOWN` — it must
 * never guess `CONFIRMED_ABSENT`, because that is the answer that authorises a
 * second money movement.
 */
export type ProviderProbe = (op: AmbiguousOperation) => Promise<{
  verdict: UnknownVerdict;
  providerResourceId?: string | null;
  detail?: string;
}>;

export class UnknownRecoveryError extends Error {
  constructor(
    readonly code: "NOT_UNKNOWN" | "RETRY_WITHOUT_VERDICT" | "RETRY_AFTER_APPLIED",
    message: string,
  ) {
    super(message);
    this.name = "UnknownRecoveryError";
  }
}

export type RecoveryOutcome = {
  readonly operationId: string;
  readonly verdict: UnknownVerdict;
  /** The state the operation should now hold. */
  readonly nextState: OperationStatus;
  /** True only when a second provider write is safe. */
  readonly retryAllowed: boolean;
  /** True when a human must pick this up (a case is opened). */
  readonly requiresCase: boolean;
  readonly providerResourceId: string | null;
  readonly detail: string;
};

/**
 * Resolve one ambiguous operation.
 *
 * Note what this function does *not* do: it does not retry. It produces a
 * verdict and the state that follows from it. Retrying is a separate, explicit
 * call that must pass `guardUnknownRetry` — separating "find out" from "act"
 * is what makes the dangerous path impossible to reach by accident.
 */
export async function resolveUnknownOperation(
  op: AmbiguousOperation,
  probe: ProviderProbe,
): Promise<RecoveryOutcome> {
  if (op.state !== "UNKNOWN") {
    throw new UnknownRecoveryError(
      "NOT_UNKNOWN",
      `Operation ${op.id} is ${op.state}, not UNKNOWN — there is no ambiguity to resolve.`,
    );
  }

  let result: Awaited<ReturnType<ProviderProbe>>;
  try {
    result = await probe(op);
  } catch (err) {
    // A probe that itself fails leaves the ambiguity exactly where it was.
    // Treating a failed probe as "absent" would be the double-payment bug with
    // extra steps.
    return {
      operationId: op.id,
      verdict: "STILL_UNKNOWN",
      nextState: "UNKNOWN",
      retryAllowed: false,
      requiresCase: true,
      providerResourceId: null,
      detail: `Probe failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  switch (result.verdict) {
    case "CONFIRMED_APPLIED":
      return {
        operationId: op.id,
        verdict: "CONFIRMED_APPLIED",
        nextState: "SUCCEEDED",
        retryAllowed: false,
        requiresCase: false,
        providerResourceId: result.providerResourceId ?? null,
        detail: result.detail ?? "Provider confirmed the write took effect; the lost response was cosmetic.",
      };
    case "CONFIRMED_ABSENT":
      // The provider is authoritative that nothing happened. The operation
      // returns to EXECUTING under the SAME idempotency key, so even if this
      // verdict were wrong the provider's own idempotency would absorb it.
      return {
        operationId: op.id,
        verdict: "CONFIRMED_ABSENT",
        nextState: "EXECUTING",
        retryAllowed: true,
        requiresCase: false,
        providerResourceId: null,
        detail: result.detail ?? "Provider confirmed no write exists for this idempotency key; a retry is safe.",
      };
    default:
      return {
        operationId: op.id,
        verdict: "STILL_UNKNOWN",
        nextState: "UNKNOWN",
        retryAllowed: false,
        requiresCase: true,
        providerResourceId: null,
        detail: result.detail ?? "Provider could not confirm the outcome; the operation stays UNKNOWN pending human review.",
      };
  }
}

/**
 * The hard gate in front of the state machine.
 *
 * `domain/payments/operations.ts` allows `UNKNOWN → EXECUTING` structurally.
 * That edge is legitimate — but only with a recorded `CONFIRMED_ABSENT`
 * verdict. Every caller that wants to retry an ambiguous operation must come
 * through here, and the error message is written for the operator who will read
 * it in a runbook at 3am.
 */
export function guardUnknownRetry(
  op: Pick<AmbiguousOperation, "id" | "state">,
  verdict: UnknownVerdict | null,
): void {
  if (op.state !== "UNKNOWN") return; // not ambiguous; ordinary rules apply

  if (verdict === null) {
    throw new UnknownRecoveryError(
      "RETRY_WITHOUT_VERDICT",
      `Refusing to retry ${op.id}: the operation is UNKNOWN and no provider verdict has been recorded. ` +
        `Run the reconciliation probe first — retrying now may move money a second time.`,
    );
  }
  if (verdict === "CONFIRMED_APPLIED") {
    throw new UnknownRecoveryError(
      "RETRY_AFTER_APPLIED",
      `Refusing to retry ${op.id}: the provider confirmed the original write already took effect. ` +
        `Mark the operation SUCCEEDED instead of retrying it.`,
    );
  }
  if (verdict === "STILL_UNKNOWN") {
    throw new UnknownRecoveryError(
      "RETRY_WITHOUT_VERDICT",
      `Refusing to retry ${op.id}: the provider could not confirm the outcome. ` +
        `This needs a human decision (case management), not an automatic retry.`,
    );
  }
  // CONFIRMED_ABSENT falls through — the only safe retry.
}

/** How long an operation has been ambiguous, in seconds. Feeds the SLO. */
export function unknownAgeSeconds(op: AmbiguousOperation, now: Date = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - Date.parse(op.unknownSince)) / 1000));
}

/**
 * Operations that have been ambiguous past the SLO threshold. These are what
 * the exception queue is for: money whose fate nobody knows is the single most
 * urgent thing in a payments console.
 */
export function agedUnknownOperations(
  ops: readonly AmbiguousOperation[],
  thresholdSeconds: number,
  now: Date = new Date(),
): AmbiguousOperation[] {
  return ops
    .filter((op) => op.state === "UNKNOWN" && unknownAgeSeconds(op, now) > thresholdSeconds)
    .sort((a, b) => a.unknownSince.localeCompare(b.unknownSince));
}
