import { cn } from "@/lib/utils";
import { LINK_STATUS_LABELS, type LinkStatus } from "@/lib/link-status";

// Link status — open can still be paid, paid settled it, expired/cancelled
// are closed. Same colour language as the movement and transaction pills.
const STYLES: Record<LinkStatus, string> = {
  OPEN: "bg-[var(--pending-status)]/10 text-[var(--pending-status)] border-[var(--pending-status)]/20",
  PAID: "bg-[var(--success-status)]/10 text-[var(--success-status)] border-[var(--success-status)]/20",
  EXPIRED: "bg-[var(--surface-container-high)] text-[var(--on-surface-variant)] border-[var(--outline-variant)]",
  CANCELLED: "bg-[var(--failed-status)]/10 text-[var(--failed-status)] border-[var(--failed-status)]/20",
};

export function LinkStatusPill({ status, className }: { status: LinkStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STYLES[status],
        className
      )}
    >
      {LINK_STATUS_LABELS[status]}
    </span>
  );
}
