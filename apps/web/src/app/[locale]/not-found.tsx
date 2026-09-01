import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

// In-shell 404. The proxy rewrites unmatched bare paths into the locale segment
// so a mistyped URL keeps the app chrome (sidebar, top bar) instead of dropping
// the user onto the bare global error page.
export default function LocaleNotFound() {
  return (
    <main className="mx-auto w-full max-w-[var(--container-max)] p-[var(--gutter)]">
      <EmptyState
        icon="explore_off"
        title="This page doesn't exist"
        description="The link may be out of date, or the feature lives under a different route."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard">
              <Button className="bg-[var(--primary)] text-[var(--on-primary)]">Go to dashboard</Button>
            </Link>
            <Link href="/transactions">
              <Button variant="outline" className="border-[var(--border-subtle)]">
                Transactions
              </Button>
            </Link>
            <Link href="/customers">
              <Button variant="outline" className="border-[var(--border-subtle)]">
                Customers
              </Button>
            </Link>
          </div>
        }
      />
    </main>
  );
}
