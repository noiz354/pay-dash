import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

/**
 * Billing has three distinct voids and each gets a job:
 *  - `no-data`    → no invoices have ever been issued;
 *  - `no-match`   → filters hid everything;
 *  - `no-outstanding` → nothing to pay (a *good* state, phrased as one).
 */
export function InvoicesEmptyState({
  variant = "no-data",
  action,
  className,
}: {
  variant?: "no-data" | "no-match" | "no-outstanding";
  action?: React.ReactNode;
  className?: string;
}) {
  if (variant === "no-match") {
    return (
      <EmptyState
        className={className}
        icon="filter_alt_off"
        title="No invoices match these filters"
        description="Try a wider date range, or clear the status filter to see every statement."
        action={
          action ?? (
            <Link href="/billing">
              <Button variant="outline" className="border-[var(--border-subtle)]">
                Clear filters
              </Button>
            </Link>
          )
        }
      />
    );
  }

  if (variant === "no-outstanding") {
    return (
      <EmptyState
        className={className}
        icon="task_alt"
        title="No outstanding invoices"
        description="Everything is settled. The next statement is generated at the start of the month."
        action={action}
      />
    );
  }

  return (
    <EmptyState
      className={className}
      icon="receipt_long"
      title="No invoices yet"
      description="Platform fees accrue as you process payments; the first statement is issued after your first full month."
      action={action}
    />
  );
}
