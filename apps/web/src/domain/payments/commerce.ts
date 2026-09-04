import { z } from "zod";

/**
 * Canonical commerce DTOs (customer vault / billing / recurring). Normalized
 * shapes the adapters return; SDK models and raw provider payloads must never
 * cross this boundary. Provider → UI mapping lives here.
 */

export interface ProviderCustomer {
  id: string;
  provider: "xendit" | "stripe";
  referenceId: string;
  status: "NEW" | "VERIFIED" | "ARCHIVED";
}

export interface ProviderRecurringPlan {
  id: string;
  provider: "xendit" | "stripe";
  planName: string;
  currency: string;
  interval: "monthly" | "yearly";
  amountMinor: number;
  status: "ACTIVE" | "DRAFT" | "FAILED";
}

export interface ProviderInvoice {
  id: string;
  provider: "xendit" | "stripe";
  checkoutUrl: string | null;
  status: string;
  amountMinor: number;
  currency: string;
}

export const ProviderCustomerSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(["xendit", "stripe"]),
  referenceId: z.string().min(1),
  status: z.enum(["NEW", "VERIFIED", "ARCHIVED"]),
});
export type ProviderCustomerInput = z.infer<typeof ProviderCustomerSchema>;

export const ProviderRecurringPlanSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(["xendit", "stripe"]),
  planName: z.string(),
  currency: z.string(),
  interval: z.enum(["monthly", "yearly"]),
  amountMinor: z.number(),
  status: z.enum(["ACTIVE", "DRAFT", "FAILED"]),
});
export type ProviderRecurringPlanInput = z.infer<typeof ProviderRecurringPlanSchema>;

export const ProviderInvoiceSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(["xendit", "stripe"]),
  checkoutUrl: z.string().nullable(),
  status: z.string(),
  amountMinor: z.number(),
  currency: z.string(),
});
export type ProviderInvoiceInput = z.infer<typeof ProviderInvoiceSchema>;
