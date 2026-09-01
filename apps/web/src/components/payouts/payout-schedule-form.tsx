"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import {
  PAYOUT_CADENCES,
  PAYOUT_CADENCE_LABELS,
  WEEKDAYS,
  parseAmount,
  type PayoutCadence,
  type Weekday,
} from "@/lib/payout-status";
import { updatePayoutScheduleAction, type ActionState } from "@/server/actions/payouts";
import { formatMoney } from "@/lib/format";

export type ScheduleFormValues = {
  automated: boolean;
  cadence: PayoutCadence;
  weekday: Weekday;
  monthDay: number;
  minimumAmount: number;
  currency: string;
  notifyInitiated: boolean;
  notifyCompleted: boolean;
  notifyFailed: boolean;
  updatedAt: string | null;
};

const initialState: ActionState = { status: "idle", message: "" };

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || !dirty}
      aria-disabled={pending || !dirty}
      className="bg-[var(--primary)] px-4 py-2 body-md font-medium text-[var(--on-primary)] shadow-sm disabled:opacity-50"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <Spinner className="size-4" /> Saving…
        </span>
      ) : (
        "Save Changes"
      )}
    </Button>
  );
}

/**
 * Payout schedule as a real form.
 * The prototype had an uncontrolled switch, a radio group, a comma-string
 * amount field and Discard/Save buttons with no handlers. This keeps the same
 * controls but adds dirty tracking, a conditional day picker (the follow-up
 * question weekly/monthly always implied), amount parsing and validation.
 */
