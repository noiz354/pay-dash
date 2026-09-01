import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

/**
 * Customer-specific empty states.
 * Two distinct voids, two distinct jobs:
 *  - `no-data`   → the directory is genuinely empty; offer the create path.
 *  - `no-match`  → filters hid everything; offer the escape hatch.
 *  - `no-payments` → a real customer with no ledger rows yet.
 */
export function CustomerEmptyState({
  variant = "no-data",
  action,
  className,
}: {
  variant?: "no-data" | "no-match" | "no-payments";
  action?: React.ReactNode;
  className?: string;
}) {
  if (variant === "no-match") {
    return (
      <EmptyState
        className={className}
        icon="person_search"
        title="No customers match these filters"
        description="Try a different search term, or clear the status filter to see everyone."
        action={
          action ?? (
            <Link href="/customers">
              <Button variant="outline" className="border-[var(--border-subtle)]">
                Clear filters
              </Button>
            </Link>
          )
        }
      />
    );
  }

  if (variant === "no-payments") {
    return (
      <EmptyState
        className={className}
        icon="receipt_long"
        title="No payments yet"
        description="This customer hasn't been charged. Create a payment to start their history."
        action={action}
      />
    );
  }

  return (
    <EmptyState
      className={className}
      icon="group"
      title="No customers yet"
      description="Customers appear automatically after their first payment — or add one manually."
      action={action}
    />
  );
}
