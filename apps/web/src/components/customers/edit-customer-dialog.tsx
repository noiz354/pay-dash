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
import { updateCustomerAction, type ActionState } from "@/server/actions/customers";
import type { Customer } from "@/server/data/customers";

const initialState: ActionState<{ id: string }> = { status: "idle", message: "" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="min-w-[8rem] bg-[var(--primary)] text-[var(--on-primary)] disabled:opacity-60"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Saving…
        </span>
      ) : (
        "Save changes"
      )}
    </Button>
  );
}

/** Edit dialog for one customer. Opens itself when the URL carries `?edit=1`. */
export function EditCustomerDialog({ customer }: { customer: Customer }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wantsOpen = searchParams.get("edit") === "1";
  const [open, setOpen] = React.useState(wantsOpen);
  const [state, formAction] = useActionState(updateCustomerAction, initialState);
  const handled = React.useRef<ActionState<{ id: string }> | null>(null);

  React.useEffect(() => {
    if (wantsOpen) setOpen(true);
  }, [wantsOpen]);

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && wantsOpen) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("edit");
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
      toast.success(state.message);
      router.refresh();
    } else if (state.status === "error" && !state.fieldErrors) {
      toast.error(state.message);
    }
  }, [state, router, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" className="gap-2 border-[var(--border-subtle)]">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              edit
            </span>
            Edit
          </Button>
        }
      />
      <DialogContent className="bg-[var(--surface)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="headline-md text-[var(--on-surface)]">Edit customer</DialogTitle>
          <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
            The email address is the identity key for matching payments and cannot be changed here.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={customer.id} />

          <div>
            <Label htmlFor="edit-name" className="label-caps text-[var(--on-surface-variant)]">
              Name
            </Label>
            <Input id="edit-name" name="name" defaultValue={customer.name} required className="mt-1.5" />
            {state.fieldErrors?.name ? (
              <p className="body-sm mt-1 text-xs text-[var(--failed-status)]" role="alert">
                {state.fieldErrors.name[0]}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="edit-email" className="label-caps text-[var(--on-surface-variant)]">
              Email
            </Label>
            <Input id="edit-email" defaultValue={customer.email} readOnly disabled className="mt-1.5 opacity-70" />
          </div>

          <div>
            <Label htmlFor="edit-status" className="label-caps text-[var(--on-surface-variant)]">
              Status
            </Label>
            <NativeSelect id="edit-status" name="status" defaultValue={customer.status} className="mt-1.5 w-full">
              <NativeSelectOption value="NEW">New</NativeSelectOption>
              <NativeSelectOption value="ACTIVE">Active</NativeSelectOption>
              <NativeSelectOption value="REVIEW">Review</NativeSelectOption>
              <NativeSelectOption value="BLOCKED">Archived</NativeSelectOption>
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="edit-notes" className="label-caps text-[var(--on-surface-variant)]">
              Notes
            </Label>
            <Textarea id="edit-notes" name="notes" rows={2} defaultValue={customer.notes ?? ""} className="mt-1.5" />
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
            <SaveButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
