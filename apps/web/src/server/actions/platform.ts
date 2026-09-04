"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildPlatformService } from "@/server/platform/platform-service";

export type PlatformActionState<T = undefined> = {
  status: "idle" | "success" | "error";
  message: string;
  data?: T;
};

function revalidatePlatform() {
  revalidatePath("/[locale]/payments/platform", "page");
  revalidatePath("/payments/platform");
}

const ConnectedAccountSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  type: z.enum(["express", "custom", "standard"]).default("express"),
});

export async function createConnectedAccountAction(
  _prev: PlatformActionState<{ id: string }> | undefined,
  formData: FormData,
): Promise<PlatformActionState<{ id: string }>> {
  const parsed = ConnectedAccountSchema.safeParse({
    email: formData.get("email"),
    type: formData.get("type") ?? "express",
  });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields." };
  }
  try {
    // Org-context authz: the acting org + role come from the session membership.
    const { requireOrgContext } = await import("@/server/services/session-org-context");
    const ctx = await requireOrgContext("provider.connect.test");

    const service = await buildPlatformService();
    const out = await service.createConnectedAccount({ organizationId: ctx.organizationId, email: parsed.data.email, type: parsed.data.type });
    if (!out.connected) {
      return { status: "error", message: "No provider connection configured — connect a provider before creating an account." };
    }
    revalidatePlatform();
    return {
      status: "success",
      message: `Connected account ${out.account.id} created (${out.account.status}).`,
      data: { id: out.account.id },
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not create the connected account." };
  }
}

const SplitRuleSchema = z.object({
  name: z.string().trim().min(3, "Give the rule a name"),
  currency: z.enum(["IDR", "USD"]).default("IDR"),
  destinations: z
    .string()
    .trim()
    .transform((v) => {
      try {
        const parsed = JSON.parse(v) as Array<{ accountId?: unknown; amount?: unknown; percent?: unknown }>;
        return parsed
          .map((d) => ({
            accountId: String(d.accountId ?? ""),
            amount: Number(d.amount ?? 0),
            percent: d.percent == null ? null : Number(d.percent),
          }))
          .filter((d) => d.accountId.length > 0);
      } catch {
        return [];
      }
    }),
});

export async function createSplitRuleAction(
  _prev: PlatformActionState<{ id: string }> | undefined,
  formData: FormData,
): Promise<PlatformActionState<{ id: string }>> {
  const parsed = SplitRuleSchema.safeParse({
    name: formData.get("name"),
    currency: formData.get("currency") ?? "IDR",
    destinations: formData.get("destinations"),
  });
  if (!parsed.success || parsed.data.destinations.length === 0) {
    return { status: "error", message: "Add at least one destination to the split rule." };
  }
  try {
    // Org-context authz: the acting org + role come from the session membership.
    const { requireOrgContext } = await import("@/server/services/session-org-context");
    const ctx = await requireOrgContext("split.prepare");

    const service = await buildPlatformService();
    const out = await service.createSplitRule({
      organizationId: ctx.organizationId,
      name: parsed.data.name,
      currency: parsed.data.currency,
      destinations: parsed.data.destinations,
    });
    if (!out.connected) {
      return { status: "error", message: "No provider connection configured — connect a provider first." };
    }
    revalidatePlatform();
    return {
      status: "success",
      message: `Split rule ${out.rule.id} created (${out.rule.status}).`,
      data: { id: out.rule.id },
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not create the split rule." };
  }
}

export async function createTransferAction(
  _prev: PlatformActionState<{ id: string }> | undefined,
  formData: FormData,
): Promise<PlatformActionState<{ id: string }>> {
  const amount = Number(String(formData.get("amount") ?? "").replace(/[^0-9.]/g, ""));
  const destination = String(formData.get("destination") ?? "").trim();
  const currency = String(formData.get("currency") ?? "IDR");
  if (!Number.isFinite(amount) || amount <= 0 || !destination) {
    return { status: "error", message: "Enter a valid amount and destination." };
  }
  try {
    // Org-context authz: the acting org + role come from the session membership.
    const { requireOrgContext } = await import("@/server/services/session-org-context");
    const ctx = await requireOrgContext("transfer.execute");

    const service = await buildPlatformService();
    const out = await service.createTransfer({ organizationId: ctx.organizationId, amount, currency, destination });
    if (!out.connected) {
      return { status: "error", message: "No provider connection configured — connect a provider first." };
    }
    revalidatePlatform();
    return {
      status: "success",
      message: `Transfer ${out.transfer.id} created (${out.transfer.status}).`,
      data: { id: out.transfer.id },
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not create the transfer." };
  }
}
