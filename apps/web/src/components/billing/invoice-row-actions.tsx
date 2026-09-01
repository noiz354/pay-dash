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
import { isPayable, type InvoiceStatus } from "@/lib/invoice-status";

// Overflow menu for an invoice row. Every entry navigates or mutates — the
// "Pay now" entry deep-links to the dialog via `?pay=<id>` so the action works
// from the list, from a bookmark and from the detail page alike.
export function InvoiceRowActions({
  id,
  number,
  status,
  periodStart,
  periodEnd,
}: {
  id: string;
  number: string;
  status: InvoiceStatus;
  periodStart: string;
  periodEnd: string;
}) {
  const router = useRouter();

  return (
    <div data-row-interactive>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex rounded p-1 text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)]"
          aria-label={`More actions for ${number}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden="true">
            more_horiz
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={() => router.push(`/billing/${id}`)}>View invoice</DropdownMenuItem>
          {isPayable(status) ? (
            <DropdownMenuItem onClick={() => router.push(`/billing/${id}?pay=1`)}>Pay now</DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() =>
              router.push(
                `/transactions?range=all&q=&from=${encodeURIComponent(periodStart)}&to=${encodeURIComponent(periodEnd)}`
              )
            }
          >
            View billed transactions
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await navigator.clipboard.writeText(number);
              toast.success("Invoice ID copied", { description: number });
            }}
          >
            Copy invoice ID
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings/merchant")}>
            Billing settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
