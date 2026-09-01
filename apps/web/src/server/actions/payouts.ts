"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseRecipientsCsv } from "@/lib/payout-csv";
import { PAYOUT_CADENCES, WEEKDAYS, isValidAccountNumber, parseAmount } from "@/lib/payout-status";
import {
  addBankAccount,
  approveBatch,
  cancelBatch,
  createBatch,
  retryBatchFailures,
  retryRecipient,
  updatePayoutSettings,
} from "@/server/data/payouts";

// Server Actions for the payouts journey. Same serialisable `ActionState`
// contract as transactions / customers / invoices / settings.

export type ActionState<T = undefined> = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
};

function revalidatePayouts(id?: string) {
  revalidatePath("/[locale]/payouts", "page");
  revalidatePath("/payouts");
  revalidatePath("/[locale]/payouts/bulk", "page");
  revalidatePath("/payouts/bulk");
  revalidatePath("/[locale]/payouts/settings", "page");
  if (id) {
    revalidatePath("/[locale]/payouts/[id]", "page");
    revalidatePath(`/payouts/${id}`);
  }
}

function fieldErrorsOf(error: z.ZodError) {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}

// --- create a batch -----------------------------------------------------------

const CreateBatchSchema = z.object({
  name: z.string().trim().min(3, "Give the batch a recognisable name"),
  source: z.enum(["CSV upload", "Manual", "API"]).default("Manual"),
  scheduledFor: z.string().trim().optional(),
  note: z.string().trim().max(200, "Keep the note under 200 characters").optional(),
  csv: z.string().trim().min(1, "Add at least one recipient"),
});

