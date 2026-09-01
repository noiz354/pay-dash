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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { createTransactionAction, type ActionState } from "@/server/actions/transactions";
import { cn } from "@/lib/utils";

const initialState: ActionState<{ id: string }> = { status: "idle", message: "" };

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="body-sm text-[var(--failed-status)] text-xs mt-1" role="alert">
      {errors[0]}
    </p>
  );
}

function SubmitButton() {
  // useFormStatus keeps the button disabled for the whole action round-trip.
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] disabled:opacity-60 min-w-[9.5rem]"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Creating…
        </span>
      ) : (
        "Create transaction"
      )}
    </Button>
  );
}

export function CreateTransactionDialog({
  triggerClassName,
  triggerLabel = "New Transaction",
}: {
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState(createTransactionAction, initialState);
  const router = useRouter();
  const handled = React.useRef<ActionState<{ id: string }> | null>(null);

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      setOpen(false);
      toast.success(state.message, {
        description: "The payment is pending confirmation from the channel.",
        action: state.data
          ? { label: "View", onClick: () => router.push(`/transactions/${state.data!.id}`) }
          : undefined,
      });
      router.refresh();
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            className={cn(
              "bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] flex items-center gap-2 whitespace-nowrap",
              triggerClassName
            )}
          >
            <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden="true">
              add
            </span>
            <span>{triggerLabel}</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg bg-[var(--surface)]">
        <DialogHeader>
          <DialogTitle className="headline-md text-[var(--on-surface)]">Create transaction</DialogTitle>
          <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
            Charges are created in TEST MODE — no real funds move.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="customerName" className="label-caps text-[var(--on-surface-variant)]">
                Customer name
              </Label>
              <Input
                id="customerName"
                name="customerName"
                placeholder="Sarah Chen"
                autoComplete="off"
                required
                aria-invalid={!!state.fieldErrors?.customerName}
                className="mt-1.5"
              />
              <FieldError errors={state.fieldErrors?.customerName} />
            </div>
            <div>
              <Label htmlFor="customerEmail" className="label-caps text-[var(--on-surface-variant)]">
                Customer email
              </Label>
              <Input
                id="customerEmail"
                name="customerEmail"
                type="email"
                placeholder="sarah@example.com"
                required
                aria-invalid={!!state.fieldErrors?.customerEmail}
                className="mt-1.5"
              />
              <FieldError errors={state.fieldErrors?.customerEmail} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Label htmlFor="amount" className="label-caps text-[var(--on-surface-variant)]">
                Amount
              </Label>
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                placeholder="1500000"
                required
                aria-invalid={!!state.fieldErrors?.amount}
                className="mt-1.5 data-mono text-right"
              />
              <FieldError errors={state.fieldErrors?.amount} />
            </div>
            <div>
              <Label htmlFor="currency" className="label-caps text-[var(--on-surface-variant)]">
                Currency
              </Label>
              <NativeSelect id="currency" name="currency" defaultValue="IDR" className="mt-1.5 w-full">
                <NativeSelectOption value="IDR">IDR</NativeSelectOption>
                <NativeSelectOption value="USD">USD</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>

          <div>
            <Label htmlFor="channel" className="label-caps text-[var(--on-surface-variant)]">
              Payment channel
            </Label>
            <NativeSelect id="channel" name="channel" defaultValue="CARD" className="mt-1.5 w-full">
              <NativeSelectOption value="CARD">Card</NativeSelectOption>
              <NativeSelectOption value="ACH">ACH transfer</NativeSelectOption>
              <NativeSelectOption value="VA">Virtual account</NativeSelectOption>
              <NativeSelectOption value="QRIS">QRIS</NativeSelectOption>
              <NativeSelectOption value="EWALLET">E-wallet</NativeSelectOption>
            </NativeSelect>
            <FieldError errors={state.fieldErrors?.channel} />
          </div>

          <div>
            <Label htmlFor="description" className="label-caps text-[var(--on-surface-variant)]">
              Description <span className="normal-case text-[var(--outline)]">(optional)</span>
            </Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              placeholder="Invoice INV-2041 settlement"
              className="mt-1.5"
            />
            <FieldError errors={state.fieldErrors?.description} />
          </div>

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
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
