"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BatchUploadDropzone } from "@/components/payouts/batch-upload-dropzone";

/**
 * "New Batch" finally opens something.
 * Opens itself on `?new=1` so the payouts empty state, the summary cards and a
 * bookmark can all land the operator directly in the create flow.
 */
export function CreateBatchDialog({
  triggerLabel = "New Batch",
  triggerClassName,
}: {
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wantsOpen = searchParams.get("new") === "1";
  const [open, setOpen] = React.useState(wantsOpen);

  React.useEffect(() => {
    if (wantsOpen) setOpen(true);
  }, [wantsOpen]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && wantsOpen) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            aria-label="New Batch"
            className={`gap-2 bg-[var(--primary)] text-[var(--on-primary)] ${triggerClassName ?? ""}`}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              add
            </span>
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-[var(--surface)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="headline-md text-[var(--on-surface)]">New payout batch</DialogTitle>
          <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
            TEST MODE — no real funds move. Upload or paste recipients, review the parse, then create the batch.
          </DialogDescription>
        </DialogHeader>
        <BatchUploadDropzone />
      </DialogContent>
    </Dialog>
  );
}
