"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseAmount } from "@/lib/payout-status";
import { formatMoney } from "@/lib/format";
import { createLink, expireLink, recordLinkPayment, getLink, totalOf } from "@/server/data/links";
import type { ActionState } from "./payouts";

export type { ActionState };

// Server Actions for the payment-link journey (ADR-0013). Same serialisable
// ActionState contract as the other mutation surfaces.

function revalidateLinks(id?: string) {
  revalidatePath("/[locale]/payments/links", "page");
  revalidatePath("/payments/links");
  if (id) {
    revalidatePath(`/[locale]/payments/links/${id}`, "page");
    revalidatePath(`/payments/links/${id}`);
  }
}

// A simulated payment lands in the ledger — keep the ledger, the balance and
// the dashboard in step with it.
function revalidateAfterPayment(id: string) {
  revalidateLinks(id);
  revalidatePath("/[locale]/transactions", "page");
  revalidatePath("/transactions");
  revalidatePath(`/[locale]/transactions/${id}`, "page");
  revalidatePath("/[locale]/balance", "page");
  revalidatePath("/balance");
  revalidatePath("/[locale]/dashboard", "page");
  revalidatePath("/dashboard");
}

function fieldErrorsOf(error: z.ZodError) {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

const itemSchema = z.object({
  label: z.string().trim().min(1, "Give each item a label").max(60, "Labels are capped at 60 characters"),
  amount: z.number().int().min(1_000, "Item amounts start at Rp 1,000"),
});

// `amount` and `items` are both present in the FormData; only the one that
// matches `kind` must satisfy its own rule, so the kind-specific checks live
// in a refinement rather than on the base fields.
const CreateLinkSchema = z
  .object({
    kind: z.enum(["single", "multiple"]),
    payerEmail: z.string().trim().email("That email does not look right").or(z.literal("")),
    amount: z.number().int(),
    items: z.array(itemSchema),
    expiresIn: z.enum(["", "7", "30"]),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "single" && v.amount < 10_000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "Links start at Rp 10,000" });
    }
    if (v.kind === "multiple") {
      if (v.items.length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "A multiple link needs at least two items." });
      }
      if (v.items.length > 20) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "Links are capped at 20 items." });
      }
    }
  });

export async function createPaymentLinkAction(
  _prev: ActionState<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string }>> {
  const kind = String(formData.get("kind") ?? "single");
  const payerEmail = String(formData.get("payerEmail") ?? "").trim();
  const expiresIn = String(formData.get("expiresIn") ?? "");
  const amount = parseAmount(String(formData.get("amount") ?? "")) ?? 0;

  let items: { label: string; amount: number }[] = [];
  try {
    const raw = String(formData.get("items") ?? "[]");
    const parsed: unknown = JSON.parse(raw);
    items = Array.isArray(parsed)
      ? parsed
          .map((it) => {
            const o = it as { label?: unknown; amount?: unknown };
            return { label: String(o.label ?? ""), amount: parseAmount(String(o.amount ?? "")) ?? 0 };
          })
          .filter((it) => it.label.length > 0 || it.amount > 0)
      : [];
  } catch {
    items = [];
  }

  const parsed = CreateLinkSchema.safeParse({ kind, payerEmail, amount, items, expiresIn });
  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error);
    if (kind === "single" && (amount ?? 0) <= 0) fieldErrors.amount = ["Enter an amount, e.g. 5,000,000"];
    if (kind === "multiple" && items.length < 2) fieldErrors.items = ["A multiple link needs at least two items with amounts."];
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }

  const linkItems =
    parsed.data.kind === "single"
      ? [{ label: "Payment", amount: parsed.data.amount }]
      : parsed.data.items.map((i) => ({ label: i.label, amount: i.amount }));
  const expiresAt = parsed.data.expiresIn === "" ? null : new Date(Date.now() + Number(parsed.data.expiresIn) * 86_400_000).toISOString();

  const link = createLink({
    kind: parsed.data.kind,
    items: linkItems,
    payerEmail: parsed.data.payerEmail || null,
    expiresAt,
  });

  revalidateLinks(link.id);
  return {
    status: "success",
    message: `Link created — ${link.id} for ${formatMoney(totalOf(link), link.currency)}.`,
    data: { id: link.id },
  };
}

export async function expirePaymentLinkAction(
  _prev: ActionState<undefined> | undefined,
  formData: FormData
): Promise<ActionState<undefined>> {
  const id = String(formData.get("id") ?? "").trim();
  try {
    expireLink(id);
    revalidateLinks(id);
    return { status: "success", message: `Link ${id} closed — it can no longer be paid.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not close the link." };
  }
}

export async function payPaymentLinkAction(
  _prev: ActionState<{ transactionId: string; total: number }> | undefined,
  formData: FormData
): Promise<ActionState<{ transactionId: string; total: number }>> {
  const id = String(formData.get("id") ?? "").trim();
  try {
    const { transactionId, total } = await recordLinkPayment(id);
    revalidateAfterPayment(transactionId);
    return {
      status: "success",
      message: `Payment of ${formatMoney(total, "IDR")} recorded for ${id}.`,
      data: { transactionId, total },
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not record the payment." };
  }
}
