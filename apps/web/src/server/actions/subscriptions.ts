"use server";

import { revalidatePath } from "next/cache";
import { parseAmount } from "@/lib/payout-status";
import { formatMoney } from "@/lib/format";
import { createSubscription, type SubscriptionInterval } from "@/server/data/subscriptions";
import type { ActionState } from "./payouts";

export type { ActionState };

function revalidateSubscriptions() {
  revalidatePath("/[locale]/subscriptions", "page");
  revalidatePath("/subscriptions");
}

// Create a subscription plan (ADR-0021). The plan lands in PENDING_SETUP —
// the store is the app's own record of what the merchant set up.
export async function createSubscriptionAction(
  _prev: ActionState<{ id: string }> | undefined,
  formData: FormData
): Promise<ActionState<{ id: string }>> {
  const customerName = String(formData.get("customerName") ?? "").trim();
  const customerEmail = String(formData.get("customerEmail") ?? "").trim();
  const planName = String(formData.get("planName") ?? "").trim();
  const interval = String(formData.get("interval") ?? "monthly") as SubscriptionInterval;
  const amount = parseAmount(String(formData.get("amount") ?? "")) ?? 0;

  if (customerName.length < 2) return { status: "error", message: "Enter the customer name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) {
    return { status: "error", message: "Enter the customer email." };
  }
  if (planName.length < 2) return { status: "error", message: "Enter a plan name." };
  if (interval !== "monthly" && interval !== "yearly") {
    return { status: "error", message: "Pick a billing interval." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { status: "error", message: "Enter an amount, e.g. 5,000,000" };
  }

  const sub = await createSubscription({ customerName, customerEmail, planName, interval, amount });
  revalidateSubscriptions();
  return {
    status: "success",
    message: `${sub.planName} for ${sub.customerName} created — pending setup (${formatMoney(sub.amount, sub.currency)} ${sub.interval}).`,
    data: { id: sub.id },
  };
}
