"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseAmount } from "@/lib/payout-status";
import { formatMoney } from "@/lib/format";
import { TenantIsolationError } from "@/domain/security/tenant";
import { createLink, expireLink, recordLinkPayment, getLink, totalOf } from "@/server/data/links";
import {
  ingestAccessDeniedState,
  requireIngestOrganizationContext,
} from "@/server/services/ingest-organization-context";
import { requireTransactionOrganizationContext } from "@/server/services/transaction-organization-context";
import type { ActionState } from "./payouts";

export type { ActionState };

/** A cross-tenant id answers exactly like an unknown one (C-5). */
function isCrossTenant(e: unknown): boolean {
  return e instanceof TenantIsolationError;
}

/** The DAL's own not-found signal, matched by name (the class is not exported). */
function isUnknownLink(e: unknown): boolean {
  return e instanceof Error && e.name === "UnknownLinkError";
}

/**
 * Uniform wire answer for "no such link you can touch": identical for a foreign
 * id and an unknown id, so the action is not an enumeration oracle. Reuses the
 * DAL's legacy message so existing callers and tests see no vocabulary change.
 */
const LINK_NOT_FOUND_MESSAGE = "Unknown payment link.";

function denied<T>(e: unknown): ActionState<T> {
  return ingestAccessDeniedState(e) as ActionState<T>;
}

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
  _prev: ActionState<{ id: string; checkoutUrl?: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string; checkoutUrl?: string }>> {
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

  // Authorization runs after validation (a malformed amount is a field error,
  // not an auth error) and before any store write. The owner comes from the
  // session tenant — `CreateLinkInput` carries no organization field, so a
  // forged one has nowhere to land (P-10).
  let access;
  try {
    access = await requireIngestOrganizationContext("money_in.create");
  } catch (e) {
    return denied<{ id: string; checkoutUrl?: string }>(e);
  }

  const link = createLink(access.context, {
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
  const id = String(formData.get("id") ?? "").trim();

  let access;
  try {
    access = await requireIngestOrganizationContext("money_in.create");
  } catch (e) {
    return denied<undefined>(e);
  }

  try {
    // Order is the contract (G-13): tenant -> link -> status -> write. Closing
    // somebody else's link is refused in the DAL (audited) and mapped here to
    // the same message an unknown id gets.
    expireLink(access.context, id);
    revalidateLinks(id);
    return { status: "success", message: `Link ${id} closed — it can no longer be paid.` };
  } catch (error) {
    if (isCrossTenant(error) || isUnknownLink(error)) {
      return { status: "error", message: LINK_NOT_FOUND_MESSAGE };
    }
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
    // Paying a foreign link is refused in the DAL *before* any ledger write
    // (G-13): the money-path assertion is that nothing is credited anywhere.
    // The wire answer matches an unknown id — no enumeration oracle.
    if (isCrossTenant(error) || isUnknownLink(error)) {
      return { status: "error", message: LINK_NOT_FOUND_MESSAGE };
    }
    return { status: "error", message: error instanceof Error ? error.message : "Could not record the payment." };
  }
}
