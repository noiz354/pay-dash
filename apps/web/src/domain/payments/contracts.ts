import { z } from "zod";
import { MoneySchema } from "./money";
import { DataSourceSchema, ProviderResourceRefSchema } from "./provider";
import { CanonicalStatusSchema } from "./statuses";

const TimestampSchema = z.string().datetime({ offset: true });

export const CanonicalResourceSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  source: DataSourceSchema,
  status: CanonicalStatusSchema,
  version: z.number().int().positive(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const ProviderProjectionSchema = z.object({
  origin: ProviderResourceRefSchema,
  providerStatus: z.string().min(1),
  providerUpdatedAt: TimestampSchema.nullable(),
  lastSyncedAt: TimestampSchema,
});

export const CanonicalPaymentSchema = CanonicalResourceSchema.extend({
  merchantReference: z.string().min(1),
  money: MoneySchema,
  provider: ProviderProjectionSchema,
});

export type CanonicalResource = z.infer<typeof CanonicalResourceSchema>;
export type ProviderProjection = z.infer<typeof ProviderProjectionSchema>;
export type CanonicalPayment = z.infer<typeof CanonicalPaymentSchema>;

export function assertOriginalProvider(
  expected: ProviderProjection["origin"],
  actual: ProviderProjection["origin"],
): void {
  if (expected.connectionId !== actual.connectionId || expected.provider !== actual.provider || expected.mode !== actual.mode) {
    throw new Error("Follow-up operations must use the resource's originating provider connection");
  }
}
