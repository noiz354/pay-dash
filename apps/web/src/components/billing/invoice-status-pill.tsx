import { INVOICE_STATUS_ICONS, INVOICE_STATUS_LABELS, type InvoiceStatus } from "@/lib/invoice-status";

// The prototype's inline badge, extended to every status the data layer can
// produce (DRAFT = period still accruing) and reusable on the detail page.
const STYLES: Record<InvoiceStatus, string> = {
  PAID: "bg-[var(--success-status)]/10 text-[var(--success-status)]",
  PENDING: "bg-[var(--pending-status)]/10 text-[var(--pending-status)]",
  OVERDUE: "bg-[var(--failed-status)]/10 text-[var(--failed-status)]",
  DRAFT: "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]",
};

export function InvoiceStatusPill({ status, className = "" }: { status: InvoiceStatus; className?: string }) {
  return (
    <span
      data-status={status}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${STYLES[status]} ${className}`}
    >
      <span className="material-symbols-outlined text-[12px]" aria-hidden="true" data-weight="fill">
        {INVOICE_STATUS_ICONS[status]}
      </span>
      {INVOICE_STATUS_LABELS[status]}
    </span>
  );
}
