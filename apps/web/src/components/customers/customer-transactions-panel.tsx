import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { getCustomerTransactions } from "@/server/data/customers";

// A customer's payment history, reusing the ledger table so a row here behaves
// exactly like a row on /transactions (click → /transactions/[id]).
export async function CustomerTransactionsPanel({ email, limit = 5 }: { email: string; limit?: number }) {
  const rows = await getCustomerTransactions(email);
  const visible = rows.slice(0, limit);

  return (
    <section className="space-y-3" aria-label="Recent payments">
      <div className="flex items-center justify-between">
        <h2 className="headline-md text-[var(--on-surface)]">Recent payments</h2>
        {rows.length > limit ? (
          <Link href={`/transactions?q=${encodeURIComponent(email)}`}>
            <Button variant="ghost" size="sm" className="text-[var(--primary)]">
              View all {rows.length}
            </Button>
          </Link>
        ) : null}
      </div>
      <TransactionsTable rows={visible} variant="compact" />
    </section>
  );
}
