import { cn } from "@/lib/utils";
import { WEBHOOK_STATUS_LABELS, type WebhookStatus } from "@/lib/webhook-status";

// Callback outcome — received was accepted and stored, duplicated was the
// provider's retried no-op, rejected was refused at the endpoint. Same colour
// language as the movement and transaction pills.
const STYLES: Record<WebhookStatus, string> = {
  RECEIVED: "bg-[var(--success-status)]/10 text-[var(--success-status)] border-[var(--success-status)]/20",
  DUPLICATED: "bg-[var(--pending-status)]/10 text-[var(--pending-status)] border-[var(--pending-status)]/20",
  REJECTED: "bg-[var(--failed-status)]/10 text-[var(--failed-status)] border-[var(--failed-status)]/20",
};

export function WebhookStatusPill({ status, className }: { status: WebhookStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STYLES[status],
        className
      )}
    >
      {WEBHOOK_STATUS_LABELS[status]}
    </span>
  );
}
