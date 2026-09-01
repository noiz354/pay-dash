// Client-safe invoice vocabulary.
// `server/data/invoices.ts` imports "server-only", so anything a client
// component needs at runtime (status lists, labels) lives here instead.
export const INVOICE_STATUSES = ["PAID", "PENDING", "OVERDUE", "DRAFT"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  PAID: "Paid",
  PENDING: "Pending",
  OVERDUE: "Overdue",
  DRAFT: "Draft",
};

/** Material symbol per status — mirrors the prototype's icon column. */
export const INVOICE_STATUS_ICONS: Record<InvoiceStatus, string> = {
  PAID: "check_circle",
  PENDING: "schedule",
  OVERDUE: "warning",
  DRAFT: "edit_note",
};

/** Only these can be paid from the UI. */
export function isPayable(status: InvoiceStatus) {
  return status === "PENDING" || status === "OVERDUE";
}
