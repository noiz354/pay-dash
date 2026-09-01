"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateCustomerAction, archiveCustomerAction } from "@/server/actions/customers";
import { CUSTOMER_STATUSES, type CustomerStatus } from "@/lib/customer-status";

const LABELS: Record<CustomerStatus, string> = {
  ACTIVE: "Mark as active",
  REVIEW: "Flag for review",
  NEW: "Mark as new",
  BLOCKED: "Archive customer",
};

// Status transitions for a single customer, with optimistic UI: the trigger
// switches to a pending label immediately and router.refresh() reconciles the
// server-rendered pill afterwards.
export function CustomerStatusMenu({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: CustomerStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [optimistic, setOptimistic] = React.useState<CustomerStatus | null>(null);
  const current = optimistic ?? status;

  const setStatus = (next: CustomerStatus) => {
    setOptimistic(next);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      if (next === "BLOCKED") {
        const res = await archiveCustomerAction(undefined, fd);
        if (res.status === "success") toast.success(res.message);
        else {
          setOptimistic(null);
          toast.error(res.message);
        }
      } else {
        fd.set("status", next);
        const res = await updateCustomerAction(undefined, fd);
        if (res.status === "success") toast.success(`${name} is now ${next.toLowerCase()}`);
        else {
          setOptimistic(null);
          toast.error(res.message);
        }
      }
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="gap-2 border-[var(--border-subtle)] disabled:opacity-60"
            disabled={isPending}
            aria-label={`Change status for ${name}`}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              {isPending ? "progress_activity" : "tune"}
            </span>
            {isPending ? "Saving…" : "Manage"}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        {CUSTOMER_STATUSES.filter((s) => s !== "BLOCKED").map((s) => (
          <DropdownMenuItem key={s} disabled={current === s || isPending} onClick={() => setStatus(s)}>
            {LABELS[s]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {current === "BLOCKED" ? (
          <DropdownMenuItem disabled={isPending} onClick={() => setStatus("ACTIVE")}>
            Restore customer
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={isPending} onClick={() => setStatus("BLOCKED")}>
            {LABELS.BLOCKED}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
