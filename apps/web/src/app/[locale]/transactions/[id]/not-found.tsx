import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

export default function TransactionNotFound() {
  return (
    <main className="mx-auto w-full max-w-container-max p-gutter">
      <EmptyState
        icon="search_off"
        title="Transaction not found"
        description="This reference doesn't exist, or it belongs to a different environment (live vs. test mode)."
        action={
          <div className="flex gap-2">
            <Link href="/transactions">
              <Button className="bg-[var(--primary)] text-[var(--on-primary)]">Back to ledger</Button>
            </Link>
            <Link href="/support">
              <Button variant="outline" className="border-[var(--border-subtle)]">
                Contact support
              </Button>
            </Link>
          </div>
        }
      />
    </main>
  );
}