export async function createBatchAction(
  _prev: ActionState<{ id: string; recipients: number; amount: number }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string; recipients: number; amount: number }>> {
  const parsed = CreateBatchSchema.safeParse({
    name: formData.get("name"),
    source: formData.get("source") ?? "Manual",
    scheduledFor: formData.get("scheduledFor") ?? undefined,
    note: formData.get("note") ?? undefined,
    csv: formData.get("csv"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  // Re-parse server-side: the browser preview is a convenience, not a trust boundary.
  const recipients = parseRecipientsCsv(parsed.data.csv);
  if (recipients.valid.length === 0) {
    return {
      status: "error",
      message: "No valid recipients were found in that file.",
      fieldErrors: { csv: ["Every row was rejected — download the template and try again"] },
    };
  }

  const scheduledFor = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor).toISOString() : null;
  const batch = await createBatch({
    name: parsed.data.name,
    source: parsed.data.source,
    scheduledFor,
    note: parsed.data.note,
    recipients: recipients.valid,
  });

  revalidatePayouts(batch.id);
  const skipped = recipients.invalid.length;
  return {
    status: "success",
    message: skipped
      ? `${batch.id} created with ${recipients.valid.length} recipients — ${skipped} row${
          skipped === 1 ? "" : "s"
        } skipped.`
      : `${batch.id} created with ${recipients.valid.length} recipients.`,
    data: { id: batch.id, recipients: recipients.valid.length, amount: recipients.totalAmount },
  };
}

// --- release / cancel / retry --------------------------------------------------

const BatchConfirmSchema = z.object({
  id: z.string().trim().min(1, "Batch id is required"),
  confirm: z.literal("on", { message: "Confirm the total before releasing funds" }),
});

export async function approveBatchAction(
  _prev: ActionState<{ id: string; paid: number; failed: number }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string; paid: number; failed: number }>> {
  const parsed = BatchConfirmSchema.safeParse({ id: formData.get("id"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    return { status: "error", message: "Confirm before releasing funds.", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  try {
    const result = await approveBatch(parsed.data.id);
    if (!result) return { status: "error", message: "That batch no longer exists." };
    revalidatePayouts(result.batch.id);
    return {
      status: "success",
      message: result.failed
        ? `${result.batch.id} sent — ${result.paid} paid, ${result.failed} failed.`
        : `${result.batch.id} sent — ${result.paid} recipients paid.`,
      data: { id: result.batch.id, paid: result.paid, failed: result.failed },
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Release failed." };
  }
}

export async function cancelBatchAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const parsed = BatchConfirmSchema.safeParse({ id: formData.get("id"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    return { status: "error", message: "Confirm before cancelling.", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  try {
    const batch = await cancelBatch(parsed.data.id);
    if (!batch) return { status: "error", message: "That batch no longer exists." };
    revalidatePayouts(batch.id);
    return { status: "success", message: `${batch.id} cancelled — no funds were released.` };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Cancel failed." };
  }
}

export async function retryBatchAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { status: "error", message: "Missing batch id." };
  try {
    const result = await retryBatchFailures(id);
    if (!result) return { status: "error", message: "That batch no longer exists." };
    revalidatePayouts(result.batch.id);
    return {
      status: "success",
      message: `Retried ${result.retried} transfer${result.retried === 1 ? "" : "s"} — ${result.paid} paid, ${
        result.failed
      } still failing.`,
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Retry failed." };
  }
}

export async function retryRecipientAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const batchId = String(formData.get("batchId") ?? "").trim();
  const recipientId = String(formData.get("recipientId") ?? "").trim();
  if (!batchId || !recipientId) return { status: "error", message: "Missing recipient." };
  try {
    const row = await retryRecipient(batchId, recipientId);
    if (!row) return { status: "error", message: "That recipient no longer exists." };
    revalidatePayouts(batchId);
    return {
      status: row.status === "PAID" ? "success" : "error",
      message:
        row.status === "PAID"
          ? `${row.name} paid on retry.`
          : `${row.name} failed again — ${row.failureReason ?? "unknown reason"}.`,
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Retry failed." };
  }
}

// --- schedule settings ---------------------------------------------------------

const ScheduleSchema = z
  .object({
    automated: z.boolean(),
    cadence: z.enum(PAYOUT_CADENCES),
    weekday: z.enum(WEEKDAYS),
    monthDay: z.number().int().min(1, "Pick a day between 1 and 28").max(28, "Pick a day between 1 and 28"),
    minimumAmount: z.number().int().min(0, "Minimum payout cannot be negative"),
    notifyInitiated: z.boolean(),
    notifyCompleted: z.boolean(),
    notifyFailed: z.boolean(),
  })
  .refine((v) => !v.automated || v.cadence !== "manual", {
    message: "Automated payouts need a cadence other than Manual",
    path: ["cadence"],
  });

export async function updatePayoutScheduleAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const rawMinimum = String(formData.get("minimumAmount") ?? "");
  const minimumAmount = parseAmount(rawMinimum);

  const parsed = ScheduleSchema.safeParse({
    automated: formData.get("automated") === "on",
    cadence: formData.get("cadence"),
    weekday: formData.get("weekday"),
    monthDay: Number(formData.get("monthDay") ?? 1),
    minimumAmount: minimumAmount ?? -1,
    notifyInitiated: formData.get("notifyInitiated") === "on",
    notifyCompleted: formData.get("notifyCompleted") === "on",
    notifyFailed: formData.get("notifyFailed") === "on",
  });

  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error);
    if (minimumAmount === null) fieldErrors.minimumAmount = ["Enter an amount, e.g. 50,000"];
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }

  try {
    await updatePayoutSettings(parsed.data);
    revalidatePayouts();
    return { status: "success", message: "Payout schedule saved." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Save failed." };
  }
}

// --- destination account -------------------------------------------------------

export async function setDestinationAccountAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("accountId") ?? "").trim();
  if (!id) return { status: "error", message: "Choose an account." };
  try {
    await updatePayoutSettings({ destinationAccountId: id });
    revalidatePayouts();
    return { status: "success", message: "Destination account updated." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Update failed." };
  }
}

const AddAccountSchema = z.object({
  bank: z.string().trim().min(2, "Bank name is required"),
  holder: z.string().trim().min(2, "Account holder is required"),
  accountNumber: z.string().trim().refine(isValidAccountNumber, "Enter an 8–20 digit account number"),
});

export async function addBankAccountAction(
  _prev: ActionState | undefined,
  formData: FormData
): Promise<ActionState> {
  const parsed = AddAccountSchema.safeParse({
    bank: formData.get("bank"),
    holder: formData.get("holder"),
    accountNumber: formData.get("accountNumber"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  try {
    const account = await addBankAccount(parsed.data);
    revalidatePayouts();
    return {
      status: "success",
      message: `${account.bank} ${account.masked} added — verification takes up to 2 business days.`,
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Could not add that account." };
  }
}
