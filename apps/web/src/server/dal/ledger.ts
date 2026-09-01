import "server-only";

import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

// Reusable DAL for ledger — maps to screens/mobile/transaction_ledger + desktop/transaction_ledger_desktop
// Observability IDs: trace every payment with user_id, org_id, reference_id (docs/ARCHITECTURE.md:42)

export const LedgerEntrySchema = z.object({
  userId: z.string().cuid().optional().nullable(),
  amount: z.number().positive(),
  currency: z.string().default("IDR"),
  status: z.enum(["PENDING", "SUCCEEDED", "FAILED"]).default("PENDING"),
  referenceId: z.string().optional().nullable(),
  xenditPaymentId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

export type LedgerEntryInput = z.infer<typeof LedgerEntrySchema>;

export async function createLedgerEntry(input: LedgerEntryInput) {
  const data = LedgerEntrySchema.parse(input);
  return prisma.ledgerEntry.create({
    data: {
      userId: data.userId ?? undefined,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      referenceId: data.referenceId ?? undefined,
      xenditPaymentId: data.xenditPaymentId ?? undefined,
      description: data.description ?? undefined,
    },
  });
}

export async function listLedgerEntries(opts: { userId?: string; take?: number } = {}) {
  const userId = opts.userId ? z.string().cuid().parse(opts.userId) : undefined;
  const take = z.number().min(1).max(100).default(20).parse(opts.take);
  return prisma.ledgerEntry.findMany({
    where: userId ? { userId } : undefined,
    take,
    orderBy: { createdAt: "desc" },
  });
}

export async function getLedgerEntryByReferenceId(referenceId: string) {
  const ref = z.string().min(1).parse(referenceId);
  return prisma.ledgerEntry.findFirst({ where: { referenceId: ref } });
}
