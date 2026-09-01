"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { refundTransactionAction, type ActionState } from "@/server/actions/transactions";
import { formatMoney } from "@/lib/format";

const initialState: ActionState = { status: "idle", message: "" };

function RefundSubmit({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      className="bg-[var(--failed-status)] text-white hover:opacity-90 disabled:opacity-60 min-w-[8.5rem]"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Refunding…
        </span>
      ) : (
        "Issue refund"
      )}
    </Button>
  );
}

export function RefundDialog({
  transactionId,
  refundable,
  currency,
  disabled,
  trigger,
  autoOpen = false,
}: {
  transactionId: string;
  refundable: number;
  currency: string;
  disabled?: boolean;
  trigger?: React.ReactNode;
  autoOpen?: boolean;
}) {
  // ?refund=1 deep-link (used by the ledger row menu) opens the dialog directly.
  const [open, setOpen] = React.useState(autoOpen && !disabled);
  const [state, formAction] = useActionState(refundTransactionAction, initialState);
  const router = useRouter();
  const handled = React.useRef<ActionState | null>(null);

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      setOpen(false);
      toast.success(state.message, { description: `Reference ${transactionId}` });
      router.refresh();
    } else {
      toast.error(state.message);
    }
  }, [state, router, transactionId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          (trigger as React.ReactElement) ?? (
            <Button
              variant="outline"
              disabled={disabled}
              className="border-[var(--failed-status)]/40 text-[var(--failed-status)] hover:bg-[var(--failed-status)]/5"
            >
              Refund
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md bg-[var(--surface)]">
        <DialogHeader>
          <DialogTitle className="headline-md text-[var(--on-surface)]">Refund payment</DialogTitle>
          <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
            Up to <span className="data-mono">{formatMoney(refundable, currency)}</span> can be returned to the original
            payment method. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={transactionId} />
          <div>
            <Label htmlFor="refund-amount" className="label-caps text-[var(--on-surface-variant)]">
              Refund amount
            </Label>
            <Input
              id="refund-amount"
              name="amount"
              inputMode="decimal"
              defaultValue={String(refundable)}
              aria-invalid={!!state.fieldErrors?.amount}
              className="mt-1.5 data-mono text-right"
            />
            {state.fieldErrors?.amount ? (
              <p className="body-sm text-[var(--failed-status)] text-xs mt-1" role="alert">
                {state.fieldErrors.amount[0]}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="refund-reason" className="label-caps text-[var(--on-surface-variant)]">
              Reason <span className="normal-case text-[var(--outline)]">(optional)</span>
            </Label>
            <Textarea id="refund-reason" name="reason" rows={2} placeholder="Duplicate charge" className="mt-1.5" />
          </div>
          {state.status === "error" && !state.fieldErrors ? (
            <p className="body-sm text-[var(--failed-status)]" role="alert">
              {state.message}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" className="border-[var(--border-subtle)]">
                  Cancel
                </Button>
              }
            />
            <RefundSubmit disabled={refundable <= 0} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
