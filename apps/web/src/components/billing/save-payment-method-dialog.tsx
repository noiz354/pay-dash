"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { createPaymentMethodAction, type ActionState } from "@/server/actions/payment-methods";

const initialState: ActionState<{ id: string }> = { status: "idle", message: "" };

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="body-sm mt-1 text-xs text-[var(--failed-status)]" role="alert">
      {errors[0]}
    </p>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="min-w-[9rem] bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] disabled:opacity-60"
    >
      {pending ? <Spinner className="size-4" /> : "Save method"}
    </Button>
  );
}

/** Save a card/account payment method on the merchant's billing. */
export function SavePaymentMethodDialog() {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState(createPaymentMethodAction, initialState);
  const handled = React.useRef<ActionState<{ id: string }> | null>(null);

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      setOpen(false);
      toast.success(state.message, { description: "The method is ready to be reused for billing." });
    } else if (state.status === "error" && !state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="h-9 gap-2 whitespace-nowrap shadow-sm" variant="outline">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              credit_card
            </span>
            <span>Save payment method</span>
          </Button>
        }
      />
      <DialogContent className="bg-[var(--surface)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="headline-md text-[var(--on-surface)]">Save payment method</DialogTitle>
          <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
            Save a card or account token so future invoices can be charged directly. Requires a connected provider.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div>
            <Label htmlFor="pm-customer" className="label-caps text-[var(--on-surface-variant)]">
              Customer
            </Label>
            <Input
              id="pm-customer"
              name="customerId"
              placeholder="billing@acmecorp.com"
              autoComplete="off"
              required
              aria-invalid={!!state.fieldErrors?.customerId}
              className="mt-1.5"
            />
            <FieldError errors={state.fieldErrors?.customerId} />
          </div>

          <div>
            <Label htmlFor="pm-token" className="label-caps text-[var(--on-surface-variant)]">
              Payment token
            </Label>
            <Input
              id="pm-token"
              name="token"
              placeholder="pm_… / token_…"
              autoComplete="off"
              required
              aria-invalid={!!state.fieldErrors?.token}
              className="mt-1.5"
            />
            <FieldError errors={state.fieldErrors?.token} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pm-kind" className="label-caps text-[var(--on-surface-variant)]">
                Type
              </Label>
              <NativeSelect id="pm-kind" name="kind" defaultValue="card" className="mt-1.5 w-full">
                <NativeSelectOption value="card">Card</NativeSelectOption>
                <NativeSelectOption value="bank_account">Bank account</NativeSelectOption>
                <NativeSelectOption value="ewallet">E-wallet</NativeSelectOption>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="pm-label" className="label-caps text-[var(--on-surface-variant)]">
                Label <span className="normal-case text-[var(--outline)]">(optional)</span>
              </Label>
              <Input id="pm-label" name="label" placeholder="Company card" className="mt-1.5" />
            </div>
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
