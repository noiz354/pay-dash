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
import { archiveCustomerAction } from "@/server/actions/customers";
import type { CustomerStatus } from "@/lib/customer-status";

// Per-row overflow menu — the prototype's `more_horiz` button, now with a real
// destination or a real mutation behind every entry.
export function CustomerRowActions({
  id,
  name,
  email,
  status,
}: {
  id: string;
  name: string;
  email: string;
  status: CustomerStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const archived = status === "BLOCKED";

  const toggleArchive = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      if (archived) fd.set("restore", "1");
      const res = await archiveCustomerAction(undefined, fd);
      if (res.status === "success") toast.success(res.message);
      else toast.error(res.message);
      router.refresh();
    });
  };

  return (
    <div data-row-interactive>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex rounded p-1 text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container-high)] hover:text-[var(--on-surface)] disabled:opacity-40"
          aria-label={`More actions for ${name}`}
          disabled={isPending}
        >
          <span className="material-symbols-outlined hidden md:inline" style={{ fontSize: 20 }} aria-hidden="true">
            {isPending ? "progress_activity" : "more_horiz"}
          </span>
          <span className="material-symbols-outlined md:hidden" style={{ fontSize: 20 }} aria-hidden="true">
            chevron_right
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => router.push(`/customers/${id}`)}>View profile</DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/transactions?q=${encodeURIComponent(email)}`)}>
            View payments
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              await navigator.clipboard.writeText(email);
              toast.success("Email copied", { description: email });
            }}
          >
            Copy email
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(`/customers/${id}?edit=1`)}>Edit details</DropdownMenuItem>
          <DropdownMenuItem onClick={toggleArchive} disabled={isPending}>
            {archived ? "Restore customer" : "Archive customer"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
