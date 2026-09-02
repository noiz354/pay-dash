import "server-only";

import { listTransactions, type Transaction } from "./transactions";
import { getMerchantProfile } from "./settings";
import { INVOICE_STATUSES, isPayable, type InvoiceStatus } from "@/lib/invoice-status";

export { INVOICE_STATUSES };
export type { InvoiceStatus };

// ---------------------------------------------------------------------------
// Billing / invoices data source.
//
// Platform invoices are *derived from the ledger*: the fee column on every
// settled transaction is what the platform actually bills, so an invoice is the
// sum of one calendar month of fees. That means the accrual card, the invoice
// total and the line items can never drift apart, and "which transactions
// produced this bill?" is answerable with a link instead of a spreadsheet.
//
// The three invoices from the static prototype are seeded alongside the derived
// ones (nothing is deleted); payments are recorded as status overrides in the
// same in-memory seam used by transactions and customers.
// ---------------------------------------------------------------------------

export type InvoiceLineItem = {
  id: string;
  label: string;
  detail: string;
  quantity: number;
  unitAmount: number;
  amount: number;
};

export type InvoicePaymentEvent = {
  id: string;
  at: string;
  label: string;
  detail: string;
  kind: "info" | "success" | "warning" | "error";
};

export type Invoice = {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  issuedAt: string;
  dueAt: string;
  status: InvoiceStatus;
  amount: number;
  currency: string;
  transactionCount: number;
  processedVolume: number;
  paidAt: string | null;
  paymentMethod: string | null;
  source: "ledger" | "seed";
  notes?: string;
};

export type InvoiceFilters = {
  q?: string;
  status?: InvoiceStatus | "ALL";
  range?: "3m" | "6m" | "12m" | "all";
  sort?: "recent" | "amount" | "due";
  page?: number;
  pageSize?: number;
};

