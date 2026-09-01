import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

export default function CustomersNotFound() {
  return (
    <main className="mx-auto w-full max-w-[var(--container-max)] p-[var(--gutter)]">
      <EmptyState
        icon="person_search"
        title="Customer not found"
        description="This customer id doesn't exist, or it belongs to a different environment (live vs. test mode)."
        action={
          <div className="flex gap-2">
            <Link href="/customers">
              <Button className="bg-[var(--primary)] text-[var(--on-primary)]">Back to customers</Button>
            </Link>
            <Link href="/customers?new=1">
              <Button variant="outline" className="border-[var(--border-subtle)]">
                Add customer
              </Button>
            </Link>
          </div>
        }
      />
    </main>
  );
}
