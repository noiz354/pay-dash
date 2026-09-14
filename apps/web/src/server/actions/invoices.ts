"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/invoice-status";
import { payInvoice } from "@/server/data/invoices";
import {
  BILLING_NOT_FOUND_MESSAGE,
  requireBillingOrganizationContext,
} from "@/server/services/billing-organization-context";
import { TenantIsolationError } from "@/domain/security/tenant";

export { PAYMENT_METHODS };

// Server Actions for the billing journey. Same serialisable contract as the
// transaction and customer actions so client components can drive pending /
// success / error UI without inventing a second convention.
//
// Wave 7D: the tenant comes from the session seam before any store access —
// `payInvoice` is a money mutation, so it resolves through
// `requireBillingOrganizationContext` (strict: no demo fallback) and a foreign
// id answers with the same string as a missing one.

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
    const access = await requireBillingOrganizationContext("recurring.immediate_charge");
    const result = await payInvoice(access.context, parsed.data.id, parsed.data.method);
    if (!result) return { status: "error", message: BILLING_NOT_FOUND_MESSAGE };
    revalidateBilling(result.invoice.id);
    return {
      status: "success",
      message: `${result.invoice.number} paid`,
      data: { id: result.invoice.id, reference: result.reference },
    };
  } catch (error) {
    // A foreign id is indistinguishable from a missing one on the wire (C-5);
    // the refusal itself is audited inside the DAL, not explained to the caller.
    if (error instanceof TenantIsolationError) {
      return { status: "error", message: BILLING_NOT_FOUND_MESSAGE };
    }
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

  // Resolve the tenant once, before the loop: a bulk settle with no session must
  // not touch the store at all. Per-row scoping is the DAL's job — a row that is
  // not the caller's is counted as a failure, never silently dropped and never
  // silently charged (spec §5: "no silent cross-tenant drops").
  let ctx;
  try {
    ctx = (await requireBillingOrganizationContext("recurring.immediate_charge")).context;
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Not authorized to settle invoices.",
    };
  }

  let paid = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const result = await payInvoice(ctx, id, method);
      if (result) paid += 1;
      else failed += 1;
    } catch {
      // Cross-tenant and already-settled rows both land here: the count is the
      // honest answer, and the refusal is audited in the DAL.
      failed += 1;
    }
  }

  revalidateBilling();
  // The count is part of the answer even when it is zero: a batch that settled
  // nothing still has to tell the caller how many rows were attempted, and that
  // none of them were charged (spec: no silent cross-tenant drops).
  if (paid === 0) {
    return { status: "error", message: "No invoices could be settled.", data: { paid, failed } };
  }
  return {
    status: failed ? "error" : "success",
    message: failed
      ? `${paid} settled, ${failed} failed — retry the remaining invoices.`
      : `${paid} invoice${paid === 1 ? "" : "s"} settled`,
    data: { paid, failed },
  };
}

const CreateInvoiceSchema = z.object({
  number: z.string().trim().min(3, "Invoice number is required"),
  counterparty: z.string().trim().min(2, "Counterparty is required"),
  amount: z
    .string()
    .trim()
    .transform((v) => Number(v.replace(/[^0-9.]/g, "")))
    .refine((n) => Number.isFinite(n) && n > 0, "Amount must be greater than zero"),
  currency: z.enum(["IDR", "USD"]).default("IDR"),
  email: z.string().trim().email("Enter a valid email").or(z.literal("")),
});

/**
 * Issue a hostable invoice through the provider (Xendit Invoice / Stripe
 * Checkout-Invoice). Invoices in this app are ledger-derived (ADR-0008); issuing
 * a hostable provider invoice requires a configured connection — otherwise this
 * fails closed (never a mock invoice).
 */
export async function createInvoiceAction(
  _prev: ActionState<{ id: string; checkoutUrl: string | null }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string; checkoutUrl: string | null }>> {
  const parsed = CreateInvoiceSchema.safeParse({
    number: formData.get("number"),
    counterparty: formData.get("counterparty"),
    amount: formData.get("amount"),
    currency: formData.get("currency") ?? "IDR",
    email: formData.get("email") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  try {
    // Org-context authz: the acting org + role come from the session membership.
    // Wave 7D: through the billing seam, so the demo fallback is refused the
    // moment a second tenant holds invoices.
    const access = await requireBillingOrganizationContext("money_in.create");
    const ctx = access.context;

    const { createProviderInvoice } = await import("@/server/services/commerce");
    const out = await createProviderInvoice({
      organizationId: ctx.organizationId,
      externalId: parsed.data.number,
      amountMinor: String(parsed.data.amount),
      currency: parsed.data.currency,
      description: `${parsed.data.counterparty} — ${parsed.data.number}`,
      payerEmail: parsed.data.email || null,
    });
    if (!out.connected) {
      return { status: "error", message: "No provider connection configured — connect a provider to issue a hostable invoice." };
    }
    revalidateBilling();
    return {
      status: "success",
      message: `Invoice ${parsed.data.number} issued via ${out.invoice.provider} (${out.invoice.status})`,
      data: { id: out.invoice.id, checkoutUrl: out.invoice.checkoutUrl },
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not issue the invoice." };
  }
}
