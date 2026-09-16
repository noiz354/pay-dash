"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrgContextError } from "@/server/services/org-context";

import { requireTransactionOrganizationContext } from "@/server/services/transaction-organization-context";
import {
  CHANNELS,
  createTransaction,
  retryTransactionWithVersion,
  requestRefund,
  approveRefund,
  rejectRefund,
} from "@/server/data/transactions";

// Server Actions for the transaction journey.
// Every action returns a serialisable ActionState so client components can drive
// pending / success / error UI (toasts, disabled buttons, inline field errors).

export type ActionState<T = undefined> = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
  /** 409 recovery payload (CMP-020) — present when the mutation lost a race. */
  conflict?: {
    description: string;
    currentState: Record<string, unknown>;
    detectedAt: string;
  };
};

const CreateTransactionSchema = z.object({
  customerName: z.string().trim().min(2, "Customer name must be at least 2 characters"),
  customerEmail: z.string().trim().email("Enter a valid email address"),
  amount: z
    .string()
    .trim()
    .min(1, "Amount is required")
    .transform((v) => Number(v.replace(/[^0-9.]/g, "")))
    .refine((n) => Number.isFinite(n) && n > 0, "Amount must be greater than zero")
    .refine((n) => n <= 5_000_000_000, "Amount exceeds the 5B per-transaction limit"),
  currency: z.enum(["IDR", "USD"]).default("IDR"),
  channel: z.enum(CHANNELS),
  description: z.string().trim().max(140, "Keep the description under 140 characters").optional(),
});

