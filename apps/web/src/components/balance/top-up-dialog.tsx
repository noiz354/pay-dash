"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
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
import { formatMoney } from "@/lib/format";
import { parseAmount } from "@/lib/payout-status";
import { topUpBalanceAction, type ActionState } from "@/server/actions/balance";
import { TOPUP_METHODS } from "@/lib/balance-status";

const initialState: ActionState<{ available: number }> = { status: "idle", message: "" };

function SubmitButton({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || !canSubmit}
      aria-disabled={pending || !canSubmit}
      className="bg-[var(--primary)] text-[var(--on-primary)] disabled:opacity-60"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Adding…
        </span>
      ) : (
        "Add to balance"
      )}
    </Button>
  );
}

/**
 * "Top Up" finally opens something (ADR-0011). The amount lands instantly
 * (TEST MODE) through `topUpBalanceAction` and shows up as a settled TOP_UP
 * movement. Opens itself on `?topup=1` so the empty state and bookmarks can
 * deep link straight in.
 */
export function TopUpDialog({
  triggerLabel = "Top Up",
  triggerClassName,
}: {
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wantsOpen = searchParams.get("topup") === "1";
  const [open, setOpen] = React.useState(wantsOpen);
  const [state, formAction] = useActionState(topUpBalanceAction, initialState);
  const [amountText, setAmountText] = React.useState("");
  const [method, setMethod] = React.useState<string>(TOPUP_METHODS[0]);
  const handled = React.useRef<ActionState<{ available: number }> | null>(null);

  React.useEffect(() => {
    if (wantsOpen) setOpen(true);
  }, [wantsOpen]);

  const close = React.useCallback(() => {
    setOpen(false);
    if (wantsOpen) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("topup");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [pathname, router, searchParams, wantsOpen]);

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      toast.success(state.message, {
        description: `Available balance: ${formatMoney(state.data?.available ?? 0, "IDR")}`,
      });
    } else {
      toast.error(state.message);
    }
  }, [state]);

  const canSubmit = parseAmount(amountText) !== null;
  const succeeded = state.status === "success" && state.data !== undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else close();
      }}
    >
      <DialogTrigger
        render={
          <Button
            aria-label="Top Up"
            className={`h-10 gap-2 bg-[var(--primary)] px-5 text-[var(--on-primary)] shadow-sm hover:bg-[var(--surface-tint)] ${triggerClassName ?? ""}`}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              add_circle
            </span>
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="bg-[var(--surface)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="headline-md text-[var(--on-surface)]">Top up your balance</DialogTitle>
          <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
            TEST MODE — the amount lands instantly; there is no virtual-account wait.
          </DialogDescription>
        </DialogHeader>

        {succeeded ? (
          <div className="space-y-4">
            <p className="body-md font-medium text-[var(--success-status)]" role="status">
              {state.message}
            </p>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4">
              <span className="label-caps text-[var(--on-surface-variant)]">New available balance</span>
              <div className="data-mono headline-lg mt-1 text-[var(--on-surface)]">
                {formatMoney(state.data?.available ?? 0, "IDR")}
              </div>
            </div>
            <DialogFooter className="pt-0">
              <DialogClose
                render={
                  <Button variant="outline" className="border-[var(--border-subtle)]">
                    Done
                  </Button>
                }
              />
            </DialogFooter>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div>
              <Label htmlFor="topup-amount" className="body-sm text-[var(--on-surface)]">
                Amount (IDR)
              </Label>
              <Input
                id="topup-amount"
                name="amount"
                aria-label="Amount"
                inputMode="numeric"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="e.g. 50,000,000"
                className="mt-1 data-mono bg-[var(--surface-canvas)] border-[var(--outline-variant)] text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]"
              />
              {state.fieldErrors?.amount ? (
                <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                  {state.fieldErrors.amount[0]}
                </p>
              ) : (
                <p className="body-sm text-xs text-[var(--on-surface-variant)] mt-1">
                  Top-ups start at {formatMoney(10_000, "IDR")}.
                </p>
              )}
            </div>

            <div>
              <Label className="body-sm text-[var(--on-surface)]">Method</Label>
              <NativeSelect
                name="method"
                aria-label="Top-up method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="mt-1 w-full border-[var(--outline-variant)] bg-[var(--surface-canvas)] text-[var(--on-surface)]"
              >
                {TOPUP_METHODS.map((m) => (
                  <NativeSelectOption key={m} value={m}>
                    {m}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {state.fieldErrors?.method ? (
                <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                  {state.fieldErrors.method[0]}
                </p>
              ) : null}
            </div>

            {state.status === "error" && !state.fieldErrors ? (
              <p className="body-sm text-[var(--failed-status)]" role="alert">
                {state.message}
              </p>
            ) : null}

            <DialogFooter className="pt-1">
              <DialogClose
                render={
                  <Button type="button" variant="outline" className="border-[var(--border-subtle)]">
                    Cancel
                  </Button>
                }
              />
              <SubmitButton canSubmit={canSubmit} />
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
