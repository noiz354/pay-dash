import * as React from "react";
import { PAYOUT_STATUS_ICONS, PAYOUT_STATUS_LABELS, type PayoutStatus } from "@/lib/payout-status";
import { cn } from "@/lib/utils";

const TONES: Record<PayoutStatus, string> = {
  DRAFT: "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]",
  SCHEDULED: "bg-[var(--primary-container)] text-[var(--on-surface)]",
  PROCESSING: "bg-[var(--pending-status)]/10 text-[var(--pending-status)]",
  PAID: "bg-[var(--status-success-bg)] text-[var(--success-status)]",
  PARTIAL: "bg-[var(--pending-status)]/10 text-[var(--pending-status)]",
  FAILED: "bg-[var(--status-error-bg)] text-[var(--failed-status)]",
  RETURNED: "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]",
};

// One rendering of payout status for the list, the detail header and the
// recipient table, so the vocabulary can never drift between screens.
export function PayoutStatusPill({
  status,
  className,
  showIcon = true,
}: {
  status: PayoutStatus;
  className?: string;
  showIcon?: boolean;
}) {
  return (
    <span
      data-testid={`payout-status-${status}`}
      className={cn(
        "label-caps inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 whitespace-nowrap",
        TONES[status],
        className
      )}
    >
      {showIcon ? (
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
          {PAYOUT_STATUS_ICONS[status]}
        </span>
      ) : null}
      {PAYOUT_STATUS_LABELS[status]}
    </span>
  );
}
