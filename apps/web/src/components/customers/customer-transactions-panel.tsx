import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { getCustomerTransactions } from "@/server/data/customers";
import { resolveCustomerOrganizationContext } from "@/server/services/customer-organization-context";

// A customer's payment history, reusing the ledger table so a row here behaves
// exactly like a row on /transactions (click → /transactions/[id]).
// Wave 7C: resolves its own session tenant so the detail page stays a
// two-line call site; the payment list inherits the caller's tenant.
export async function CustomerTransactionsPanel({ email, limit = 5 }: { email: string; limit?: number }) {
  const { context } = await resolveCustomerOrganizationContext();
  const rows = await getCustomerTransactions(context, email);
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
