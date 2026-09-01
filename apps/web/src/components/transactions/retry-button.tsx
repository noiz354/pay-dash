"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { retryTransactionAction } from "@/server/actions/transactions";

// Retry a failed payment — pending state on the button, toast on completion.
export function RetryButton({ id }: { id: string }) {
  const [isPending, startTransition] = React.useTransition();
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      aria-disabled={isPending}
      className="border-[var(--border-subtle)] gap-2 disabled:opacity-60"
      onClick={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set("id", id);
          const res = await retryTransactionAction(undefined, fd);
          if (res.status === "success") toast.success(res.message);
          else toast.error(res.message);
          router.refresh();
        })
      }
    >
      {isPending ? <Spinner className="size-4" /> : (
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          replay
        </span>
      )}
      {isPending ? "Retrying…" : "Retry payment"}
    </Button>
  );
}
