"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "./payouts";

export type { ActionState };

function revalidateBilling() {
  revalidatePath("/[locale]/billing", "page");
  revalidatePath("/billing");
}

const CreatePaymentMethodSchema = z.object({
  customerId: z.string().trim().min(2, "Customer id/email is required"),
  token: z.string().trim().min(4, "Attach a card/account token first"),
  kind: z.enum(["card", "bank_account", "ewallet"]).default("card"),
  label: z.string().trim().max(80).optional(),
});

/**
 * Save a payment method through the provider (Stripe PaymentMethod + attach).
 * Saving a method requires a connection that supports `savedPaymentMethods` —
 * otherwise this fails closed (never a mock method).
 */
export async function createPaymentMethodAction(
  _prev: ActionState<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string }>> {
  const parsed = CreatePaymentMethodSchema.safeParse({
    customerId: formData.get("customerId"),
    token: formData.get("token"),
    kind: formData.get("kind") ?? "card",
    label: formData.get("label") ?? undefined,
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
    const { requireOrgContext } = await import("@/server/services/session-org-context");
    const ctx = await requireOrgContext("recurring.create");

    const { createProviderSavedPaymentMethod } = await import("@/server/services/commerce");
    const out = await createProviderSavedPaymentMethod({
      organizationId: ctx.organizationId,
      customerId: parsed.data.customerId,
      token: parsed.data.token,
      kind: parsed.data.kind,
      referenceId: parsed.data.label,
    });
    if (!out.connected) {
      return {
        status: "error",
        message: "No provider connection configured — connect a provider to save a payment method.",
      };
    }
    revalidateBilling();
    return {
      status: "success",
      message: `${out.paymentMethod.kind} saved to ${out.paymentMethod.customerId} via ${out.paymentMethod.provider} (${out.paymentMethod.status})`,
      data: { id: out.paymentMethod.id },
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not save the payment method." };
  }
}
