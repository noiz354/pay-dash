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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { createCustomerAction, type ActionState } from "@/server/actions/customers";
import { cn } from "@/lib/utils";

const initialState: ActionState<{ id: string; name: string }> = { status: "idle", message: "" };

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="body-sm mt-1 text-xs text-[var(--failed-status)]" role="alert">
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
      className="min-w-[9rem] bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] disabled:opacity-60"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Adding…
        </span>
      ) : (
        "Add customer"
      )}
    </Button>
  );
}

/**
 * Create-customer modal.
 * Also consumes the dashboard quick action `/customers?new=1`: the param opens
 * the dialog and is dropped from the URL when it closes, so refresh or a back
 * navigation never re-opens it unexpectedly.
 */
export function CreateCustomerDialog({
  triggerClassName,
  triggerLabel = "Add Customer",
  openParam = "new",
  defaultEmail = "",
}: {
  triggerClassName?: string;
  triggerLabel?: string;
  openParam?: string;
  defaultEmail?: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wantsOpen = searchParams.get(openParam) === "1";
  const [open, setOpen] = React.useState(wantsOpen);
  const [state, formAction] = useActionState(createCustomerAction, initialState);
  const handled = React.useRef<ActionState<{ id: string; name: string }> | null>(null);

  React.useEffect(() => {
    if (wantsOpen) setOpen(true);
  }, [wantsOpen]);

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && wantsOpen) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete(openParam);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    },
    [openParam, pathname, router, searchParams, wantsOpen]
  );

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      onOpenChange(false);
      toast.success(state.message, {
        description: "They are ready to be charged — create a payment when you are.",
        action: state.data
          ? { label: "View profile", onClick: () => router.push(`/customers/${state.data!.id}`) }
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
          <Button size="sm" className={cn("h-9 gap-2 whitespace-nowrap shadow-sm", triggerClassName)}>
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              add
            </span>
            <span>{triggerLabel}</span>
          </Button>
        }
      />
      <DialogContent className="bg-[var(--surface)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="headline-md text-[var(--on-surface)]">Add customer</DialogTitle>
          <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
            Customers are matched to payments by email — reuse the same address you charge.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div>
            <Label htmlFor="customer-name" className="label-caps text-[var(--on-surface-variant)]">
              Name
            </Label>
            <Input
              id="customer-name"
              name="name"
              placeholder="Acme Corporation"
              autoComplete="off"
              required
              aria-invalid={!!state.fieldErrors?.name}
              className="mt-1.5"
            />
            <FieldError errors={state.fieldErrors?.name} />
          </div>

          <div>
            <Label htmlFor="customer-email" className="label-caps text-[var(--on-surface-variant)]">
              Email
            </Label>
            <Input
              id="customer-email"
              name="email"
              type="email"
              defaultValue={defaultEmail}
              placeholder="billing@acmecorp.com"
              required
              aria-invalid={!!state.fieldErrors?.email}
              className="mt-1.5"
            />
            <FieldError errors={state.fieldErrors?.email} />
          </div>

          <div>
            <Label htmlFor="customer-status" className="label-caps text-[var(--on-surface-variant)]">
              Status
            </Label>
            <NativeSelect id="customer-status" name="status" defaultValue="NEW" className="mt-1.5 w-full">
              <NativeSelectOption value="NEW">New</NativeSelectOption>
              <NativeSelectOption value="ACTIVE">Active</NativeSelectOption>
              <NativeSelectOption value="REVIEW">Review</NativeSelectOption>
            </NativeSelect>
            <FieldError errors={state.fieldErrors?.status} />
          </div>

          <div>
            <Label htmlFor="customer-notes" className="label-caps text-[var(--on-surface-variant)]">
              Notes <span className="normal-case text-[var(--outline)]">(optional)</span>
            </Label>
            <Textarea
              id="customer-notes"
              name="notes"
              rows={2}
              placeholder="Net-30 terms, invoices to the AP inbox."
              className="mt-1.5"
            />
            <FieldError errors={state.fieldErrors?.notes} />
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
