"use client";

import * as React from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Real row actions (ADR-0021) — the prototype's ⋮ buttons had no menu.
export function SubscriptionRowActions({
  id,
  customerId,
  customerEmail,
  name,
}: {
  id: string;
  customerId: string;
  customerEmail: string;
  name: string;
}) {
  const router = useRouter();
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
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => router.push(`/customers/${customerId}`)}>
            View customer
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/transactions?q=${encodeURIComponent(customerEmail)}`)}>
            View payments
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await navigator.clipboard.writeText(id);
              toast.success("Plan ID copied", { description: id });
            }}
          >
            Copy plan ID
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