export function PayoutScheduleForm({ settings }: { settings: ScheduleFormValues }) {
  const [state, formAction] = useActionState(updatePayoutScheduleAction, initialState);
  const [values, setValues] = React.useState(settings);
  const [baseline, setBaseline] = React.useState(settings);
  const [amountText, setAmountText] = React.useState(settings.minimumAmount.toLocaleString("en-US"));
  const handled = React.useRef<ActionState | null>(null);

  React.useEffect(() => {
    setValues(settings);
    setBaseline(settings);
    setAmountText(settings.minimumAmount.toLocaleString("en-US"));
  }, [settings]);

  const parsedAmount = parseAmount(amountText);
  const dirty =
    (Object.keys(baseline) as (keyof ScheduleFormValues)[]).some((k) => values[k] !== baseline[k]) ||
    parsedAmount !== baseline.minimumAmount;

  React.useEffect(() => {
    if (state === handled.current || state.status === "idle") return;
    handled.current = state;
    if (state.status === "success") {
      setBaseline({ ...values, minimumAmount: parsedAmount ?? values.minimumAmount });
      toast.success(state.message);
    } else {
      toast.error(state.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const set = <K extends keyof ScheduleFormValues>(key: K, value: ScheduleFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const reset = () => {
    setValues(baseline);
    setAmountText(baseline.minimumAmount.toLocaleString("en-US"));
  };

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="automated" value={values.automated ? "on" : "off"} />
      <input type="hidden" name="cadence" value={values.cadence} />
      <input type="hidden" name="weekday" value={values.weekday} />
      <input type="hidden" name="monthDay" value={values.monthDay} />
      <input type="hidden" name="notifyInitiated" value={values.notifyInitiated ? "on" : "off"} />
      <input type="hidden" name="notifyCompleted" value={values.notifyCompleted ? "on" : "off"} />
      <input type="hidden" name="notifyFailed" value={values.notifyFailed ? "on" : "off"} />

      <section className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="headline-md flex items-center gap-2 text-[var(--on-surface)]">
              <span className="material-symbols-outlined text-[var(--primary)]" aria-hidden="true">
                schedule
              </span>
              Automated Payouts
            </h2>
            <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
              Release the available balance on a fixed cadence instead of manually.
            </p>
          </div>
          <Switch
            id="auto-payout-toggle"
            aria-label="Automated Payouts toggle"
            checked={values.automated}
            onCheckedChange={(checked: boolean) => set("automated", checked)}
          />
        </div>

        <fieldset disabled={!values.automated} className="space-y-6 disabled:opacity-50">
          <div>
            <Label className="label-caps text-[var(--on-surface-variant)]">Payout schedule</Label>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Payout Schedule">
              {PAYOUT_CADENCES.map((cadence) => (
                <button
                  key={cadence}
                  type="button"
                  role="radio"
                  aria-checked={values.cadence === cadence}
                  onClick={() => set("cadence", cadence)}
                  className={
                    values.cadence === cadence
                      ? "label-md rounded-lg border-2 border-[var(--primary)] bg-[var(--primary)]/5 px-3 py-2 text-[var(--primary)]"
                      : "label-md rounded-lg border border-[var(--outline-variant)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
                  }
                >
                  {PAYOUT_CADENCE_LABELS[cadence]}
                </button>
              ))}
            </div>
            {state.fieldErrors?.cadence ? (
              <p className="body-sm mt-1 text-xs text-[var(--failed-status)]" role="alert">
                {state.fieldErrors.cadence[0]}
              </p>
            ) : null}
          </div>

          {values.cadence === "weekly" ? (
            <div className="space-y-1">
              <Label htmlFor="payout-weekday" className="label-caps text-[var(--on-surface-variant)]">
                Day of the week
              </Label>
              <NativeSelect
                id="payout-weekday"
                className="w-full sm:w-64"
                value={values.weekday}
                onChange={(e) => set("weekday", e.target.value as Weekday)}
              >
                {WEEKDAYS.map((day) => (
                  <NativeSelectOption key={day} value={day}>
                    {day}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          ) : null}

          {values.cadence === "monthly" ? (
            <div className="space-y-1">
              <Label htmlFor="payout-monthday" className="label-caps text-[var(--on-surface-variant)]">
                Day of the month
              </Label>
              <Input
                id="payout-monthday"
                type="number"
                min={1}
                max={28}
                value={values.monthDay}
                onChange={(e) => set("monthDay", Number(e.target.value))}
                className="h-9 w-32 border-[var(--outline-variant)] bg-white data-mono"
              />
              <p className="body-sm text-xs text-[var(--on-surface-variant)]">
                Capped at 28 so every month has the day.
              </p>
              {state.fieldErrors?.monthDay ? (
                <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                  {state.fieldErrors.monthDay[0]}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="min-payout" className="label-caps text-[var(--on-surface-variant)]">
              Minimum payout amount
            </Label>
            <div className="relative w-full sm:w-72">
              <span className="body-sm absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]">
                Rp
              </span>
              <Input
                id="min-payout"
                name="minimumAmount"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                onBlur={() => {
                  const parsed = parseAmount(amountText);
                  if (parsed !== null) setAmountText(parsed.toLocaleString("en-US"));
                }}
                placeholder="10,000"
                aria-label="Minimum Payout Amount"
                aria-invalid={parsedAmount === null}
                className="w-full rounded-md border-[var(--outline-variant)] bg-white py-2 pl-10 pr-3 data-mono text-sm text-[var(--on-surface)]"
              />
            </div>
            <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
              {parsedAmount === null
                ? "Enter an amount, e.g. 50,000"
                : `Payouts trigger once the balance reaches ${formatMoney(parsedAmount, values.currency)}.`}
            </p>
            {state.fieldErrors?.minimumAmount ? (
              <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
                {state.fieldErrors.minimumAmount[0]}
              </p>
            ) : null}
          </div>
        </fieldset>
      </section>

      <section className="rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-6">
        <h2 className="headline-md mb-6 flex items-center gap-2 text-[var(--on-surface)]">
          <span className="material-symbols-outlined text-[var(--primary)]" aria-hidden="true">
            notifications_active
          </span>
          Email Notifications
        </h2>
        <div className="space-y-4">
          {(
            [
              ["notifyInitiated", "Payout initiated", "Receive an email when processing begins."],
              ["notifyCompleted", "Payout completed", "Receive an email when funds settle."],
              ["notifyFailed", "Payout failed or returned", "Receive an email when a transfer is rejected."],
            ] as const
          ).map(([key, label, description]) => (
            <div key={key} className="flex items-start gap-3">
              <Checkbox
                id={key}
                checked={values[key]}
                onCheckedChange={(checked: boolean) => set(key, Boolean(checked))}
                aria-label={label}
                className="mt-1 border-[var(--outline-variant)]"
              />
              <div className="leading-6">
                <Label htmlFor={key} className="body-md font-medium text-[var(--on-surface)]">
                  {label}
                </Label>
                <p className="body-sm text-[var(--on-surface-variant)]">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--border-subtle)] pt-4">
        <span className="body-sm mr-auto text-[var(--on-surface-variant)]" role="status" aria-live="polite">
          {dirty
            ? "Unsaved changes"
            : baseline.updatedAt
              ? `Saved ${new Date(baseline.updatedAt).toLocaleTimeString()}`
              : "All changes saved"}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={!dirty}
          onClick={reset}
          className="border-[var(--outline-variant)] px-4 py-2 body-md font-medium text-[var(--on-surface)] disabled:opacity-50"
        >
          Discard
        </Button>
        <SaveButton dirty={dirty} />
      </div>
    </form>
  );
}
