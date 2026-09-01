import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

export default function InvoiceNotFound() {
  return (
    <main className="mx-auto max-w-container-max p-gutter">
      <EmptyState
        icon="receipt_long"
        title="Invoice not found"
        description="This invoice ID doesn't exist, or the statement belongs to a different environment (live vs. test mode)."
        action={
          <div className="flex gap-2">
            <Link href="/billing">
              <Button className="bg-[var(--primary)] text-[var(--on-primary)]">Back to billing</Button>
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
