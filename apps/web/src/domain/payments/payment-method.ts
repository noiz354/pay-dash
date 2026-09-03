import { z } from "zod";

const MaskedCardSchema = z.object({
  kind: z.literal("CARD"),
  brand: z.string().min(1).max(30),
  last4: z.string().regex(/^\d{4}$/),
  expiryMonth: z.number().int().min(1).max(12).optional(),
  expiryYear: z.number().int().min(2000).max(9999).optional(),
}).strict();

const MaskedAccountSchema = z.object({
  kind: z.enum(["BANK_ACCOUNT", "EWALLET"]),
  institution: z.string().min(1).max(100).optional(),
  maskedIdentifier: z.string().min(1).max(40),
}).strict();

export const MaskedPaymentMethodDetailsSchema = z.discriminatedUnion("kind", [
  MaskedCardSchema,
  MaskedAccountSchema,
]);

export type MaskedPaymentMethodDetails = z.infer<typeof MaskedPaymentMethodDetailsSchema>;
