"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { retryBatchAction } from "@/server/actions/payouts";

// Retry every failed/returned transfer in a batch, with a pending state and a
// result toast — the recovery path the prototype had no concept of.
export function RetryFailuresButton({ batchId, failedCount }: { batchId: string; failedCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      aria-disabled={busy}
      className="gap-2 border-[var(--border-subtle)]"
      onClick={async () => {
        setBusy(true);
        const data = new FormData();
        data.set("id", batchId);
        const result = await retryBatchAction(undefined, data);
        setBusy(false);
        if (result.status === "success") toast.success(result.message);
        else toast.error(result.message);
        router.refresh();
      }}
    >
      {busy ? (
        <>
          <Spinner className="size-4" /> Retrying…
        </>
      ) : (
        <>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            replay
          </span>
          Retry {failedCount} failed
        </>
      )}
    </Button>
  );
}
