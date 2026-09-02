"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { approveBatchAction, cancelBatchAction, type ActionState } from "@/server/actions/payouts";
import { formatMoney, formatNumber } from "@/lib/format";

type Mode = "send" | "cancel";
const initialState: ActionState<{ id: string; paid: number; failed: number }> = { status: "idle", message: "" };

function ConfirmButton({ mode, amount, currency }: { mode: Mode; amount: number; currency: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={
        mode === "send"
          ? "min-w-[13rem] bg-[var(--primary)] text-[var(--on-primary)] disabled:opacity-60"
          : "min-w-[10rem] bg-[var(--failed-status,#b3261e)] text-white disabled:opacity-60"
      }
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> {mode === "send" ? "Releasing…" : "Cancelling…"}
        </span>
      ) : mode === "send" ? (
        `Release ${formatMoney(amount, currency)}`
      ) : (
        "Cancel batch"
      )}
    </Button>
  );
}

/**
 * The money gate.
 * Releasing or cancelling a batch is irreversible, so both go through an
 * explicit confirmation checkbox — the same pattern the invoice payment flow
 * established. Opens on `?send=1` / `?cancel=1` so the list row menu can deep
 * link straight to the decision.
 */
export function ReleaseBatchDialog({
  batchId,
  batchName,
  amount,
  currency,
  recipientCount,
  mode = "send",
  triggerLabel,
  triggerVariant = "primary",
}: {
  batchId: string;
  batchName: string;
  amount: number;
  currency: string;
  recipientCount: number;
  mode?: Mode;
  triggerLabel?: string;
  triggerVariant?: "primary" | "outline";
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const param = mode === "send" ? "send" : "cancel";
  const wantsOpen = searchParams.get(param) === "1" || searchParams.get(param) === batchId;
  const [open, setOpen] = React.useState(wantsOpen);
  // Both actions share the useActionState shape; cancel simply never fills `data`.
  const [state, formAction] = useActionState(
    (mode === "send" ? approveBatchAction : cancelBatchAction) as typeof approveBatchAction,
    initialState
  );
  const handled = React.useRef<typeof state | null>(null);

  React.useEffect(() => {
    if (wantsOpen) setOpen(true);
  }, [wantsOpen]);

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && wantsOpen) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete(param);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    },
    [param, pathname, router, searchParams, wantsOpen]
  );

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      onOpenChange(false);
      if (state.data?.failed) {
        toast.warning(state.message, { description: "Retry the failed transfers from the batch page." });
      } else {
        toast.success(state.message);
      }
      router.refresh();
    } else if (!state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state, router, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant={triggerVariant === "outline" ? "outline" : "default"}
            className={
              triggerVariant === "outline"
                ? "gap-2 border-[var(--border-subtle)]"
                : "gap-2 bg-[var(--primary)] text-[var(--on-primary)]"
            }
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              {mode === "send" ? "send_money" : "cancel"}
            </span>
            {triggerLabel ?? (mode === "send" ? "Release funds" : "Cancel batch")}
          </Button>
        }
      />
      <DialogContent className="bg-[var(--surface)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="headline-md text-[var(--on-surface)]">
            {mode === "send" ? `Release ${batchName}?` : `Cancel ${batchName}?`}
          </DialogTitle>
          <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
            {mode === "send"
              ? "TEST MODE — no real funds move. Transfers are submitted immediately and cannot be recalled."
              : "Recipients will be marked returned and no funds will be released."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={batchId} />

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4">
            <span className="label-caps text-[var(--on-surface-variant)]">
              {mode === "send" ? "Total to disburse" : "Amount held back"}
            </span>
            <div className="headline-lg data-mono mt-1 text-[var(--on-surface)]">
              {formatMoney(amount, currency)}
            </div>
            <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
              {formatNumber(recipientCount)} recipient{recipientCount === 1 ? "" : "s"} · batch {batchId}
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox id={`confirm-${param}-${batchId}`} name="confirm" value="on" className="mt-0.5" />
            <Label
              htmlFor={`confirm-${param}-${batchId}`}
              className="body-sm font-normal text-[var(--on-surface-variant)]"
            >
              {mode === "send"
                ? "I have reviewed the recipients and authorise this disbursement."
                : "I understand this batch will not be paid."}
            </Label>
          </div>
          {state.fieldErrors?.confirm ? (
            <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
              {state.fieldErrors.confirm[0]}
            </p>
          ) : null}

          {state.status === "error" && !state.fieldErrors ? (
            <p className="body-sm text-[var(--failed-status)]" role="alert">
              {state.message}
            </p>
          ) : null}

          <DialogFooter className="pt-2">
            <DialogClose
              render={
                <Button type="button" variant="outline" className="border-[var(--border-subtle)]">
                  Keep as is
                </Button>
              }
            />
            <ConfirmButton mode={mode} amount={amount} currency={currency} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