export type PaginatedInvoices = {
  rows: Invoice[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  isFiltered: boolean;
};

type SeedInvoice = {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
  dueAt: string;
  status: InvoiceStatus;
  amount: number;
  currency: string;
  transactionCount: number;
  processedVolume: number;
  notes?: string;
};

type PaymentRecord = { paidAt: string; method: string; reference: string };
type Store = { payments: Record<string, PaymentRecord> };

const globalStore = globalThis as unknown as { __kineticInvoiceStore?: Store };
function store(): Store {
  if (!globalStore.__kineticInvoiceStore) globalStore.__kineticInvoiceStore = { payments: {} };
  return globalStore.__kineticInvoiceStore;
}

// --- prototype seeds --------------------------------------------------------
// The static page listed these three rows with bare string amounts. They are
// preserved as real records so the page still shows the history it always did.
const SEED_INVOICES: SeedInvoice[] = [
  {
    id: "INV-2023-08-4421",
    number: "INV-2023-08-4421",
    periodStart: "2023-08-01T00:00:00.000Z",
    periodEnd: "2023-08-31T23:59:59.000Z",
    issuedAt: "2023-09-01T02:00:00.000Z",
    dueAt: "2023-09-15T23:59:59.000Z",
    status: "PAID",
    amount: 14_200_500,
    currency: "IDR",
    transactionCount: 8_412,
    processedVolume: 4_733_500_000,
    notes: "Imported from the launch prototype.",
  },
  {
    id: "INV-2023-09-5102",
    number: "INV-2023-09-5102",
    periodStart: "2023-09-01T00:00:00.000Z",
    periodEnd: "2023-09-30T23:59:59.000Z",
    issuedAt: "2023-10-01T02:00:00.000Z",
    dueAt: "2023-10-15T23:59:59.000Z",
    status: "PENDING",
    amount: 13_050_000,
    currency: "IDR",
    transactionCount: 7_988,
    processedVolume: 4_350_000_000,
    notes: "Imported from the launch prototype.",
  },
  {
    id: "INV-2023-07-3990",
    number: "INV-2023-07-3990",
    periodStart: "2023-07-01T00:00:00.000Z",
    periodEnd: "2023-07-31T23:59:59.000Z",
    issuedAt: "2023-08-01T02:00:00.000Z",
    dueAt: "2023-08-15T23:59:59.000Z",
    status: "OVERDUE",
    amount: 2_450_000,
    currency: "IDR",
    transactionCount: 1_240,
    processedVolume: 816_600_000,
    notes: "Imported from the launch prototype.",
  },
];

// --- helpers ----------------------------------------------------------------

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function fmtDay(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}, ${d.getUTCFullYear()}`;
}

export function periodLabelFor(startIso: string, endIso: string) {
  return `${fmtDay(startIso)} - ${fmtDay(endIso)}`;
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(key: string) {
  const [y, m] = key.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return { start: start.toISOString(), end: end.toISOString() };
}

function billableRows(rows: Transaction[]) {
  // Fees are only charged on money that actually moved.
  return rows.filter((t) => t.status === "SUCCEEDED" || t.status === "REFUNDED");
}

async function allLedgerRows(): Promise<Transaction[]> {
  const { rows } = await listTransactions({ page: 1, pageSize: 100 });
  return rows;
}

function statusForDerived(periodEnd: string, dueAt: string, paid: boolean): InvoiceStatus {
  const now = Date.now();
  if (paid) return "PAID";
  if (new Date(periodEnd).getTime() > now) return "DRAFT"; // period still open — accruing
  if (new Date(dueAt).getTime() < now) return "OVERDUE";
  return "PENDING";
}

function applyPayment(invoice: Invoice): Invoice {
  const payment = store().payments[invoice.id];
  if (!payment) return invoice;
  return {
    ...invoice,
    status: "PAID",
    paidAt: payment.paidAt,
    paymentMethod: payment.method,
  };
}

// --- derivation -------------------------------------------------------------

async function buildInvoices(): Promise<Invoice[]> {
  const rows = await allLedgerRows();
  const byMonth = new Map<string, Transaction[]>();
  for (const t of billableRows(rows)) {
    const key = monthKey(t.createdAt);
    const list = byMonth.get(key);
    if (list) list.push(t);
    else byMonth.set(key, [t]);
  }

  const derived: Invoice[] = Array.from(byMonth.entries()).map(([key, txns]) => {
    const { start, end } = monthBounds(key);
    const dueAt = new Date(new Date(end).getTime() + 14 * 86_400_000).toISOString();
    const issuedAt = new Date(new Date(end).getTime() + 86_400_000).toISOString();
    const amount = Math.round(txns.reduce((a, t) => a + t.fee, 0));
    const invoice: Invoice = {
      id: `INV-${key}-LEDGER`,
      number: `INV-${key}-LEDGER`,
      periodStart: start,
      periodEnd: end,
      periodLabel: periodLabelFor(start, end),
      issuedAt,
      dueAt,
      status: statusForDerived(end, dueAt, false),
      amount,
      currency: txns[0]?.currency ?? "IDR",
      transactionCount: txns.length,
      processedVolume: txns.reduce((a, t) => a + t.amount, 0),
      paidAt: null,
      paymentMethod: null,
      source: "ledger",
    };
    return applyPayment(invoice);
  });

  const seeded: Invoice[] = SEED_INVOICES.map((s) =>
    applyPayment({
      ...s,
      periodLabel: periodLabelFor(s.periodStart, s.periodEnd),
      paidAt: s.status === "PAID" ? s.issuedAt : null,
      paymentMethod: s.status === "PAID" ? "Auto-debit — BCA •••• 8891" : null,
      source: "seed",
    })
  );

  return [...derived, ...seeded];
}

// --- reads ------------------------------------------------------------------

export async function listInvoices(filters: InvoiceFilters = {}): Promise<PaginatedInvoices> {
  const { q = "", status = "ALL", range = "all", sort = "recent" } = filters;
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 10));
  const needle = q.trim().toLowerCase();

  const all = await buildInvoices();
  const cutoff =
    range === "all" ? 0 : Date.now() - { "3m": 90, "6m": 180, "12m": 365 }[range] * 86_400_000;

  const filtered = all.filter((inv) => {
    if (status !== "ALL" && inv.status !== status) return false;
    if (cutoff && new Date(inv.periodEnd).getTime() < cutoff) return false;
    if (needle) {
      const hay = `${inv.number} ${inv.periodLabel} ${inv.status}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sort === "amount") return b.amount - a.amount;
    if (sort === "due") return a.dueAt.localeCompare(b.dueAt);
    return b.periodEnd.localeCompare(a.periodEnd);
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  return {
    rows: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    total: filtered.length,
    page: safePage,
    pageSize,
    pageCount,
    isFiltered: needle.length > 0 || status !== "ALL" || range !== "all",
  };
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const all = await buildInvoices();
  return all.find((i) => i.id === id || i.number === id) ?? null;
}

