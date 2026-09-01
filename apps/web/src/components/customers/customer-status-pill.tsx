import { Badge } from "@/components/ui/badge";
import type { CustomerStatus } from "@/lib/customer-status";

// Same visual language as the prototype's inline pill (Active / Review), now
// covering every status the data layer can return.
const STYLES: Record<CustomerStatus, { label: string; className: string }> = {
  ACTIVE: {
    label: "Active",
    className: "bg-[var(--success-status)]/10 text-[var(--success-status)] hover:bg-[var(--success-status)]/10",
  },
  REVIEW: {
    label: "Review",
    className: "bg-[var(--pending-status)]/10 text-[var(--pending-status)] hover:bg-[var(--pending-status)]/10",
  },
  BLOCKED: {
    label: "Archived",
    className: "bg-[var(--failed-status)]/10 text-[var(--failed-status)] hover:bg-[var(--failed-status)]/10",
  },
  NEW: {
    label: "New",
    className: "bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/10",
  },
};

export function CustomerStatusPill({ status }: { status: CustomerStatus }) {
  const s = STYLES[status] ?? STYLES.NEW;
  return (
    <Badge
      data-status={status}
      className={`rounded-full border-transparent px-2 py-0.5 text-[10px] font-bold label-caps ${s.className}`}
    >
      {s.label}
    </Badge>
  );
}
