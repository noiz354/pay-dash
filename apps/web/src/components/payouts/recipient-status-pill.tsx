import * as React from "react";
import type { RecipientStatus } from "@/lib/payout-status";
import { cn } from "@/lib/utils";

const TONES: Record<RecipientStatus, string> = {
  PENDING: "bg-[var(--pending-status)]/10 text-[var(--pending-status)]",
  PAID: "bg-[var(--status-success-bg)] text-[var(--success-status)]",
  FAILED: "bg-[var(--status-error-bg)] text-[var(--failed-status)]",
  RETURNED: "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]",
};

const LABELS: Record<RecipientStatus, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  RETURNED: "Returned",
};

export function RecipientStatusPill({ status, className }: { status: RecipientStatus; className?: string }) {
  return (
    <span className={cn("label-caps inline-flex rounded-full px-2 py-0.5 whitespace-nowrap", TONES[status], className)}>
      {LABELS[status]}
    </span>
  );
}
