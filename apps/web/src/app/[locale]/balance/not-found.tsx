import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

export default function BalanceNotFound() {
  return (
    <main className="mx-auto max-w-container-max p-gutter">
      <EmptyState
        icon="account_balance_wallet"
        title="That balance page doesn't exist"
        description="The balance lives at /balance — movements, top-ups and withdrawals included."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/balance">
              <Button className="bg-[var(--primary)] text-[var(--on-primary)]">Balance & History</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" className="border-[var(--border-subtle)]">
                Dashboard
              </Button>
            </Link>
          </div>
        }
      />
    </main>
  );
}
