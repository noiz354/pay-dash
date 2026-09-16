"use server";

import { revalidatePath } from "next/cache";
import { OrgContextError } from "@/server/services/org-context";
import { requireStrictOrgContext } from "@/server/services/session-org-context";
import { z } from "zod";
import { parseAmount } from "@/lib/payout-status";
import { formatMoney } from "@/lib/format";
import { TOPUP_METHODS } from "@/lib/balance-status";
import { topUpBalance, withdrawBalance } from "@/server/data/balance";
import { requirePayoutOrganizationContext } from "@/server/services/payout-organization-context";
import type { ActionState } from "./payouts";

export type { ActionState };

// Server Actions for the balance journey. Same serialisable `ActionState`
// contract as payouts / transactions / customers / invoices / settings.

function revalidateBalance(batchId?: string) {
  revalidatePath("/[locale]/balance", "page");
  revalidatePath("/balance");
  // A withdrawal is a batch — keep the payout views in step.
  revalidatePath("/[locale]/payouts", "page");
  revalidatePath("/payouts");
  if (batchId) {
    revalidatePath(`/[locale]/payouts/${batchId}`, "page");
    revalidatePath(`/payouts/${batchId}`);
  }
}

function fieldErrorsOf(error: z.ZodError) {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

// --- top up -------------------------------------------------------------------

/**
 * Audit finding S-02 — `topUpBalanceAction` fabricated balance with no authorization.
 *
 * Neither the action nor `topUpBalance` reads the session, so any caller who could reach the endpoint added arbitrary funds to the balance (bounded only by the Rp 10,000 minimum in `TopUpSchema`), and `revalidateBalance()` then displayed the invented figure. `withdrawBalanceAction` in this same file was already gated through the payout seam, which left the funding side of the ledger open while the spending side was closed.
 *
 * `money_in.create` is the existing permission for money entering the account, and the same one now required to issue and settle invoices and links, so the three funding surfaces agree. Strict mode, because inventing balance is a money write.
 *
 * STILL OPEN (roadmap Phase 3): `data/balance.ts` is one process-global balance with no `organizationId`, so this narrows *who* may top up, not *whose* balance receives the funds.
 */
async function requireTopUpWrite(): Promise<ActionState<never> | null> {
  try {
    await requireStrictOrgContext("money_in.create");
    return null;
  } catch (e) {
    if (e instanceof OrgContextError) {
      return {
        status: "error",
        message: e.message.includes("Authentication")
          ? "Sign in to top up the balance."
          : "You don't have permission to top up the balance.",
      };
    }
    return { status: "error", message: e instanceof Error ? e.message : "Sign in to top up the balance." };
  }
}

const TopUpSchema = z.object({
  amount: z.number().int().min(10_000, "Top-ups start at Rp 10,000"),
  method: z.enum(TOPUP_METHODS, { message: "Pick a top-up method" }),
});

export async function topUpBalanceAction(
  _prev: ActionState<{ available: number }> | undefined,
  formData: FormData
): Promise<ActionState<{ available: number }>> {
  const denied = await requireTopUpWrite();
  if (denied) return denied;

  const amount = parseAmount(String(formData.get("amount") ?? ""));
  const method = String(formData.get("method") ?? "");

  const parsed = TopUpSchema.safeParse({ amount: amount ?? -1, method });
  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error);
    if (amount === null) fieldErrors.amount = ["Enter an amount, e.g. 50,000,000"];
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }

  try {
    const result = await topUpBalance({ amount: parsed.data.amount, method: parsed.data.method });
    revalidateBalance();
    return {
      status: "success",
      message: `Added ${formatMoney(parsed.data.amount, "IDR")} via ${parsed.data.method}.`,
      data: { available: result.available },
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Top-up failed." };
  }
}

// --- withdraw -------------------------------------------------------------------

const WithdrawSchema = z.object({
  amount: z.number().int().min(10_000, "Withdrawals start at Rp 10,000"),
  accountId: z.string().trim().min(1, "Choose a destination account"),
});

export async function withdrawBalanceAction(
  _prev: ActionState<{ batchId: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ batchId: string }>> {
  const amount = parseAmount(String(formData.get("amount") ?? ""));
  const accountId = String(formData.get("accountId") ?? "");

  const parsed = WithdrawSchema.safeParse({ amount: amount ?? -1, accountId });
  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error);
    if (amount === null) fieldErrors.amount = ["Enter an amount, e.g. 5,000,000"];
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }

  try {
    // Wave 7B: a withdrawal mints and releases a payout batch, so it resolves
    // the session tenant like any other money-out write.
    const { context } = await requirePayoutOrganizationContext("payout.create");
    const result = await withdrawBalance({ amount: parsed.data.amount, accountId: parsed.data.accountId }, context);
    revalidateBalance(result.batchId);
    if (!result.paid) {
      return {
        status: "error",
        message: `The transfer to the destination account was rejected — ${result.failureReason}. No funds left your balance.`,
        data: { batchId: result.batchId },
      };
    }
    return {
      status: "success",
      message: `Withdrew ${formatMoney(parsed.data.amount, "IDR")} — batch ${result.batchId} paid.`,
      data: { batchId: result.batchId },
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Withdrawal failed." };
  }
}
