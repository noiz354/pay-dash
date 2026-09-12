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

function mapLedgerRow(row: {
  id: string;
  amount: { toNumber(): number } | number;
  currency: string;
  status: string;
  referenceId: string | null;
  xenditPaymentId: string | null;
  description: string | null;
  userId: string | null;
  createdAt: Date;
}) {
  const status = LedgerStatus.safeParse(row.status).success ? (row.status as "PENDING" | "SUCCEEDED" | "FAILED") : "PENDING";
  const amount = typeof row.amount === "number" ? row.amount : row.amount.toNumber();
  return {
    id: row.id,
    referenceId: row.referenceId ?? row.id,
    amount,
    currency: row.currency,
    status,
    xenditPaymentId: row.xenditPaymentId,
    description: row.description,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listTransactionsPostgres(opts: { page?: number; pageSize?: number } = {}) {
  const take = Math.min(Math.max(opts.pageSize ?? 20, 1), 200);
  const skip = Math.max(opts.page ?? 1, 1);
  const rows = await prisma.ledgerEntry.findMany({
    orderBy: { createdAt: "desc" },
    take,
    skip: (skip - 1) * take,
  });
  return { items: rows.map(mapLedgerRow), page: skip, pageSize: take, total: rows.length, source: "postgres" };
}

export async function getTransactionPostgres(id: string) {
  const row = await prisma.ledgerEntry.findUnique({ where: { id } });
  if (!row) return null;
  return { ...mapLedgerRow(row), source: "postgres" };
}

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