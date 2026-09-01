"use client";

import * as React from "react";
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
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { addBankAccountAction, setDestinationAccountAction } from "@/server/actions/payouts";
import type { BankAccount } from "@/server/data/payouts";

/**
 * "Change" finally changes something.
 * Lists the bank accounts on file, marks the current destination, blocks
 * selecting an unverified account (with the reason visible rather than a silent
 * failure), and lets a new account be added inline.
 */
export function DestinationAccountDialog({
  accounts,
  currentId,
}: {
  accounts: BankAccount[];
  currentId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState(currentId);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  React.useEffect(() => setSelected(currentId), [currentId]);

  const save = async () => {
    setBusy(true);
    const data = new FormData();
    data.set("accountId", selected);
    const result = await setDestinationAccountAction(undefined, data);
    setBusy(false);
    if (result.status === "success") {
      toast.success(result.message);
      setOpen(false);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  };

  const addAccount = async (formData: FormData) => {
    setBusy(true);
    const result = await addBankAccountAction(undefined, formData);
    setBusy(false);
    if (result.status === "success") {
      toast.success(result.message);
      setErrors({});
      setAdding(false);
      router.refresh();
    } else {
      setErrors(result.fieldErrors ?? {});
      if (!result.fieldErrors) toast.error(result.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="px-3 py-1 body-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/10"
          >
            Change
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-[var(--surface)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="headline-md text-[var(--on-surface)]">Destination account</DialogTitle>
          <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
            Payouts settle into this account. Only verified accounts can be selected.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {accounts.map((account) => {
            const disabled = !account.verified;
            return (
              <li key={account.id}>
                <label
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    selected === account.id
                      ? "border-[var(--primary)] bg-[var(--primary)]/5"
                      : "border-[var(--border-subtle)]"
                  } ${disabled ? "opacity-60" : "cursor-pointer"}`}
                >
                  <input
                    type="radio"
                    name="destination"
                    value={account.id}
                    checked={selected === account.id}
                    disabled={disabled}
                    onChange={() => setSelected(account.id)}
                    className="size-4 accent-[var(--primary)]"
                    aria-label={`${account.bank} ${account.masked}`}
                  />
                  <span className="flex-1">
                    <span className="label-md block text-[var(--on-surface)]">{account.bank}</span>
                    <span className="body-sm data-mono block text-xs text-[var(--on-surface-variant)]">
                      {account.masked} · {account.holder}
                    </span>
                  </span>
                  {account.verified ? (
                    <Badge className="bg-[var(--status-success-bg)] text-[var(--success-status)]">Verified</Badge>
                  ) : (
                    <Badge className="bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]">
                      Verifying
                    </Badge>
                  )}
                </label>
              </li>
            );
          })}
        </ul>

        {adding ? (
          <form action={addAccount} className="space-y-3 rounded-lg border border-dashed border-[var(--border-subtle)] p-4">
            <div className="space-y-1">
              <Label htmlFor="new-bank" className="label-caps text-[var(--on-surface-variant)]">Bank</Label>
              <Input id="new-bank" name="bank" placeholder="e.g. Bank Central Asia" className="h-9" />
              {errors.bank ? <p className="body-sm text-xs text-[var(--failed-status)]">{errors.bank[0]}</p> : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-holder" className="label-caps text-[var(--on-surface-variant)]">Account holder</Label>
              <Input id="new-holder" name="holder" placeholder="Acme Corporation LLC" className="h-9" />
              {errors.holder ? <p className="body-sm text-xs text-[var(--failed-status)]">{errors.holder[0]}</p> : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-number" className="label-caps text-[var(--on-surface-variant)]">Account number</Label>
              <Input id="new-number" name="accountNumber" placeholder="1234567890" className="h-9 data-mono" />
              {errors.accountNumber ? (
                <p className="body-sm text-xs text-[var(--failed-status)]">{errors.accountNumber[0]}</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy} className="bg-[var(--primary)] text-[var(--on-primary)]">
                {busy ? <Spinner className="size-4" /> : "Add account"}
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 border-dashed border-[var(--border-subtle)]"
            onClick={() => setAdding(true)}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              add
            </span>
            Add bank account
          </Button>
        )}

        <DialogFooter className="pt-2">
          <DialogClose
            render={
              <Button type="button" variant="outline" className="border-[var(--border-subtle)]">
                Cancel
              </Button>
            }
          />
          <Button
            type="button"
            onClick={save}
            disabled={busy || selected === currentId}
            aria-disabled={busy || selected === currentId}
            className="min-w-[9rem] bg-[var(--primary)] text-[var(--on-primary)] disabled:opacity-50"
          >
            {busy ? (
              <span className="flex items-center gap-2">
                <Spinner className="size-4" /> Saving…
              </span>
            ) : (
              "Use this account"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
