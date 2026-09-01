"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { payInvoice } from "@/server/data/invoices";

// Server Actions for the billing journey. Same serialisable contract as the
// transaction and customer actions so client components can drive pending /
// success / error UI without inventing a second convention.

export type ActionState<T = undefined> = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
};

function revalidateBilling(id?: string) {
  revalidatePath("/[locale]/billing", "page");
  revalidatePath("/billing");
  if (id) {
    revalidatePath("/[locale]/billing/[id]", "page");
    revalidatePath(`/billing/${id}`);
  }
}

export const PAYMENT_METHODS = [
  "Auto-debit — BCA •••• 8891",
  "Corporate card — Visa •••• 4242",
  "Bank transfer — Mandiri",
] as const;

const PayInvoiceSchema = z.object({
  id: z.string().trim().min(1, "Invoice id is required"),
  method: z.string().trim().min(3, "Choose a payment method"),
  confirm: z.literal("on", { message: "Confirm the amount before paying" }),
});

export async function payInvoiceAction(
  _prev: ActionState<{ id: string; reference: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string; reference: string }>> {
  const parsed = PayInvoiceSchema.safeParse({
    id: formData.get("id"),
    method: formData.get("method"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const result = await payInvoice(parsed.data.id, parsed.data.method);
    if (!result) return { status: "error", message: "That invoice no longer exists." };
    revalidateBilling(result.invoice.id);
    return {
      status: "success",
      message: `${result.invoice.number} paid`,
      data: { id: result.invoice.id, reference: result.reference },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "The payment could not be processed. Try again.",
    };
  }
}

/**
 * Pay every outstanding invoice in one go (the "Settle all" affordance on the
 * outstanding-balance card). Partial failures are reported, never swallowed.
 */
export async function payInvoicesAction(
  _prev: ActionState<{ paid: number; failed: number }> | undefined,
  formData: FormData
): Promise<ActionState<{ paid: number; failed: number }>> {
  const ids = String(formData.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const method = String(formData.get("method") ?? PAYMENT_METHODS[0]);

  if (ids.length === 0) return { status: "error", message: "Nothing to settle." };

  let paid = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const result = await payInvoice(id, method);
      if (result) paid += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  revalidateBilling();
  if (paid === 0) return { status: "error", message: "No invoices could be settled." };
  return {
    status: failed ? "error" : "success",
    message: failed
      ? `${paid} settled, ${failed} failed — retry the remaining invoices.`
      : `${paid} invoice${paid === 1 ? "" : "s"} settled`,
    data: { paid, failed },
  };
}
