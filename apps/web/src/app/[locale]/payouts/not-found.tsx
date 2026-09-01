import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

export default function PayoutsNotFound() {
  return (
    <main className="mx-auto max-w-container-max p-gutter">
      <EmptyState
        icon="payments"
        title="That payouts page doesn't exist"
        description="Try the payout history, the bulk upload workspace, or the payout schedule."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/payouts">
              <Button className="bg-[var(--primary)] text-[var(--on-primary)]">Payout history</Button>
            </Link>
            <Link href="/payouts/bulk">
              <Button variant="outline" className="border-[var(--border-subtle)]">Bulk upload</Button>
            </Link>
            <Link href="/payouts/settings">
              <Button variant="outline" className="border-[var(--border-subtle)]">Payout settings</Button>
            </Link>
          </div>
        }
      />
    </main>
  );
}
