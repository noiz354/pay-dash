"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConflictDialog } from "@/components/data-table/conflict-dialog";
import { retryTransactionAction, type ActionState } from "@/server/actions/transactions";
import { trackEvent } from "@/lib/analytics-events";

// Retry a failed payment — pending state on the button, toast on completion.
//
// CMP-020 recovery: the button sends the `updatedAt` the viewer rendered as
// `expectedUpdatedAt`. If the row moved since then the server refuses with a
// CONFLICT payload and this component opens the ConflictDialog showing the
// latest state. Nothing is auto-applied — retrying requires an explicit click
// after the user has seen what actually changed on the server.

export function RetryButton({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt?: string }) {
  const [isPending, startTransition] = React.useTransition();
  const [conflict, setConflict] = React.useState<ActionState["conflict"] | null>(null);
  const router = useRouter();
  const latestUpdatedAt = React.useRef<string | undefined>(expectedUpdatedAt);

  const runRetry = (fd: FormData) => {
    startTransition(async () => {
      const res = await retryTransactionAction(undefined, fd);
      if (res.status === "success") {
        setConflict(null);
        toast.success(res.message);
        if (conflict) {
          // The race was surfaced, reviewed, and resolved — recovered.
          trackEvent("conflict_recovered", { entity_type: "transaction", resolution: "retry_accepted", scr: "SCR-006" });
        }
        router.refresh();
      } else if (res.conflict) {
        // The row changed under us: show the latest state and wait for an
        // explicit decision. Never auto-apply.
        const lastUpdated = res.conflict.currentState["last updated"];
        latestUpdatedAt.current = lastUpdated !== undefined ? String(lastUpdated) : undefined;
        setConflict(res.conflict);
      } else {
        toast.error(res.message);
      }
    });
  };

  const onRetry = () => {
    const fd = new FormData();
    fd.set("id", id);
    // Retry against the latest state the user just reviewed.
    if (latestUpdatedAt.current) fd.set("expectedUpdatedAt", latestUpdatedAt.current);
    runRetry(fd);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        aria-disabled={isPending}
        data-testid="retry-payment-button"
        className="border-[var(--border-subtle)] gap-2 disabled:opacity-60"
        onClick={() => {
          const fd = new FormData();
          fd.set("id", id);
          if (expectedUpdatedAt) fd.set("expectedUpdatedAt", expectedUpdatedAt);
          runRetry(fd);
        }}
      >
        {isPending ? <Spinner className="size-4" /> : (
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            replay
          </span>
        )}
        {isPending ? "Retrying…" : "Retry payment"}
      </Button>

      <ConflictDialog
        open={conflict !== null}
        onClose={() => {
          setConflict(null);
          // Sync the page behind the dialog to the latest server state so the
          // viewer is never left looking at the stale row that caused this.
          router.refresh();
        }}
        snapshot={{
          description: conflict?.description ?? "",
          currentState: conflict?.currentState ?? {},
          proposedChanges: {},
          detectedAt: conflict ? new Date(conflict.detectedAt) : new Date(),
        }}
        onRetry={onRetry}
        isRetrying={isPending}
      />
    </>
  );
}
