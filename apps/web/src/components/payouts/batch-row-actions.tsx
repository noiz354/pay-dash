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
import { isApprovable, isCancellable, isRetryable, type PayoutStatus } from "@/lib/payout-status";
import { retryBatchAction } from "@/server/actions/payouts";

// Overflow menu for a batch row: every entry either navigates or mutates.
// "Release funds" deep-links to `?send=1` so the confirmation dialog is
// reachable from the list, a bookmark and the detail page alike.
export function BatchRowActions({ id, name, status }: { id: string; name: string; status: PayoutStatus }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  return (
    <div data-row-interactive>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex rounded p-1 text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)]"
          aria-label={`More actions for ${name}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
            more_horiz
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={() => router.push(`/payouts/${id}`)}>View batch</DropdownMenuItem>
          {isApprovable(status) ? (
            <DropdownMenuItem onClick={() => router.push(`/payouts/${id}?send=1`)}>
              Release funds…
            </DropdownMenuItem>
          ) : null}
          {isRetryable(status) ? (
            <DropdownMenuItem
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const data = new FormData();
                data.set("id", id);
                const result = await retryBatchAction(undefined, data);
                setBusy(false);
                if (result.status === "success") {
                  toast.success(result.message);
                  router.refresh();
                } else {
                  toast.error(result.message);
                }
              }}
            >
              Retry failed transfers
            </DropdownMenuItem>
          ) : null}
          {isCancellable(status) ? (
            <DropdownMenuItem onClick={() => router.push(`/payouts/${id}?cancel=1`)}>
              Cancel batch…
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await navigator.clipboard.writeText(id);
              toast.success("Batch ID copied", { description: id });
            }}
          >
            Copy batch ID
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              window.location.href = `/api/exports/payouts/${id}`;
            }}
          >
            Download recipients CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/payouts/settings")}>Payout settings</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
