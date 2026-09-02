import { cn } from "@/lib/utils";
import { MOVEMENT_STATUS_LABELS, type MovementStatus } from "@/lib/balance-status";

// Movement status — settled counts, pending is money in flight, failed moved
// nothing. Same colour language as the transaction and payout pills.
const STYLES: Record<MovementStatus, string> = {
  SETTLED: "bg-[var(--success-status)]/10 text-[var(--success-status)] border-[var(--success-status)]/20",
  PENDING: "bg-[var(--pending-status)]/10 text-[var(--pending-status)] border-[var(--pending-status)]/20",
  FAILED: "bg-[var(--failed-status)]/10 text-[var(--failed-status)] border-[var(--failed-status)]/20",
};

export function MovementStatusPill({ status, className }: { status: MovementStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STYLES[status],
        className
      )}
    >
      {MOVEMENT_STATUS_LABELS[status]}
    </span>
  );
}
