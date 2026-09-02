"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
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
import { CopyButton } from "@/components/common/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import {
  createSubscriptionAction,
  type ActionState,
} from "@/server/actions/subscriptions";

// Create Subscription (ADR-0021): a real dialog backed by a server action.
// The customer is picked from the real directory (so "View customer" always
// resolves), every value reaches FormData via named/hidden inputs (the
// ADR-0019 discipline), and the plan lands in PENDING_SETUP — the app never
// claims a new plan is live the moment it is made.
const initialState: ActionState<{ id: string }> = { status: "idle", message: "" };

export function CreateSubscriptionDialog({
  customers,
  triggerLabel = "Create Subscription",
}: {
  customers: { name: string; email: string }[];
  triggerLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, formAction] = useActionState(createSubscriptionAction, initialState);
  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = React.useState("");

  const handled = React.useRef<ActionState<{ id: string }> | null>(null);
  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success" && state.data) {
      setCreatedId(state.data.id);
    }
  }, [state]);

  const selected = customers.find((c) => c.email === customerEmail);

  const resetForAnother = () => {
    setCreatedId(null);
    setCustomerEmail("");
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setCreatedId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)] flex items-center gap-2 whitespace-nowrap">
            <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden="true">
              add
            </span>
            <span>{triggerLabel}</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg bg-[var(--surface)]">
        {createdId ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="headline-md text-[var(--on-surface)]">Plan created</DialogTitle>
              <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
                The plan is pending setup — the customer confirms before the first charge.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-low)] p-4 space-y-3">
              <div>
                <div className="label-caps text-[11px] text-[var(--on-surface-variant)]">Plan ID</div>
                <div className="flex items-center gap-2">
                  <div className="data-mono text-sm text-[var(--on-surface)]">{createdId}</div>
                  <CopyButton value={createdId} label="Copy plan ID" />
                </div>
              </div>
              <p className="body-sm text-[var(--on-surface-variant)]">{state.message}</p>
            </div>
            <DialogFooter className="pt-0 gap-2">
              <Button variant="outline" className="border-[var(--border-subtle)]" onClick={resetForAnother}>
                Create another
              </Button>
              <DialogClose
                render={
                  <Button className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)]">
                    Done
                  </Button>
                }
              />
            </DialogFooter>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="headline-md text-[var(--on-surface)]">Create subscription</DialogTitle>
              <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
                Set up a recurring plan for a customer. It starts in pending setup until the customer
                confirms.
              </DialogDescription>
            </DialogHeader>
            <form action={formAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="sub-customer" className="body-sm text-[var(--on-surface-variant)]">
                  Customer
                </Label>
                <NativeSelect
                  id="sub-customer"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]"
                >
                  <NativeSelectOption value="" disabled>
                    Pick a customer…
                  </NativeSelectOption>
                  {customers.map((c) => (
                    <NativeSelectOption key={c.email} value={c.email}>
                      {c.name} — {c.email}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <input type="hidden" name="customerEmail" value={customerEmail} />
                <input type="hidden" name="customerName" value={selected?.name ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sub-plan-name" className="body-sm text-[var(--on-surface-variant)]">
                  Plan name
                </Label>
                <Input
                  id="sub-plan-name"
                  name="planName"
                  placeholder="e.g. Growth"
                  className="border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sub-amount" className="body-sm text-[var(--on-surface-variant)]">
                    Amount (IDR)
                  </Label>
                  <Input
                    id="sub-amount"
                    name="amount"
                    inputMode="numeric"
                    placeholder="e.g. 5,000,000"
                    className="data-mono border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sub-interval" className="body-sm text-[var(--on-surface-variant)]">
                    Billing interval
                  </Label>
                  <NativeSelect
                    id="sub-interval"
                    name="interval"
                    defaultValue="monthly"
                    className="w-full border-[var(--outline-variant)] bg-[var(--surface)] text-[var(--on-surface)]"
                  >
                    <NativeSelectOption value="monthly">Monthly</NativeSelectOption>
                    <NativeSelectOption value="yearly">Yearly</NativeSelectOption>
                  </NativeSelect>
                </div>
              </div>
              {state.status === "error" ? (
                <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                  {state.message}
                </p>
              ) : null}
              <DialogFooter className="pt-2 gap-2">
                <DialogClose
                  render={
                    <Button type="button" variant="outline" className="border-[var(--border-subtle)]">
                      Cancel
                    </Button>
                  }
                />
                <SubmitPlanButton />
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SubmitPlanButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)]">
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Creating…
        </span>
      ) : (
        "Create plan"
      )}
    </Button>
  );
}
