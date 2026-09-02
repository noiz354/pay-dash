"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseAmount } from "@/lib/payout-status";
import { formatMoney } from "@/lib/format";
import { TOPUP_METHODS } from "@/lib/balance-status";
import { topUpBalance, withdrawBalance } from "@/server/data/balance";
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

const TopUpSchema = z.object({
  amount: z.number().int().min(10_000, "Top-ups start at Rp 10,000"),
  method: z.enum(TOPUP_METHODS, { message: "Pick a top-up method" }),
});

export async function topUpBalanceAction(
  _prev: ActionState<{ available: number }> | undefined,
  formData: FormData
): Promise<ActionState<{ available: number }>> {
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
    const result = await withdrawBalance({ amount: parsed.data.amount, accountId: parsed.data.accountId });
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
