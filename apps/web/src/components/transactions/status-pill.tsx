import { cn } from "@/lib/utils";
import type { TransactionStatus } from "@/server/data/transactions";

// Status pill — single source of truth for ledger status colours so the
// dashboard, ledger table and detail page never drift.
const STATUS_STYLE: Record<TransactionStatus, string> = {
  SUCCEEDED: "bg-[var(--success-status)]/10 text-[var(--success-status)]",
  REFUNDED: "bg-[var(--success-status)]/10 text-[var(--success-status)]",
  PROCESSING: "bg-[var(--pending-status)]/10 text-[var(--pending-status)]",
  PENDING: "bg-[var(--pending-status)]/10 text-[var(--pending-status)]",
  FAILED: "bg-[var(--failed-status)]/10 text-[var(--failed-status)]",
};

const STATUS_LABEL: Record<TransactionStatus, string> = {
  SUCCEEDED: "Succeeded",
  REFUNDED: "Refunded",
  PROCESSING: "Processing",
  PENDING: "Pending",
  FAILED: "Failed",
};

export function StatusPill({
  status,
  className,
}: {
  status: TransactionStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 label-caps font-bold",
        STATUS_STYLE[status],
        className
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function statusLabel(status: TransactionStatus) {
  return STATUS_LABEL[status];
}
