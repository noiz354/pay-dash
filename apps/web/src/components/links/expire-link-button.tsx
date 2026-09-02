"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { expirePaymentLinkAction } from "@/server/actions/links";
import { cn } from "@/lib/utils";

// Closes an OPEN link — it can no longer be paid. The state flip is visible
// in the table pill, the detail header and the share URL's behaviour.
export function ExpireLinkButton({ id, className }: { id: string; className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      className={cn("border-[var(--border-subtle)] text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]", className)}
      onClick={() => {
        startTransition(async () => {
          const fd = new FormData();
          fd.set("id", id);
          const res = await expirePaymentLinkAction(undefined, fd);
          if (res.status === "success") toast.success(res.message);
          else toast.error(res.message);
          router.refresh();
        });
      }}
    >
      {isPending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Closing…
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            block
          </span>
          Close this link
        </span>
      )}
    </Button>
  );
}
