import { z } from "zod";

/**
 * Canonical provider read DTOs (provider-read). These are the normalized shapes
 * the adapters must return for read capabilities (balance read / transaction
 * read) and the shape the UI/declarative renderers consume. SDK models and raw
 * provider payloads must never cross this boundary. Provider → UI mapping lives
 * here so an adapter can surface live data without leaking a provider model.
 */

export interface ProviderBalance {
  available: number;
  currency: string;
  source: "xendit-live" | "stripe-live" | "provider";
  asOf: string;
}

export type ProviderTransactionStatus = "SUCCEEDED" | "PROCESSING" | "PENDING" | "FAILED" | "REFUNDED";

export interface ProviderTransaction {
  id: string;
  referenceId: string;
  at: string;
  amount: number;
  currency: string;
  status: ProviderTransactionStatus;
  channel: string;
  methodLabel: string;
  customerName: string | null;
  customerEmail: string | null;
  description: string | null;
  fee: number | null;
  net: number | null;
  source: "xendit-live" | "stripe-live" | "provider";
}

/** Signal returned by the read service when no provider connection is resolved. */
export const PROVIDER_READ_UNAVAILABLE = Symbol("provider-read-unavailable");

export type ProviderReadResult<T> = { connected: true; data: T } | { connected: false };

/** Map an arbitrary provider status string to a conservative canonical status. */
export function canonicalTransactionStatus(raw: unknown): ProviderTransactionStatus {
  const s = String(raw ?? "").toUpperCase();
  if (["SUCCEEDED", "PAID", "COMPLETED", "CAPTURED", "SETTLED"].includes(s)) return "SUCCEEDED";
  if (["FAILED", "CANCELED", "CANCELLED", "VOID"].includes(s)) return "FAILED";
  if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(s)) return "REFUNDED";
  if (["PENDING", "PROCESSING", "UNPAID", "AUTHORIZED"].includes(s)) return "PROCESSING";
  return "PENDING";
}

/** Coerce a provider amount (minor units) to a signed integer in main units. */
export function amountFromMinor(minor: number | string, currency?: string): { amount: number; currency: string } {
  const val = typeof minor === "string" ? Number(minor) : minor;
  // Stripe/Xendit SDKs typically return integer minor units.
  const amount = Number.isFinite(val) ? Math.round(Math.abs(val)) : 0;
  return { amount, currency: currency ?? "IDR" };
}

export function isProviderReadUnavailable(value: unknown): value is typeof PROVIDER_READ_UNAVAILABLE {
  return value === PROVIDER_READ_UNAVAILABLE;
}

export const ProviderTransactionSchema = z.object({
  id: z.string().min(1),
  referenceId: z.string().min(1),
  at: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: z.enum(["SUCCEEDED", "PROCESSING", "PENDING", "FAILED", "REFUNDED"]),
  channel: z.string(),
  methodLabel: z.string(),
  customerName: z.string().nullable(),
  customerEmail: z.string().nullable(),
  description: z.string().nullable(),
  fee: z.number().nullable(),
  net: z.number().nullable(),
  source: z.enum(["xendit-live", "stripe-live", "provider"]),
});
export type ProviderTransactionInput = z.infer<typeof ProviderTransactionSchema>;

export function parseProviderTransaction(value: unknown): ProviderTransaction {
  return ProviderTransactionSchema.parse(value);
}
