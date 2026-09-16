"use server";

import { revalidatePath } from "next/cache";
import { OrgContextError } from "@/server/services/org-context";
import { requireStrictOrgContext } from "@/server/services/session-org-context";
import { z } from "zod";
import { parseAmount } from "@/lib/payout-status";
import { formatMoney } from "@/lib/format";
import { createLink, expireLink, recordLinkPayment, getLink, totalOf } from "@/server/data/links";
import { requireTransactionOrganizationContext } from "@/server/services/transaction-organization-context";
import type { ActionState } from "./payouts";

export type { ActionState };

// Server Actions for the payment-link journey (ADR-0013). Same serialisable
// ActionState contract as the other mutation surfaces.

/**
 * Audit finding S-02 — `createPaymentLinkAction` and `expirePaymentLinkAction` had no authorization.
 *
 * `createPaymentLinkAction` mints a payable link in the process-global store with no tenant attribution; `expirePaymentLinkAction` closes any link by id, so any caller could take down a live payment link a merchant had already sent to customers — revenue denial with no trace of who did it. `payPaymentLinkAction` in this file was already gated through the transaction seam.
 *
 * Both are money-in surfaces: creating a link is how a payment gets collected, and expiring one stops it. `money_in.create` matches what `payPaymentLinkAction` already requires through `requireTransactionOrganizationContext`, so the three actions on one resource now agree.
 *
 * STILL OPEN (roadmap Phase 3): `data/links.ts` is process-global with no `organizationId`, so `expirePaymentLinkAction` still takes an unscoped id — it now requires a money-in privilege to call, but is not yet restricted to the caller's own links. That is Phase 3.
 */
async function requireLinkWrite(): Promise<ActionState<never> | null> {
  try {
    await requireStrictOrgContext("money_in.create");
    return null;
  } catch (e) {
    if (e instanceof OrgContextError) {
      return {
        status: "error",
        message: e.message.includes("Authentication")
          ? "Sign in to manage payment links."
          : "You don't have permission to manage payment links.",
      };
    }
    return { status: "error", message: e instanceof Error ? e.message : "Sign in to manage payment links." };
  }
}

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
  _prev: ActionState<{ id: string; checkoutUrl?: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string; checkoutUrl?: string }>> {
  const denied = await requireLinkWrite();
  if (denied) return denied;

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

  // TEST-mode money-in: if a provider connection is configured, route a hosted
  // payment link through the payment-flow orchestration (idempotency + durable
  // operation + audit). When no connection is configured this returns null and
  // we keep the local dev/demo link. A configured provider that FAILS is
  // surfaced as an error — never silently downgraded to mock success.
  let checkoutUrl: string | null = null;
  try {
    const { createMoneyInRuntime } = await import("@/server/payment-flows/money-in-runtime");
    const moneyIn = await createMoneyInRuntime();
    const result = await moneyIn.executeHostedPayment({
      externalId: link.id,
      amountMinor: String(totalOf(link)),
      currency: link.currency,
      description: `${link.kind} payment link`,
      payerEmail: link.payerEmail,
    });
    if (result) checkoutUrl = result.checkoutUrl ?? null;
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not create the hosted payment." };
  }

  return {
    status: "success",
    message: `Link created — ${link.id} for ${formatMoney(totalOf(link), link.currency)}${checkoutUrl ? " · hosted payment ready" : "."}`,
    data: { id: link.id, checkoutUrl: checkoutUrl ?? undefined },
  };
}

export async function expirePaymentLinkAction(
  _prev: ActionState<undefined> | undefined,
  formData: FormData
): Promise<ActionState<undefined>> {
  const denied = await requireLinkWrite();
  if (denied) return denied;

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
    // Paying a link credits the transaction ledger, so the write is tenant-bound
    // — and this action had no authorization at all before Wave 7A.
    const access = await requireTransactionOrganizationContext("money_in.create");
    const { transactionId, total } = await recordLinkPayment(access.context, id);
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
