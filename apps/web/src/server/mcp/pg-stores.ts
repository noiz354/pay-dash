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

export async function getBalanceOverviewPostgres() {
  const rows = await prisma.ledgerEntry.findMany({ select: { amount: true, status: true, currency: true } });
  const amounts = rows.map((row) => (typeof row.amount === "number" ? row.amount : row.amount.toNumber()));
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const byStatus = rows.reduce<Record<string, number>>((acc, row, index) => {
    const status = LedgerStatus.safeParse(row.status).success ? (row.status as string) : "PENDING";
    acc[status] = (acc[status] ?? 0) + (amounts[index] ?? 0);
    return acc;
  }, {});
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