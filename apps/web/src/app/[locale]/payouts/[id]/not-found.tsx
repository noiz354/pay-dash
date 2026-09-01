import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

export default function BatchNotFound() {
  return (
    <main className="mx-auto max-w-container-max p-gutter">
      <EmptyState
        icon="payments"
        title="Batch not found"
        description="This batch ID doesn't exist, or it belongs to a different environment (live vs. test mode)."
        action={
          <div className="flex gap-2">
            <Link href="/payouts">
              <Button className="bg-[var(--primary)] text-[var(--on-primary)]">Back to payouts</Button>
            </Link>
            <Link href="/payouts/bulk">
              <Button variant="outline" className="border-[var(--border-subtle)]">
                Create a batch
              </Button>
            </Link>
          </div>
        }
      />
    </main>
  );
}
