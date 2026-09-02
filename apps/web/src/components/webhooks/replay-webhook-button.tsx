"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { replayWebhookAction } from "@/server/actions/webhooks";
import { cn } from "@/lib/utils";

// TEST MODE: re-POST the same callback (same provider event id). The shared
// pipeline logs the retry as DUPLICATED — the idempotency guarantee, made
// visible (QUEUES.md verification step).
export function ReplayWebhookButton({ id, className }: { id: string; className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  return (
    <Button
      type="button"
      disabled={isPending}
      className={cn("bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] disabled:opacity-60", className)}
      onClick={() => {
        startTransition(async () => {
          const fd = new FormData();
          fd.set("id", id);
          const res = await replayWebhookAction(undefined, fd);
          if (res.status === "success") toast.success(res.message);
          else toast.error(res.message);
          router.refresh();
        });
      }}
    >
      {isPending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Replaying…
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            replay
          </span>
          Replay callback
        </span>
      )}
    </Button>
  );
}
