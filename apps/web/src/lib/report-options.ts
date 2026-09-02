// Client-safe report vocabulary + query engine (ADR-0020).
//
// The Custom Reports Builder runs a query over rows the app already owns
// (ledger, payout batches, customers). No SDK round trip: INTEGRATION.md
// (:89/:109) documents the screen as Transaction.getAllTransactions({filters}),
// and the stores export the full row sets, so filtering, projection and CSV
// serialization are pure transforms the client can run.

import { formatDateTime, formatMoney } from "@/lib/format";
import type { Transaction } from "@/server/data/transactions";
import type { PayoutBatch } from "@/server/data/payouts";
import type { Customer } from "@/server/data/customers";

export type ReportSource = "transactions" | "payouts" | "customers";
export type ReportTone = "success" | "pending" | "failed" | "neutral";

export interface ReportColumnDef {
  /** CSV header (snake_case) */
  key: string;
  label: string;
  align: "left" | "right";
  defaultSelected: boolean;
}

export interface ReportStatusOption {
  value: string;
  label: string;
  tone: ReportTone;
}

export interface ReportRow {
  id: string;
  /** Detail-page link for the id cell */
  href?: string;
  /** ISO date used for date-range filtering */
  date: string;
  /** Raw status value (one of the source's options) */
  status: string;
  /** Numeric amount used for amount filtering */
  amount: number;
  /** Per-column values keyed by ReportColumnDef.key */
  values: Record<string, { display: string; raw: string | number }>;
}

export interface ReportDataset {
  source: ReportSource;
  columns: ReportColumnDef[];
  statusOptions: ReportStatusOption[];
  /** Label for the amount filter (currency-free) */
  amountLabel: string;
  rows: ReportRow[];
}

export interface ReportQuery {
  /** yyyy-mm-dd, "" = unbounded */
  from: string;
  to: string;
  /** "" = any */
  status: string;
  amountMin: number | null;
  amountMax: number | null;
}

/* ---------------------------------- vocab --------------------------------- */

const TX_STATUS_TONES: Record<string, ReportTone> = {
  SUCCEEDED: "success",
  PROCESSING: "pending",
  PENDING: "pending",
  FAILED: "failed",
  REFUNDED: "failed",
};

const PAYOUT_STATUS_TONES: Record<string, ReportTone> = {
  DRAFT: "neutral",
  SCHEDULED: "pending",
  PROCESSING: "pending",
  PAID: "success",
  PARTIAL: "pending",
  FAILED: "failed",
  RETURNED: "failed",
};

const CUSTOMER_STATUS_TONES: Record<string, ReportTone> = {
  ACTIVE: "success",
  REVIEW: "pending",
  BLOCKED: "failed",
  NEW: "neutral",
};

const TX_STATUS_LABELS: Record<string, string> = {
  SUCCEEDED: "Succeeded",
  PROCESSING: "Processing",
  PENDING: "Pending",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  PROCESSING: "Processing",
  PAID: "Paid",
  PARTIAL: "Partial",
  FAILED: "Failed",
  RETURNED: "Returned",
};

const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  REVIEW: "Under review",
  BLOCKED: "Blocked",
  NEW: "New",
};

export const TX_STATUS_OPTIONS: ReportStatusOption[] = [
  "SUCCEEDED",
  "PROCESSING",
  "PENDING",
  "FAILED",
  "REFUNDED",
].map((v) => ({ value: v, label: TX_STATUS_LABELS[v], tone: TX_STATUS_TONES[v] }));

export const PAYOUT_STATUS_OPTIONS: ReportStatusOption[] = [
  "DRAFT",
  "SCHEDULED",
  "PROCESSING",
  "PAID",
  "PARTIAL",
  "FAILED",
  "RETURNED",
].map((v) => ({ value: v, label: PAYOUT_STATUS_LABELS[v], tone: PAYOUT_STATUS_TONES[v] }));

export const CUSTOMER_STATUS_OPTIONS: ReportStatusOption[] = [
  "ACTIVE",
  "REVIEW",
  "BLOCKED",
  "NEW",
].map((v) => ({ value: v, label: CUSTOMER_STATUS_LABELS[v], tone: CUSTOMER_STATUS_TONES[v] }));

export function statusLabel(source: ReportSource, status: string): string {
  const map =
    source === "transactions"
      ? TX_STATUS_LABELS
      : source === "payouts"
        ? PAYOUT_STATUS_LABELS
        : CUSTOMER_STATUS_LABELS;
  return map[status] ?? status;
}

export function statusTone(source: ReportSource, status: string): ReportTone {
  const map =
    source === "transactions"
      ? TX_STATUS_TONES
      : source === "payouts"
        ? PAYOUT_STATUS_TONES
        : CUSTOMER_STATUS_TONES;
  return map[status] ?? "neutral";
}

/* --------------------------------- columns -------------------------------- */

export const TX_COLUMNS: ReportColumnDef[] = [
  { key: "reference_id", label: "Transaction ID", align: "left", defaultSelected: true },
  { key: "created_at", label: "Date & Time", align: "left", defaultSelected: true },
  { key: "amount", label: "Amount", align: "right", defaultSelected: true },
  { key: "fee", label: "Fee", align: "right", defaultSelected: false },
  { key: "net", label: "Net", align: "right", defaultSelected: false },
  { key: "status", label: "Status", align: "left", defaultSelected: true },
  { key: "channel", label: "Channel", align: "left", defaultSelected: false },
  { key: "method", label: "Payment Method", align: "left", defaultSelected: false },
  { key: "customer", label: "Customer", align: "left", defaultSelected: false },
  { key: "customer_email", label: "Customer Email", align: "left", defaultSelected: true },
];

