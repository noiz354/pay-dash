"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrgContextError } from "@/server/services/org-context";
import { requireStrictOrgContext, resolveSessionOrgContext } from "@/server/services/session-org-context";
import { hasPermission } from "@/domain/organization/roles";
import { requiresDualControl, isApproverDistinct } from "@/domain/security/step-up";
import {
  CHANNELS,
  createTransaction,
  refundTransaction,
  retryTransaction,
  getTransaction,
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
  // BE-003/BE-002: enforce money-in permission fail-closed (JRN-002)
  try {
    await requireStrictOrgContext("money_in.create");
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
    const tx = await createTransaction(parsed.data);
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

const RefundSchema = z.object({
  id: z.string().trim().min(1),
  amount: z
    .string()
    .trim()
    .transform((v) => Number(v.replace(/[^0-9.]/g, "")))
    .refine((n) => Number.isFinite(n) && n > 0, "Refund amount must be greater than zero"),
  reason: z.string().trim().max(200).optional(),
});

export async function refundTransactionAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const parsed = RefundSchema.safeParse({
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

  const existing = await getTransaction(parsed.data.id);
  if (!existing) return { status: "error", message: "Transaction not found." };
  if (existing.status === "FAILED") {
    return { status: "error", message: "Failed payments cannot be refunded — retry it instead." };
  }
  const remaining = existing.amount - existing.refundedAmount;
  if (parsed.data.amount > remaining) {
    return {
      status: "error",
      message: "Refund exceeds the remaining refundable amount.",
      fieldErrors: { amount: ["Refund exceeds the remaining refundable amount"] },
    };
  }

  // BE-002/BE-003: refund permission + dual-control enforcement (JRN-003)
  // Backend is final enforcement point — initiator != approver for threshold amounts
  try {
    const ctx = await resolveSessionOrgContext();
    const canPrepare = ctx.roles.some((r) => hasPermission(r, "refund.prepare"));
    const canExecute = ctx.roles.some((r) => hasPermission(r, "refund.execute"));
    if (!canPrepare && !canExecute) {
      const { OrgContextError } = await import("@/server/services/org-context");
      throw new OrgContextError("FORBIDDEN", "Actor is not authorized for refund.prepare in " + ctx.organizationId);
    }
    if (ctx.isDemoFallback) {
      const { OrgContextError } = await import("@/server/services/org-context");
      const raw = process.env.AUTH_ENFORCED;
      const mode = raw === "off" || raw === "0" || raw === "false" ? "off" : raw === "preview" ? "preview" : "strict";
      if (mode !== "off") throw new OrgContextError("FORBIDDEN", "Authentication required for refund.prepare");
    }
    const amountMinor = String(parsed.data.amount);
    const originalMinor = String(existing.amount);
    const needsDual = requiresDualControl("refund.amount", { mode: "TEST", amountMinor, originalPaymentAmountMinor: originalMinor }) || requiresDualControl("refund.pct", { mode: "TEST", amountMinor, originalPaymentAmountMinor: originalMinor });
    const approverId = String(formData.get("approverId") ?? "").trim() || null;
    if (needsDual) {
      if (!canExecute) {
        return { status: "error", message: "This refund requires a separate approval — you don't have permission to execute refunds." };
      }
      if (!approverId) {
        return { status: "error", message: "This refund requires a separate approval — provide an approver." };
      }
      const requesterId = ctx.userId ?? "unknown";
      if (!isApproverDistinct(requesterId, approverId)) {
        return { status: "error", message: "Requester cannot be the approver — a different user must approve this refund." };
      }
    } else {
      // For non-dual refunds, prepare is sufficient; execute also allowed
      if (!canPrepare && !canExecute) {
        return { status: "error", message: "You don't have permission to prepare refunds." };
      }
    }
  } catch (e) {
    if (e instanceof OrgContextError) return { status: "error", message: e.message.includes("Authentication") ? "Authentication required — please sign in." : e.message };
    if (e instanceof Error && (e.message.includes("separate approval") || e.message.includes("approver"))) return { status: "error", message: e.message };
    // Re-throw unexpected? But we already handled
  }

  // Rekomendasi #5: route the refund through the provider payment-flow when a
  // TEST connection resolves (idempotency + durable op + authz/step-up + audit).
  // A configured-but-failing provider propagates (never mock); with no connection
  // the in-memory dev/demo ledger is the fallback.
  try {
    const { tryProviderRefund } = await import("@/server/payment-flows/execute-provider-write");
    const providerResult = await tryProviderRefund({
      originalPaymentId: parsed.data.id,
      amountMinor: String(parsed.data.amount),
      currency: existing.currency,
      originalPaymentAmountMinor: String(existing.amount),
      approverId: String(formData.get("approverId") ?? "").trim() || null,
    });
    if (providerResult.connected) {
      revalidatePath("/[locale]/transactions/[id]", "page");
      revalidatePath("/[locale]/transactions", "page");
      revalidatePath("/[locale]/dashboard", "page");
      return {
        status: "success",
        message: `Refund issued via ${providerResult.result.provider} (${providerResult.result.providerResourceId})`,
      };
    }
  } catch (error) {
    // Provider write failed (dual-control required / provider error) — surface.
    return { status: "error", message: error instanceof Error ? error.message : "Refund failed." };
  }

  await refundTransaction(parsed.data.id, parsed.data.amount, parsed.data.reason ?? "");
  revalidatePath("/[locale]/transactions/[id]", "page");
  revalidatePath("/[locale]/transactions", "page");
  revalidatePath("/[locale]/dashboard", "page");
  return { status: "success", message: "Refund issued" };
}

export async function retryTransactionAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  // BE-003: retry requires money-in permission (resubmit)
  try {
    await requireStrictOrgContext("money_in.create");
  } catch (e) {
    if (e instanceof OrgContextError) return { status: "error", message: e.message.includes("Authentication") ? "Authentication required — please sign in." : "You don't have permission to retry payments." };
    return { status: "error", message: e instanceof Error ? e.message : "Unauthorized" };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Missing transaction id." };
  const tx = await retryTransaction(id);
  if (!tx) return { status: "error", message: "Transaction not found." };
  revalidatePath("/[locale]/transactions/[id]", "page");
  revalidatePath("/[locale]/transactions", "page");
  return { status: "success", message: "Payment re-submitted to the processor" };
}

// ---------------------------------------------------------------------------
// Wave 4 §4 — cross-role refund journey (JRN-003, spec §9 Refund dual-control)
// ---------------------------------------------------------------------------
//
// `refundTransactionAction` above is the single-step path: one actor, one form,
// an `approverId` text field. It stays for refunds below the dual-control
// threshold. The three actions below are the journey that actually changes hands:
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
    ctx = await requireStrictOrgContext("refund.prepare");
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

  const result = await requestRefund({
    transactionId: parsed.data.id,
    amount: parsed.data.amount,
    reason: parsed.data.reason ?? "",
    // The actor comes from the session, never from the form — otherwise a client
    // could name itself as its own approver.
    requestedBy: ctx.userId ?? "unknown",
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
    ctx = await requireStrictOrgContext("refund.execute");
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

  const result = await approveRefund({ transactionId: parsed.data.id, approvedBy: ctx.userId ?? "unknown" });
  if (!result.ok) return { status: "error", message: result.message };

  revalidateRefundSurfaces();
  return { status: "success", message: "Refund approved and issued." };
}

/** Role B rejects the pending refund. No money moves. */
export async function rejectRefundAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  let ctx;
  try {
    ctx = await requireStrictOrgContext("refund.execute");
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

  const result = await rejectRefund({
    transactionId: parsed.data.id,
    rejectedBy: ctx.userId ?? "unknown",
    reason: parsed.data.reason,
  });
  if (!result.ok) return { status: "error", message: result.message };

  revalidateRefundSurfaces();
  return { status: "success", message: "Refund rejected — no money moved." };
}
