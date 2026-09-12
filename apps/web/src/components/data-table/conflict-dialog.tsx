"use client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

// 409 Conflict handling — backend returns 409 when version stale, UI explains and allows retry/review
export function ConflictDialog({
  open,
  onClose,
  onRetry,
  latest,
}: {
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
  latest?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent aria-describedby="conflict-desc">
        <DialogHeader>
          <DialogTitle>Data changed</DialogTitle>
          <DialogDescription id="conflict-desc">
            This record was updated by someone else since you loaded it. Review the latest state before retrying — we won’t overwrite automatically.
          </DialogDescription>
        </DialogHeader>
        {latest ? <div className="rounded border bg-[var(--surface-container-low)] p-3 text-sm">{latest}</div> : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Review
          </Button>
          <Button onClick={onRetry}>Retry with latest</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
