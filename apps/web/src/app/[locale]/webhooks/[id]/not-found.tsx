import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

export default function WebhookNotFound() {
  return (
    <main className="mx-auto w-full max-w-container-max p-gutter">
      <EmptyState
        icon="webhook"
        title="Webhook event not found"
        description="This callback row doesn't exist — it may have been created in another environment (live vs. test mode), or the URL is wrong."
        action={
          <div className="flex gap-2">
            <Link href="/webhooks">
              <Button className="bg-[var(--primary)] text-[var(--on-primary)]">Back to logs</Button>
            </Link>
            <Link href="/webhooks?simulate=1">
              <Button variant="outline" className="border-[var(--border-subtle)]">
                Simulate a callback
              </Button>
            </Link>
          </div>
        }
      />
    </main>
  );
}
