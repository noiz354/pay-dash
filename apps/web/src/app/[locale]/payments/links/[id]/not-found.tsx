import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

export default function PaymentLinkNotFound() {
  return (
    <main className="mx-auto w-full max-w-container-max p-gutter">
      <EmptyState
        icon="link_off"
        title="Payment link not found"
        description="This link doesn't exist — it may have been created in another environment (live vs. test mode), or the URL is wrong."
        action={
          <div className="flex gap-2">
            <Link href="/payments/links">
              <Button className="bg-[var(--primary)] text-[var(--on-primary)]">Back to links</Button>
            </Link>
            <Link href="/payments/links?new=1">
              <Button variant="outline" className="border-[var(--border-subtle)]">
                Create a link
              </Button>
            </Link>
          </div>
        }
      />
    </main>
  );
}