export const PAYOUT_COLUMNS: ReportColumnDef[] = [
  { key: "batch", label: "Batch", align: "left", defaultSelected: true },
  { key: "name", label: "Name", align: "left", defaultSelected: true },
  { key: "created_at", label: "Created", align: "left", defaultSelected: true },
  { key: "recipients", label: "Recipients", align: "right", defaultSelected: true },
  { key: "total", label: "Total", align: "right", defaultSelected: true },
  { key: "source", label: "Source", align: "left", defaultSelected: false },
  { key: "status", label: "Status", align: "left", defaultSelected: true },
];

export const CUSTOMER_COLUMNS: ReportColumnDef[] = [
  { key: "name", label: "Name", align: "left", defaultSelected: true },
  { key: "email", label: "Email", align: "left", defaultSelected: true },
  { key: "created_at", label: "Customer Since", align: "left", defaultSelected: true },
  { key: "lifetime_value", label: "Lifetime Value", align: "right", defaultSelected: true },
  { key: "payments", label: "Payments", align: "right", defaultSelected: false },
  { key: "success_rate", label: "Success Rate", align: "right", defaultSelected: false },
  { key: "status", label: "Status", align: "left", defaultSelected: true },
];

/* --------------------------------- mappers -------------------------------- */

export function transactionsToReportRows(txs: Transaction[]): ReportRow[] {
  return txs.map((t) => ({
    id: t.referenceId,
    href: `/transactions/${t.id}`,
    date: t.createdAt,
    status: t.status,
    amount: t.amount,
    values: {
      reference_id: { display: t.referenceId, raw: t.referenceId },
      created_at: { display: formatDateTime(t.createdAt), raw: t.createdAt },
      amount: { display: formatMoney(t.amount, t.currency), raw: t.amount },
      fee: { display: formatMoney(t.fee, t.currency), raw: t.fee },
      net: { display: formatMoney(t.net, t.currency), raw: t.net },
      status: { display: statusLabel("transactions", t.status), raw: t.status },
      channel: { display: t.channel, raw: t.channel },
      method: { display: t.methodLabel, raw: t.methodLabel },
      customer: { display: t.customerName, raw: t.customerName },
      customer_email: { display: t.customerEmail, raw: t.customerEmail },
    },
  }));
}

export function payoutsToReportRows(batches: PayoutBatch[]): ReportRow[] {
  return batches.map((b) => {
    const total = b.recipients.reduce((sum, r) => sum + r.amount, 0);
    return {
      id: b.id,
      href: `/payouts/${b.id}`,
      date: b.createdAt,
      status: b.status,
      amount: total,
      values: {
        batch: { display: b.id, raw: b.id },
        name: { display: b.name, raw: b.name },
        created_at: { display: formatDateTime(b.createdAt), raw: b.createdAt },
        recipients: { display: String(b.recipients.length), raw: b.recipients.length },
        total: { display: formatMoney(total, b.currency), raw: total },
        source: { display: b.source, raw: b.source },
        status: { display: statusLabel("payouts", b.status), raw: b.status },
      },
    };
  });
}

export function customersToReportRows(customers: Customer[]): ReportRow[] {
  return customers.map((c) => ({
    id: c.name,
    href: `/customers/${c.id}`,
    date: c.createdAt,
    status: c.status,
    amount: c.lifetimeValue,
    values: {
      name: { display: c.name, raw: c.name },
      email: { display: c.email, raw: c.email },
      created_at: { display: formatDateTime(c.createdAt), raw: c.createdAt },
      lifetime_value: { display: formatMoney(c.lifetimeValue, c.currency), raw: c.lifetimeValue },
      payments: { display: String(c.paymentCount), raw: c.paymentCount },
      success_rate: { display: `${c.successRate.toFixed(1)}%`, raw: c.successRate },
      status: { display: statusLabel("customers", c.status), raw: c.status },
    },
  }));
}

/* ------------------------------- query engine ------------------------------ */

export function defaultSelection(columns: ReportColumnDef[]): Record<string, boolean> {
  return Object.fromEntries(columns.map((c) => [c.key, c.defaultSelected]));
}

export function columnsFor(
  dataset: Pick<ReportDataset, "columns">,
  selected: Record<string, boolean>
): ReportColumnDef[] {
  return dataset.columns.filter((c) => selected[c.key]);
}

export function runQuery(dataset: ReportDataset, query: ReportQuery): ReportRow[] {
  const fromT = query.from ? Date.parse(`${query.from}T00:00:00Z`) : null;
  const toT = query.to ? Date.parse(`${query.to}T23:59:59.999Z`) : null;
  return dataset.rows.filter((row) => {
    const t = Date.parse(row.date);
    if (fromT !== null && !Number.isNaN(fromT) && t < fromT) return false;
    if (toT !== null && !Number.isNaN(toT) && t > toT) return false;
    if (query.status && row.status !== query.status) return false;
    if (query.amountMin !== null && row.amount < query.amountMin) return false;
    if (query.amountMax !== null && row.amount > query.amountMax) return false;
    return true;
  });
}

export function parseAmountFilter(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/* ----------------------------------- csv ----------------------------------- */

export function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildReportCsv(
  dataset: Pick<ReportDataset, "columns">,
  rows: ReportRow[],
  selected: Record<string, boolean>
): string {
  const cols = columnsFor(dataset, selected);
  const header = cols.map((c) => csvCell(c.key)).join(",");
  const body = rows.map((row) => cols.map((c) => csvCell(row.values[c.key]?.raw ?? "")).join(","));
  return [header, ...body].join("\n");
}
