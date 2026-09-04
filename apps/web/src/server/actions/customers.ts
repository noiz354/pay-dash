"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createCustomer, updateCustomer } from "@/server/data/customers";
import { CUSTOMER_STATUSES } from "@/lib/customer-status";

// Server Actions for the customer journey. Same contract as the transaction
// actions so every client component can drive pending / success / error UI.

export type ActionState<T = undefined> = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
};

function revalidateCustomers(id?: string) {
  revalidatePath("/[locale]/customers", "page");
  revalidatePath("/customers");
  if (id) {
    revalidatePath("/[locale]/customers/[id]", "page");
    revalidatePath(`/customers/${id}`);
  }
}

const CreateCustomerSchema = z.object({
  name: z.string().trim().min(2, "Customer name must be at least 2 characters"),
  email: z.string().trim().email("Enter a valid email address"),
  status: z.enum(CUSTOMER_STATUSES).default("NEW"),
  notes: z.string().trim().max(280, "Keep notes under 280 characters").optional(),
});

export async function createCustomerAction(
  _prev: ActionState<{ id: string; name: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string; name: string }>> {
  const parsed = CreateCustomerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    status: formData.get("status") ?? "NEW",
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  try {
    // Route the customer through the provider when a TEST connection resolves
    // (rekomendasi: customer vault). The in-memory directory is also updated so
    // the row renders; a configured-but-failing provider propagates (never mocked).
    let providerNote = "";
    try {
      const { createProviderCustomer } = await import("@/server/services/commerce");
      const providerResult = await createProviderCustomer({
        referenceId: parsed.data.email,
        name: parsed.data.name,
        email: parsed.data.email,
      });
      if (providerResult.connected) {
        providerNote = ` · provider ${providerResult.customer.provider} ${providerResult.customer.id}`;
      }
    } catch (error) {
      return { status: "error", message: error instanceof Error ? error.message : "Could not create the customer at the provider." };
    }

    const customer = await createCustomer(parsed.data);
    revalidateCustomers(customer.id);
    return {
      status: "success",
      message: `${customer.name} added to your customer directory${providerNote}`,
      data: { id: customer.id, name: customer.name },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not create the customer. Try again.",
    };
  }
}

const UpdateCustomerSchema = z.object({
  id: z.string().trim().min(1, "Customer id is required"),
  name: z.string().trim().min(2, "Customer name must be at least 2 characters").optional(),
  status: z.enum(CUSTOMER_STATUSES).optional(),
  notes: z.string().trim().max(280, "Keep notes under 280 characters").optional(),
});

export async function updateCustomerAction(
  _prev: ActionState<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string }>> {
  const parsed = UpdateCustomerSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name") ?? undefined,
    status: formData.get("status") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const updated = await updateCustomer(parsed.data);
    if (!updated) return { status: "error", message: "That customer no longer exists." };
    revalidateCustomers(updated.id);
    return { status: "success", message: `${updated.name} updated`, data: { id: updated.id } };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not update the customer. Try again.",
    };
  }
}

// Archive is a status transition, not a deletion — the record stays queryable
// and restorable, which is also what compliance expects of a payments product.
export async function archiveCustomerAction(
  _prev: ActionState<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string }>> {
  const id = String(formData.get("id") ?? "");
  const restore = String(formData.get("restore") ?? "") === "1";
  if (!id) return { status: "error", message: "Customer id is required." };

  const updated = await updateCustomer({ id, status: restore ? "ACTIVE" : "BLOCKED" });
  if (!updated) return { status: "error", message: "That customer no longer exists." };
  revalidateCustomers(updated.id);
  return {
    status: "success",
    message: restore ? `${updated.name} restored to active` : `${updated.name} archived`,
    data: { id: updated.id },
  };
}
