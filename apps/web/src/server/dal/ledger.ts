import "server-only";

import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

// Reusable DAL for ledger — maps to screens/mobile/transaction_ledger + desktop/transaction_ledger_desktop
// Observability IDs: trace every payment with user_id, org_id, reference_id (docs/ARCHITECTURE.md:42)
//
// ## Wave 7A — this seam is shut, and that is the whole point
//
// `LedgerEntry` (`prisma/schema.prisma`) carries `userId` and **no
// `organizationId`**. So this module could not scope a query even if every
// function asked for a tenant: `listLedgerEntries()` with no `userId` returned
// the whole table, and `getLedgerEntryByReferenceId(id)` was a pure id-only read
// — the exact IDOR shape Wave 7A exists to remove, sitting in the file the
// dashboard's own ledger module points at as "the production target".
//
// Rather than delete the mapping (a later wave needs it) or leave a
// plausible-looking unscoped read in the tree, every entry point refuses until
// the column and RLS land — debt **D-26**. `transactions-structural.test.ts`
// (S-6) fails if a `prisma.ledgerEntry` transaction read appears without that
// refusal, so the seam cannot be re-opened quietly.

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

/**
 * The guard every reader/writer below runs first. It takes the caller's context
 * so that the signature is already tenant-explicit when D-26 lifts the refusal:
 * the fix is "add the column", not "re-thread every call site".
 */
function requireTenantBoundLedger(ctx: OrganizationContext, operation: string): never {
  const { organizationId } = parseOrganizationContext(ctx);
  throw new Error(
    `server/dal/ledger.ts#${operation} is refused: the LedgerEntry table has no organizationId column, so it cannot be read or written tenant-safely (organization ${organizationId} is known, but unenforceable here). Land debt D-26 (column + composite key + RLS), then re-open this seam. For dashboard reads use server/data/transactions.ts.`,
  );
}

export async function createLedgerEntry(ctx: OrganizationContext, input: LedgerEntryInput) {
  requireTenantBoundLedger(ctx, "createLedgerEntry");
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

export async function listLedgerEntries(ctx: OrganizationContext, opts: { userId?: string; take?: number } = {}) {
  requireTenantBoundLedger(ctx, "listLedgerEntries");
  const userId = opts.userId ? z.string().cuid().parse(opts.userId) : undefined;
  const take = z.number().min(1).max(100).default(20).parse(opts.take);
  return prisma.ledgerEntry.findMany({
    // Note for D-26: `where: { organizationId, ... }` — the organization
    // predicate has to be inside the query, not around it.
    where: userId ? { userId } : undefined,
    take,
    orderBy: { createdAt: "desc" },
  });
}

export async function getLedgerEntryByReferenceId(ctx: OrganizationContext, referenceId: string) {
  requireTenantBoundLedger(ctx, "getLedgerEntryByReferenceId");
  const ref = z.string().min(1).parse(referenceId);
  return prisma.ledgerEntry.findFirst({ where: { referenceId: ref } });
}