export async function createTransactionAction(
  _prev: ActionState<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string }>> {
  // BE-003/BE-002: enforce money-in permission fail-closed (JRN-002).
  // Wave 7A: the same resolution also yields the tenant the row is written into
  // — permission answers "may this actor create a payment", the context answers
  // "…in whose ledger". Both come from the session, never from the form.
  let access;
  try {
    access = await requireTransactionOrganizationContext("money_in.create");
  } catch (e) {
    if (e instanceof OrgContextError) return { status: "error", message: e.message.includes("Authentication") ? "Authentication required — please sign in." : "You don't have permission to create payments." };
    return { status: "error", message: e instanceof Error ? e.message : "Unauthorized" };
  }
  const parsed = CreateTransactionSchema.safeParse({
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    amount: formData.get("amount"),
    currency: formData.get("currency") ?? "IDR",
    channel: formData.get("channel"),
    description: formData.get("description") ?? undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const tx = await createTransaction(access.context, parsed.data);
    revalidatePath("/[locale]/dashboard", "page");
    revalidatePath("/[locale]/transactions", "page");
    return {
      status: "success",
      message: `Transaction ${tx.referenceId} created`,
      data: { id: tx.id },
    };
  } catch {
    return { status: "error", message: "Could not create the transaction. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// The single-step refund path that used to live here was removed.
// ---------------------------------------------------------------------------
//
// `refundTransactionAction` enforced refund dual control like this:
//
//     const approverId  = String(formData.get("approverId") ?? "").trim() || null;
//     const requesterId = ctx.userId ?? "unknown";
//     if (!isApproverDistinct(requesterId, approverId)) -> reject
//
// `isApproverDistinct` is `requesterId !== approverId`. The approver was whoever
// the request body said it was: no existence check, no `refund.execute` check, no
// membership check, no consent, and no approval record created by that person.
// Any string other than your own user id satisfied the control on a money-out
// refund at or above the IDR 10M / 50%-of-original threshold (audit finding S-03).
//
// It was also the only money-movement action in the repository using the *read*
// seam (`resolveTransactionOrganizationContext`) rather than the strict write seam
// every sibling uses, re-implementing permission and demo-fallback denial inline
// instead of inheriting the seam's fail-closed guarantee.
//
// Its sole importer was `components/transactions/refund-dialog.tsx`, which had no
// importers of its own — so the action was dead in the UI while remaining a
// routable `"use server"` endpoint. Both are gone.
//
// The live journey below is the replacement and was already correct: the actor is
// resolved from the session, never from the form, and separation of duties is
// enforced against the stored requester at `data/transactions.ts` (`SAME_ACTOR`).

export async function retryTransactionAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  // BE-003: retry requires money-in permission (resubmit). Strict + tenant in one
  // step, so the mutation below cannot be addressed by id alone.
  let access;
  try {
    access = await requireTransactionOrganizationContext("money_in.create");
  } catch (e) {
    if (e instanceof OrgContextError) return { status: "error", message: e.message.includes("Authentication") ? "Authentication required — please sign in." : "You don't have permission to retry payments." };
    return { status: "error", message: e instanceof Error ? e.message : "Unauthorized" };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Missing transaction id." };
  // Optimistic concurrency (CMP-020): the client sends the updatedAt it
  // rendered. If the row moved since then, the server refuses with a conflict
  // payload instead of applying a blind mutation.
  const expectedUpdatedAt = (formData.get("expectedUpdatedAt") as string | null) || null;
  const result = await retryTransactionWithVersion(access.context, id, expectedUpdatedAt, access.actorId);
  if (!result.ok) {
    if (result.code === "CONFLICT") {
      return {
        status: "error",
        message: result.message,
        conflict: {
          description: "The payment was modified by someone else while you were viewing it.",
          currentState: {
            status: result.latest.status,
            "last updated": result.latest.updatedAt,
            "refund state": result.latest.refundState,
          },
          detectedAt: new Date().toISOString(),
        },
      };
    }
    return { status: "error", message: result.message };
  }
  revalidatePath("/[locale]/transactions/[id]", "page");
  revalidatePath("/[locale]/transactions", "page");
  return { status: "success", message: "Payment re-submitted to the processor" };
}

// ---------------------------------------------------------------------------
// Wave 4 §4 — cross-role refund journey (JRN-003, spec §9 Refund dual-control)
// ---------------------------------------------------------------------------
//
// These three actions are the only refund path. The journey changes hands:
//
//   Role A (refund.prepare)  requestRefundAction  -> AWAITING_APPROVAL + handoff
//                                                   + notification to Role B
//   Role B (refund.execute)  approveRefundAction  -> money moves, handoff closed
//                             rejectRefundAction  -> nothing moves, handoff closed
//
// Each action resolves the actor from the session (never from the form), enforces
// its permission server-side, and revalidates the ledger, the detail screen and
// the dashboard so Role B's queue and the Command Center lane update together.

const RefundRequestSchema = z.object({
  id: z.string().trim().min(1, "Missing transaction id"),
  amount: z
    .string()
    .trim()
    .transform((v) => Number(v.replace(/[^0-9.]/g, "")))
    .refine((n) => Number.isFinite(n) && n > 0, "Refund amount must be greater than zero"),
  reason: z.string().trim().min(3, "Give the approver a reason (at least 3 characters)").max(200).optional(),
});

const RefundDecisionSchema = z.object({
  id: z.string().trim().min(1, "Missing transaction id"),
  reason: z.string().trim().max(200).optional(),
});

function denyMessage(e: unknown, fallback: string): string {
  if (e instanceof OrgContextError) {
    return e.message.includes("Authentication") ? "Authentication required — please sign in." : fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

function revalidateRefundSurfaces(): void {
  revalidatePath("/[locale]/transactions/[id]", "page");
  revalidatePath("/[locale]/transactions", "page");
  revalidatePath("/[locale]/dashboard", "page");
}

/** Role A asks for a refund. No money moves; Role B is notified. */
export async function requestRefundAction(
  _prev: ActionState<{ awaitingApproval: boolean }> | undefined,
  formData: FormData,
): Promise<ActionState<{ awaitingApproval: boolean }>> {
  let ctx;
  try {
    ctx = await requireTransactionOrganizationContext("refund.prepare");
  } catch (e) {
    return { status: "error", message: denyMessage(e, "You don't have permission to request refunds.") };
  }

  const parsed = RefundRequestSchema.safeParse({
    id: formData.get("id"),
    amount: formData.get("amount"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const result = await requestRefund(ctx.context, {
    transactionId: parsed.data.id,
    amount: parsed.data.amount,
    reason: parsed.data.reason ?? "",
    // The actor comes from the session, never from the form — otherwise a client
    // could name itself as its own approver. The tenant comes from the same
    // place, which is what stops that actor from naming someone else's row.
    requestedBy: ctx.actorId ?? "unknown",
  });

  if (!result.ok) return { status: "error", message: result.message };

  revalidateRefundSurfaces();
  return {
    status: "success",
    message: result.created
      ? "Refund requested — it now needs a second approval from a Finance Admin or Owner."
      : "This refund is already awaiting approval.",
    data: { awaitingApproval: true },
  };
}

/** Role B approves the pending refund. Must be a different actor. */
export async function approveRefundAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  let ctx;
  try {
    ctx = await requireTransactionOrganizationContext("refund.execute");
  } catch (e) {
    return { status: "error", message: denyMessage(e, "You don't have permission to approve refunds.") };
  }

  const parsed = RefundDecisionSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const result = await approveRefund(ctx.context, { transactionId: parsed.data.id, approvedBy: ctx.actorId ?? "unknown" });
  if (!result.ok) return { status: "error", message: result.message };

  revalidateRefundSurfaces();
  // F-01: `approveRefund` moves ledger state (refundedAmount, status REFUNDED,
  // audit event) and closes the handoff. It makes no provider call, so nothing
  // is refunded at Xendit or Stripe. Claiming "issued" told the approver the
  // customer had been paid when they had not — roadmap item 4.4 adds the call;
  // until then the copy states what actually happened.
  return {
    status: "success",
    message: "Refund approved and recorded in the ledger — no provider refund was issued.",
  };
}

/** Role B rejects the pending refund. No money moves. */
export async function rejectRefundAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  let ctx;
  try {
    ctx = await requireTransactionOrganizationContext("refund.execute");
  } catch (e) {
    return { status: "error", message: denyMessage(e, "You don't have permission to decide refunds.") };
  }

  const parsed = RefundDecisionSchema.safeParse({ id: formData.get("id"), reason: formData.get("reason") ?? undefined });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const result = await rejectRefund(ctx.context, {
    transactionId: parsed.data.id,
    rejectedBy: ctx.actorId ?? "unknown",
    reason: parsed.data.reason,
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidateRefundSurfaces();
  return { status: "success", message: "Refund rejected — no money moved." };
}
