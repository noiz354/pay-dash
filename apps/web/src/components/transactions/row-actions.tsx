"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { retryTransactionAction } from "@/server/actions/transactions";
import type { TransactionStatus } from "@/server/data/transactions";

// Per-row overflow menu. Every entry performs a real navigation or mutation —
// no placeholder handlers.
export function RowActions({
  id,
  status,
  customerEmail,
}: {
  id: string;
  status: TransactionStatus;
  customerEmail: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const retry = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await retryTransactionAction(undefined, fd);
      if (res.status === "success") toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  };

  return (
    <div data-row-interactive>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="text-[var(--on-surface-variant)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-[var(--on-surface)] transition-all disabled:opacity-40"
          aria-label={`Actions for ${id}`}
          disabled={isPending}
        >
          <span className="material-symbols-outlined text-[18px]">{isPending ? "progress_activity" : "more_horiz"}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => router.push(`/transactions/${id}`)}>View details</DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              await navigator.clipboard.writeText(id);
              toast.success("Reference ID copied", { description: id });
            }}
          >
            Copy reference ID
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/customers?q=${encodeURIComponent(customerEmail)}`)}>
            View customer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {status === "FAILED" ? (
            <DropdownMenuItem onClick={retry}>Retry payment</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => router.push(`/transactions/${id}?refund=1`)}>Refund…</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => router.push(`/support?ref=${encodeURIComponent(id)}`)}>
            Dispute / contact support
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
