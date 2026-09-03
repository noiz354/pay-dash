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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { payInvoiceAction, type ActionState } from "@/server/actions/invoices";
import { PAYMENT_METHODS } from "@/lib/invoice-status";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const initialState: ActionState<{ id: string; reference: string }> = { status: "idle", message: "" };

function PayButton({ amount, currency }: { amount: number; currency: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="min-w-[12rem] bg-[var(--primary)] text-[var(--on-primary)] disabled:opacity-60"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Processing…
        </span>
      ) : (
        `Pay ${formatMoney(amount, currency)}`
      )}
    </Button>
  );
}

/**
 * Settle an outstanding invoice.
 * The money action the prototype never had. Opens itself on `?pay=1` so the
 * overdue banner, the row action and the detail page can all deep-link to it.
 */
export function PayInvoiceDialog({
  invoiceId,
  invoiceNumber,
  amount,
  currency,
  dueLabel,
  triggerLabel = "Pay now",
  triggerClassName,
  variant = "primary",
}: {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueLabel?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  variant?: "primary" | "outline";
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wantsOpen = searchParams.get("pay") === "1" || searchParams.get("pay") === invoiceId;
  const [open, setOpen] = React.useState(wantsOpen);
  const [state, formAction] = useActionState(payInvoiceAction, initialState);
  const handled = React.useRef<ActionState<{ id: string; reference: string }> | null>(null);

  React.useEffect(() => {
    if (wantsOpen) setOpen(true);
  }, [wantsOpen]);

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && wantsOpen) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("pay");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    },
    [pathname, router, searchParams, wantsOpen]
  );

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      onOpenChange(false);
      toast.success(state.message, {
        description: state.data ? `Payment reference ${state.data.reference}` : undefined,
        action: state.data
          ? { label: "View invoice", onClick: () => router.push(`/billing/${state.data!.id}`) }
          : undefined,
      });
      router.refresh();
    } else if (state.status === "error" && !state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state, router, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant={variant === "outline" ? "outline" : "default"}
            className={cn(
              "gap-2",
              variant === "outline"
                ? "border-[var(--border-subtle)]"
                : "bg-[var(--primary)] text-[var(--on-primary)]",
              triggerClassName
            )}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              payments
            </span>
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="bg-[var(--surface)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="headline-md text-[var(--on-surface)]">Pay {invoiceNumber}</DialogTitle>
          <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
            TEST MODE — no real funds move. {dueLabel ? `Due ${dueLabel}.` : null}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={invoiceId} />

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4">
            <span className="label-caps text-[var(--on-surface-variant)]">Amount due</span>
            <div className="mt-1 headline-lg data-mono text-[var(--on-surface)]">
              {formatMoney(amount, currency)}
            </div>
          </div>

          <div>
            <Label htmlFor="pay-method" className="label-caps text-[var(--on-surface-variant)]">
              Payment method
            </Label>
            <NativeSelect id="pay-method" name="method" defaultValue={PAYMENT_METHODS[0]} className="mt-1.5 w-full">
              {PAYMENT_METHODS.map((m) => (
                <NativeSelectOption key={m} value={m}>
                  {m}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {state.fieldErrors?.method ? (
              <p className="body-sm mt-1 text-xs text-[var(--failed-status)]" role="alert">
                {state.fieldErrors.method[0]}
              </p>
            ) : null}
          </div>

          <div className="flex items-start gap-2">
            <Checkbox id="pay-confirm" name="confirm" value="on" className="mt-0.5" />
            <Label htmlFor="pay-confirm" className="body-sm font-normal text-[var(--on-surface-variant)]">
              I confirm this amount and authorise the platform to collect it.
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
                  Cancel
                </Button>
              }
            />
            <PayButton amount={amount} currency={currency} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
