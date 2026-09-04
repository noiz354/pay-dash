import { z } from "zod";

/**
 * Canonical platform DTOs (platform). These are the normalized shapes the
 * adapters return for connected-accounts / transfers / split-routing / KYC
 * verification. SDK models and raw provider payloads must never cross this
 * boundary — provider → UI mapping lives here.
 */

export interface ProviderConnectedAccount {
  id: string;
  provider: "xendit" | "stripe";
  status: "PENDING" | "ACTIVE" | "ACTION_REQUIRED" | "FAILED";
  displayName: string | null;
  requirements: string[];
}

export interface ProviderTransfer {
  id: string;
  provider: "xendit" | "stripe";
  amount: number;
  currency: string;
  status: string;
  destination: string;
}

export interface ProviderSplitRule {
  id: string;
  provider: "xendit" | "stripe";
  name: string;
  currency: string;
  destinations: Array<{ accountId: string; amount: number; percent: number | null }>;
  status: "ACTIVE" | "PENDING" | "FAILED";
}

export type KycVerificationState = "SUBMITTED" | "VERIFIED" | "ACTION_REQUIRED" | "FAILED";

export interface KycVerification {
  state: KycVerificationState;
  provider: "xendit" | "stripe";
  requirements: string[];
  verifiedAt: string | null;
}

export const ConnectedAccountSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(["xendit", "stripe"]),
  status: z.enum(["PENDING", "ACTIVE", "ACTION_REQUIRED", "FAILED"]),
  displayName: z.string().nullable(),
  requirements: z.array(z.string()),
});
export type ConnectedAccountInput = z.infer<typeof ConnectedAccountSchema>;
export function parseConnectedAccount(value: unknown): ProviderConnectedAccount {
  return ConnectedAccountSchema.parse(value);
}

export const TransferSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(["xendit", "stripe"]),
  amount: z.number(),
  currency: z.string(),
  status: z.string(),
  destination: z.string(),
});
export type TransferInput = z.infer<typeof TransferSchema>;

export const SplitRuleSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(["xendit", "stripe"]),
  name: z.string(),
  currency: z.string(),
  destinations: z.array(z.object({ accountId: z.string(), amount: z.number(), percent: z.number().nullable() })),
  status: z.enum(["ACTIVE", "PENDING", "FAILED"]),
});
export type SplitRuleInput = z.infer<typeof SplitRuleSchema>;