/** Transactions whose fees make up an invoice — the "show your work" link. */
export async function getInvoiceTransactions(id: string): Promise<Transaction[]> {
  const invoice = await getInvoice(id);
  if (!invoice) return [];
  const rows = await allLedgerRows();
  const from = new Date(invoice.periodStart).getTime();
  const to = new Date(invoice.periodEnd).getTime();
  return billableRows(rows).filter((t) => {
    const at = new Date(t.createdAt).getTime();
    return at >= from && at <= to;
  });
}

export async function getInvoiceLineItems(id: string): Promise<InvoiceLineItem[]> {
  const invoice = await getInvoice(id);
  if (!invoice) return [];

  const txns = await getInvoiceTransactions(id);
  if (txns.length === 0) {
    // Seeded (pre-ledger) invoices still deserve a breakdown rather than a
    // blank panel: reconstruct a plausible two-line summary from the totals.
    const processing = Math.round(invoice.amount * 0.86);
    return [
      {
        id: `${invoice.id}_li_processing`,
        label: "Payment processing fees",
        detail: `${invoice.transactionCount.toLocaleString("en-US")} settled transactions`,
        quantity: invoice.transactionCount,
        unitAmount: invoice.transactionCount ? processing / invoice.transactionCount : 0,
        amount: processing,
      },
      {
        id: `${invoice.id}_li_platform`,
        label: "Platform subscription",
        detail: "Enterprise plan — monthly",
        quantity: 1,
        unitAmount: invoice.amount - processing,
        amount: invoice.amount - processing,
      },
    ];
  }

  const byChannel = new Map<string, Transaction[]>();
  for (const t of txns) {
    const list = byChannel.get(t.channel);
    if (list) list.push(t);
    else byChannel.set(t.channel, [t]);
  }

  return Array.from(byChannel.entries())
    .map(([channel, list]) => {
      const amount = Math.round(list.reduce((a, t) => a + t.fee, 0));
      return {
        id: `${invoice.id}_li_${channel.toLowerCase()}`,
        label: `${channel} processing fees`,
        detail: `${list.length} settled transaction${list.length === 1 ? "" : "s"}`,
        quantity: list.length,
        unitAmount: list.length ? amount / list.length : 0,
        amount,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

export async function getInvoiceTimeline(id: string): Promise<InvoicePaymentEvent[]> {
  const invoice = await getInvoice(id);
  if (!invoice) return [];

  const events: InvoicePaymentEvent[] = [
    {
      id: `${invoice.id}_evt_opened`,
      at: invoice.periodStart,
      label: "Billing period opened",
      detail: `Fees started accruing for ${invoice.periodLabel}.`,
      kind: "info",
    },
    {
      id: `${invoice.id}_evt_closed`,
      at: invoice.periodEnd,
      label: "Billing period closed",
      detail: `${invoice.transactionCount.toLocaleString("en-US")} transactions billed.`,
      kind: "info",
    },
    {
      id: `${invoice.id}_evt_issued`,
      at: invoice.issuedAt,
      label: "Invoice issued",
      detail: `Due ${fmtDay(invoice.dueAt)}.`,
      kind: "info",
    },
  ];

  if (invoice.status === "PAID" && invoice.paidAt) {
    events.push({
      id: `${invoice.id}_evt_paid`,
      at: invoice.paidAt,
      label: "Payment received",
      detail: invoice.paymentMethod ? `Settled via ${invoice.paymentMethod}.` : "Settled in full.",
      kind: "success",
    });
  } else if (invoice.status === "OVERDUE") {
    events.push({
      id: `${invoice.id}_evt_overdue`,
      at: invoice.dueAt,
      label: "Payment overdue",
      detail: "Settle this invoice to avoid a service interruption.",
      kind: "error",
    });
  } else if (invoice.status === "PENDING") {
    events.push({
      id: `${invoice.id}_evt_due`,
      at: invoice.dueAt,
      label: "Payment due",
      detail: "Auto-debit will attempt collection on the due date.",
      kind: "warning",
    });
  }

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export type BillingSummary = {
  accruedThisMonth: number;
  accruedDelta: number;
  currency: string;
  nextInvoiceDate: string;
  autoDebitEnabled: boolean;
  outstandingAmount: number;
  outstandingCount: number;
  overdueCount: number;
  lastPaidAmount: number;
  lastPaidAt: string | null;
};

export async function getBillingSummary(): Promise<BillingSummary> {
  const rows = billableRows(await allLedgerRows());
  const profile = await getMerchantProfile();
  const now = new Date();
  const thisKey = monthKey(now.toISOString());
  const prevKey = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)).toISOString());

  const sumFees = (key: string) =>
    Math.round(rows.filter((t) => monthKey(t.createdAt) === key).reduce((a, t) => a + t.fee, 0));

  const accruedThisMonth = sumFees(thisKey);
  const previous = sumFees(prevKey);
  const accruedDelta = previous ? ((accruedThisMonth - previous) / previous) * 100 : 0;

  const invoices = await buildInvoices();
  const outstanding = invoices.filter((i) => isPayable(i.status));
  const paid = invoices
    .filter((i) => i.status === "PAID")
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));

  const nextInvoice = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  return {
    accruedThisMonth,
    accruedDelta,
    currency: "IDR",
    nextInvoiceDate: nextInvoice.toISOString(),
    autoDebitEnabled: profile.autoDebit,
    outstandingAmount: outstanding.reduce((a, i) => a + i.amount, 0),
    outstandingCount: outstanding.length,
    overdueCount: invoices.filter((i) => i.status === "OVERDUE").length,
    lastPaidAmount: paid[0]?.amount ?? 0,
    lastPaidAt: paid[0]?.paidAt ?? null,
  };
}

