"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
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
import { withdrawBalanceAction, type ActionState } from "@/server/actions/balance";

const initialState: ActionState<{ batchId: string }> = { status: "idle", message: "" };

export type WithdrawAccountOption = {
  id: string;
  bank: string;
  holder: string;
  masked: string;
  verified: boolean;
};

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
          <Spinner className="size-4" /> Withdrawing…
        </span>
      ) : (
        "Withdraw"
      )}
    </Button>
  );
}

/**
 * "Withdraw" finally opens something (ADR-0011). The withdrawal is routed
 * into the payout batch flow — one single-recipient batch created and
 * released through the same gated settlement as every other disbursement —
 * so the batch history and this page can never disagree about the money.
 * Opens itself on `?withdraw=1`.
 */
export function WithdrawDialog({
  accounts,
  available,
  currency = "IDR",
  triggerLabel = "Withdraw",
  triggerClassName,
}: {
  accounts: WithdrawAccountOption[];
  available: number;
  currency?: string;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wantsOpen = searchParams.get("withdraw") === "1";
  const [open, setOpen] = React.useState(wantsOpen);
  const [state, formAction] = useActionState(withdrawBalanceAction, initialState);
  const [amountText, setAmountText] = React.useState("");
  const [accountId, setAccountId] = React.useState(accounts.find((a) => a.verified)?.id ?? accounts[0]?.id ?? "");
  const handled = React.useRef<ActionState<{ batchId: string }> | null>(null);

  React.useEffect(() => {
    if (wantsOpen) setOpen(true);
  }, [wantsOpen]);

  const close = React.useCallback(() => {
    setOpen(false);
    if (wantsOpen) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("withdraw");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [pathname, router, searchParams, wantsOpen]);

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      toast.success(state.message);
    } else {
      toast.error(state.message);
    }
  }, [state]);

  const amount = parseAmount(amountText);
  const canSubmit = amount !== null && accountId !== "";
  const resolved = state.status !== "idle" && state.data !== undefined;

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
            aria-label="Withdraw"
            variant="outline"
            className={`h-10 gap-2 border-[var(--outline-variant)] bg-[var(--surface)] px-5 hover:bg-[var(--surface-container-low)] ${triggerClassName ?? ""}`}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              account_balance_wallet
            </span>
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="bg-[var(--surface)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="headline-md text-[var(--on-surface)]">Withdraw from your balance</DialogTitle>
          <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
            TEST MODE — the transfer is released through the payout batch flow, so it gets a batch
            record like every other disbursement.
          </DialogDescription>
        </DialogHeader>

        {resolved && state.status === "success" ? (
          <div className="space-y-4">
            <p className="body-md font-medium text-[var(--success-status)]" role="status">
              {state.message}
            </p>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4">
              <span className="label-caps text-[var(--on-surface-variant)]">New available balance</span>
              <div className="data-mono headline-lg mt-1 text-[var(--on-surface)]">
                {formatMoney(available, currency)}
              </div>
              <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
                The transfer is auditable as payout batch{" "}
                <span className="data-mono">{state.data?.batchId}</span>.
              </p>
            </div>
            <DialogFooter className="pt-0">
              <DialogClose
                render={
                  <Button variant="outline" className="border-[var(--border-subtle)]">
                    Done
                  </Button>
                }
              />
              <Link href={`/payouts/${state.data?.batchId ?? ""}`}>
                <Button className="bg-[var(--primary)] text-[var(--on-primary)]">View batch</Button>
              </Link>
            </DialogFooter>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="accountId" value={accountId} />

            <div>
              <Label htmlFor="withdraw-amount" className="body-sm text-[var(--on-surface)]">
                Amount (IDR)
              </Label>
              <Input
                id="withdraw-amount"
                name="amount"
                aria-label="Amount"
                inputMode="numeric"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="e.g. 5,000,000"
                className="mt-1 data-mono bg-[var(--surface-canvas)] border-[var(--outline-variant)] text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]"
              />
              {state.fieldErrors?.amount ? (
                <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                  {state.fieldErrors.amount[0]}
                </p>
              ) : (
                <p className="body-sm text-xs text-[var(--on-surface-variant)] mt-1">
                  Available: <span className="data-mono">{formatMoney(available, currency)}</span>
                </p>
              )}
            </div>

            <div>
              <Label className="body-sm text-[var(--on-surface)]">Destination account</Label>
              <NativeSelect
                aria-label="Destination account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="mt-1 w-full border-[var(--outline-variant)] bg-[var(--surface-canvas)] text-[var(--on-surface)]"
              >
                {accounts.map((a) => (
                  <NativeSelectOption key={a.id} value={a.id} disabled={!a.verified}>
                    {a.bank} {a.masked}
                    {a.verified ? "" : " (verifying)"}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {state.fieldErrors?.accountId ? (
                <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                  {state.fieldErrors.accountId[0]}
                </p>
              ) : null}
            </div>

            {state.status === "error" && !state.fieldErrors ? (
              <div className="space-y-2" role="alert">
                <p className="body-sm text-[var(--failed-status)]">{state.message}</p>
                {state.data ? (
                  <Link
                    href={`/payouts/${state.data.batchId}`}
                    className="body-sm font-medium text-[var(--primary)] hover:underline inline-flex items-center gap-1"
                  >
                    View the rejected batch
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                      arrow_forward
                    </span>
                  </Link>
                ) : null}
              </div>
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
