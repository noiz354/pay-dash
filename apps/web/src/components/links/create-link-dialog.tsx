"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
import { CopyButton } from "@/components/common/copy-button";
import { createPaymentLinkAction, type ActionState } from "@/server/actions/links";
import { formatMoney } from "@/lib/format";
import { LINK_KIND_LABELS, shareUrlOf } from "@/lib/link-status";
import { cn } from "@/lib/utils";

const initialState: ActionState<{ id: string }> = { status: "idle", message: "" };

interface ItemRow {
  key: string;
  label: string;
  amount: string;
}

function parseRowAmount(value: string) {
  const cleaned = value.replace(/[^\d]/g, "");
  return cleaned ? Number(cleaned) : 0;
}

function newRows(count: number): ItemRow[] {
  return Array.from({ length: count }, (_, i) => ({ key: `row-${Date.now()}-${i}`, label: "", amount: "" }));
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="body-sm text-[var(--failed-status)] text-xs mt-1" role="alert">
      {errors[0]}
    </p>
  );
}

function SubmitButton({ label }: { label: string }) {
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
        label
      )}
    </Button>
  );
}

// Create a payment link — single-amount or multiple line items. The dialog is
// opened by the page's "New link" trigger (`?new=1` deep link) so the flow is
// scriptable and shareable like every other create flow in the app.
export function CreateLinkDialog({
  kind,
  defaultOpen = false,
  triggerLabel = "New link",
}: {
  kind: "single" | "multiple";
  defaultOpen?: boolean;
  triggerLabel?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [state, formAction] = useActionState(createPaymentLinkAction, initialState);
  const [createdId, setCreatedId] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<ItemRow[]>(() => newRows(2));
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const removeNewParam = React.useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has("new")) return;
    params.delete("new");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) removeNewParam();
    },
    [removeNewParam]
  );

  // Success: show the created link inside the dialog; revalidate the list.
  const handled = React.useRef<ActionState<{ id: string }> | null>(null);
  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success" && state.data) {
      setCreatedId(state.data.id);
      router.refresh();
    }
  }, [state, router]);

  const resetForAnother = () => {
    setCreatedId(null);
    setItems(newRows(2));
  };

  const goToLink = (id: string) => {
    onOpenChange(false);
    router.push(`/payments/links/${id}`);
  };

  const total = items.reduce((sum, it) => sum + parseRowAmount(it.amount), 0);

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
              <DialogTitle className="headline-md text-[var(--on-surface)]">Link created</DialogTitle>
              <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
                Send this URL to your customer. Payment on it lands in your ledger automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-low)] p-4 space-y-3">
              <div>
                <div className="label-caps text-[11px] text-[var(--on-surface-variant)]">Link ID</div>
                <div className="data-mono text-sm text-[var(--on-surface)]">{createdId}</div>
              </div>
              <div>
                <div className="label-caps text-[11px] text-[var(--on-surface-variant)]">Checkout URL</div>
                <div className="flex items-center gap-2">
                  <div className="data-mono text-xs text-[var(--on-surface)] truncate">{shareUrlOf(createdId)}</div>
                  <CopyButton value={shareUrlOf(createdId)} label="Copy URL" />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-0 gap-2">
              <Button variant="outline" className="border-[var(--border-subtle)]" onClick={resetForAnother}>
                Create another
              </Button>
              <Button variant="outline" className="border-[var(--border-subtle)]" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Button
                className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--on-primary-fixed-variant)]"
                onClick={() => goToLink(createdId)}
              >
                View link
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="headline-md text-[var(--on-surface)]">
                Create {kind === "single" ? "a single-amount" : "a multiple-item"} link
              </DialogTitle>
              <DialogDescription className="body-sm text-[var(--on-surface-variant)]">
                TEST MODE — no real funds move. {LINK_KIND_LABELS[kind]} links {kind === "single" ? "start at Rp 10,000." : "need two to twenty line items of at least Rp 1,000 each."}
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="kind" value={kind} />

              {kind === "multiple" ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="label-caps text-[var(--on-surface-variant)]">Line items</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={items.length >= 20}
                      className="h-7 px-2 text-[var(--primary)]"
                      onClick={() => setItems((rows) => [...rows, { key: `row-${Date.now()}`, label: "", amount: "" }])}
                    >
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                        add
                      </span>
                      Add item
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {items.map((row, i) => (
                      <div key={row.key} className="flex items-start gap-2">
                        <Input
                          value={row.label}
                          onChange={(e) =>
                            setItems((rows) => rows.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)))
                          }
                          placeholder={`Item ${i + 1} label`}
                          aria-label={`Item ${i + 1} label`}
                          className="h-9 flex-1"
                        />
                        <Input
                          value={row.amount}
                          onChange={(e) =>
                            setItems((rows) => rows.map((r) => (r.key === row.key ? { ...r, amount: e.target.value } : r)))
                          }
                          placeholder="Amount"
                          inputMode="decimal"
                          aria-label={`Item ${i + 1} amount`}
                          className={cn("h-9 w-32 text-right data-mono")}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove item ${i + 1}`}
                          disabled={items.length <= 2}
                          className="h-9 w-9 shrink-0 px-0 text-[var(--on-surface-variant)] hover:text-[var(--failed-status)] disabled:opacity-30"
                          onClick={() => setItems((rows) => rows.filter((r) => r.key !== row.key))}
                        >
                          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                            close
                          </span>
                        </Button>
                      </div>
                    ))}
                  </div>
                  <input type="hidden" name="items" value={JSON.stringify(items)} />
                  <input type="hidden" name="amount" value="0" />
                  <div className="mt-2 flex items-center justify-end gap-2 body-sm text-[var(--on-surface-variant)]">
                    <span>Total</span>
                    <span className="data-mono text-sm font-medium text-[var(--on-surface)]">{formatMoney(total, "IDR")}</span>
                  </div>
                  <FieldError errors={state.fieldErrors?.items} />
                </div>
              ) : (
                <div>
                  <Label htmlFor="link-amount" className="label-caps text-[var(--on-surface-variant)]">
                    Amount
                  </Label>
                  <Input
                    id="link-amount"
                    name="amount"
                    inputMode="decimal"
                    placeholder="5000000"
                    aria-invalid={!!state.fieldErrors?.amount}
                    className="mt-1.5 data-mono text-right"
                  />
                  <FieldError errors={state.fieldErrors?.amount} />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="payerEmail" className="label-caps text-[var(--on-surface-variant)]">
                    Payer email <span className="normal-case text-[var(--outline)]">(optional)</span>
                  </Label>
                  <Input
                    id="payerEmail"
                    name="payerEmail"
                    type="email"
                    placeholder="billing@customer.com"
                    autoComplete="off"
                    className="mt-1.5"
                  />
                  <FieldError errors={state.fieldErrors?.payerEmail} />
                </div>
                <div>
                  <Label htmlFor="expiresIn" className="label-caps text-[var(--on-surface-variant)]">
                    Expires
                  </Label>
                  <NativeSelect id="expiresIn" name="expiresIn" defaultValue="" className="mt-1.5 w-full">
                    <NativeSelectOption value="">No expiry</NativeSelectOption>
                    <NativeSelectOption value="7">7 days</NativeSelectOption>
                    <NativeSelectOption value="30">30 days</NativeSelectOption>
                  </NativeSelect>
                  <FieldError errors={state.fieldErrors?.expiresIn} />
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
                <SubmitButton label="Create link" />
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