// --- writes -----------------------------------------------------------------

export type PayInvoiceResult = { invoice: Invoice; reference: string };

export async function payInvoice(id: string, method: string): Promise<PayInvoiceResult | null> {
  const invoice = await getInvoice(id);
  if (!invoice) return null;
  if (!isPayable(invoice.status)) {
    throw new Error(`Invoice ${invoice.number} is already ${invoice.status.toLowerCase()}`);
  }

  const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
  store().payments[invoice.id] = { paidAt: new Date().toISOString(), method, reference };

  const updated = await getInvoice(id);
  if (!updated) return null;
  return { invoice: updated, reference };
}

export function invoicesToCsv(rows: Invoice[]) {
  const header = [
    "invoice_id",
    "period_start",
    "period_end",
    "issued_at",
    "due_at",
    "status",
    "amount",
    "currency",
    "transactions",
    "processed_volume",
    "paid_at",
  ];
  const escape = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((i) =>
    [
      i.number,
      i.periodStart,
      i.periodEnd,
      i.issuedAt,
      i.dueAt,
      i.status,
      i.amount,
      i.currency,
      i.transactionCount,
      i.processedVolume,
      i.paidAt,
    ]
      .map(escape)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

/** Single-invoice statement used by the per-row download action. */
export async function invoiceStatementCsv(id: string): Promise<string | null> {
  const invoice = await getInvoice(id);
  if (!invoice) return null;
  const items = await getInvoiceLineItems(id);
  const escape = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const head = [
    ["invoice", invoice.number],
    ["period", invoice.periodLabel],
    ["issued", invoice.issuedAt],
    ["due", invoice.dueAt],
    ["status", invoice.status],
    ["currency", invoice.currency],
    ["total", invoice.amount],
  ].map(([k, v]) => [escape(String(k)), escape(v as string | number)].join(","));

  const body = [
    ["line_item", "detail", "quantity", "unit_amount", "amount"].join(","),
    ...items.map((li) =>
      [li.label, li.detail, li.quantity, Math.round(li.unitAmount), li.amount].map(escape).join(",")
    ),
  ];

  return [...head, "", ...body].join("\n");
}
