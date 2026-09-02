"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { payPaymentLinkAction } from "@/server/actions/links";
import { cn } from "@/lib/utils";

// TEST MODE: stand in for the payer. Records a SUCCEEDED ledger transaction
// (id = the link id) so the link flips to Paid everywhere, the balance moves,
// and the transaction detail page becomes reachable from "View payment".
export function SimulatePaymentButton({ id, className }: { id: string; className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  return (
    <Button
      type="button"
      disabled={isPending}
      className={cn(
        "bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] disabled:opacity-60",
        className
      )}
      onClick={() => {
        startTransition(async () => {
          const fd = new FormData();
          fd.set("id", id);
          const res = await payPaymentLinkAction(undefined, fd);
          if (res.status === "success") {
            toast.success(res.message, {
              action: res.data
                ? { label: "View", onClick: () => router.push(`/transactions/${res.data!.transactionId}`) }
                : undefined,
            });
          } else {
            toast.error(res.message);
          }
          router.refresh();
        });
      }}
    >
      {isPending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Recording…
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            play_circle
          </span>
          Simulate payment
        </span>
      )}
    </Button>
  );
}
