"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CHANNELS,
  createTransaction,
  refundTransaction,
  retryTransaction,
  getTransaction,
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
  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Missing transaction id." };
  const tx = await retryTransaction(id);
  if (!tx) return { status: "error", message: "Transaction not found." };
  revalidatePath("/[locale]/transactions/[id]", "page");
  revalidatePath("/[locale]/transactions", "page");
  return { status: "success", message: "Payment re-submitted to the processor" };
}
