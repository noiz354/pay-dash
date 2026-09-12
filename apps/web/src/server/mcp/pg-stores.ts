import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

/**
 * PostgreSQL-backed stores for the core domains. Reads real rows written by
 * Better Auth, the webhook ingress and the payment flows. The dashboard's
 * rich in-memory Transaction shape (channel/customerName/…) has no wave0
 * table yet, so these return the ledger rows that DO exist in Cloud SQL.
 */

const LedgerStatus = z.enum(["PENDING", "SUCCEEDED", "FAILED"]);

/* Wave 7A — `listTransactionsPostgres()` and `getTransactionPostgres()` used to
 * live here. They read `LedgerEntry` with no organization predicate (the table has
 * no `organizationId` column at all), which on a multi-tenant database is a
 * cross-tenant read of the money ledger, exposed through the MCP endpoint that
 * authenticates with one shared bearer token. A function cannot be made safe by
 * asking its callers to remember a `where` clause, so the unscoped pair is
 * deleted and the MCP transaction tools refuse until debt **D-26** lands the
 * column (and RLS). `grep -rn "prisma.ledgerEntry.find" src/server` must stay
 * empty for transaction reads — see `transactions-structural.test.ts` (S-6). */

/**
 * Projected shape of the balance query. Annotated explicitly rather than
 * inferred from the Prisma client so this module typechecks whether or not the
 * generated client is present (CI generates it; a fresh checkout may not) and so
 * the Decimal-or-number union is handled in exactly one place.
 */
type LedgerAmountRow = {
  amount: { toNumber(): number } | number;
  status: string;
  currency: string;
};

function toAmount(value: LedgerAmountRow["amount"]): number {
  return typeof value === "number" ? value : value.toNumber();
}

export async function getBalanceOverviewPostgres() {
  const rows = (await prisma.ledgerEntry.findMany({
    select: { amount: true, status: true, currency: true },
  })) as LedgerAmountRow[];
  const amounts = rows.map((row) => toAmount(row.amount));
  const total = amounts.reduce((sum: number, amount: number) => sum + amount, 0);
  const byStatus = rows.reduce(
    (acc: Record<string, number>, row: LedgerAmountRow, index: number) => {
      const status = LedgerStatus.safeParse(row.status).success ? row.status : "PENDING";
      acc[status] = (acc[status] ?? 0) + (amounts[index] ?? 0);
      return acc;
    },
    {} as Record<string, number>,
  );
  return {
    available: byStatus["SUCCEEDED"] ?? 0,
    pending: byStatus["PENDING"] ?? 0,
    failed: byStatus["FAILED"] ?? 0,
    total,
    currency: rows[0]?.currency ?? "IDR",
    count: rows.length,
    source: "postgres",
  };
}