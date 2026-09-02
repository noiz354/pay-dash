"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { formatMoney } from "@/lib/format";
import {
  saveVolumeDraftAction,
  setVolumeEnabledAction,
  type ActionState,
} from "@/server/actions/risk";
import type { RiskOverview } from "@/server/data/risk";

const initialState: ActionState = { status: "idle", message: "" };

// Global Volume Limits (ADR-0023) — the prototype's USD inputs, now IDR,
// drafted on save, enabled via the card switch. Cap usage under each field
// is derived from the ledger's settled volume.
export function VolumeLimitsCard({ overview }: { overview: RiskOverview }) {
  const { effective, usage } = overview;
  const router = useRouter();
  const [state, formAction] = useActionState(saveVolumeDraftAction, initialState);

  const [switchBusy, setSwitchBusy] = React.useState(false);
  const toggleEnabled = (enabled: boolean) => {
    if (switchBusy) return;
    setSwitchBusy(true);
    const fd = new FormData();
    fd.set("enabled", String(enabled));
    setVolumeEnabledAction(undefined, fd)
      .then((res) => {
        if (res.status === "success") toast.success(res.message);
        else toast.error(res.message);
        router.refresh();
      })
      .finally(() => setSwitchBusy(false));
  };

  return (
    <Card className="overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between bg-[var(--surface-container-low)] px-4 py-3">
        <CardTitle className="headline-md text-[var(--on-surface)]">Global Volume Limits</CardTitle>
        <Switch
          checked={effective.volumeLimitsEnabled}
          onCheckedChange={toggleEnabled}
          disabled={switchBusy}
          aria-label="Global volume limits enabled"
        />
      </CardHeader>
      <CardContent className="p-4">
        <form action={formAction} className="space-y-5">
          <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="daily-volume" className="body-sm block font-medium text-[var(--on-surface)]">
                Max Daily Volume (IDR)
              </label>
              <p className="body-sm text-[12px] text-[var(--on-surface-variant)]">
                Total settled value per 24h rolling window — currently {usage.dailyPct}% used (
                {formatMoney(usage.dailyVolume24h, "IDR")}).
              </p>
            </div>
            <div className="relative">
              <span
                className="data-mono pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]"
                aria-hidden="true"
              >
                Rp
              </span>
              <Input
                id="daily-volume"
                name="dailyVolumeLimit"
                type="number"
                min={0}
                defaultValue={effective.dailyVolumeLimit}
                aria-label="Max daily volume IDR"
                className="h-9 border-[var(--border-subtle)] bg-[var(--surface)] pl-8 pr-3 text-right data-mono focus-visible:border-[var(--primary)] focus-visible:ring-[var(--primary)]"
              />
            </div>
          </div>
          <hr className="border-[var(--border-subtle)]" />
          <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="monthly-volume" className="body-sm block font-medium text-[var(--on-surface)]">
                Max Monthly Volume (IDR)
              </label>
              <p className="body-sm text-[12px] text-[var(--on-surface-variant)]">
                Hard cap for calendar month processing — currently {usage.monthlyPct}% used (
                {formatMoney(usage.monthlyVolume30d, "IDR")}).
              </p>
            </div>
            <div className="relative">
              <span
                className="data-mono pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]"
                aria-hidden="true"
              >
                Rp
              </span>
              <Input
                id="monthly-volume"
                name="monthlyVolumeLimit"
                type="number"
                min={0}
                defaultValue={effective.monthlyVolumeLimit}
                aria-label="Max monthly volume IDR"
                className="h-9 border-[var(--border-subtle)] bg-[var(--surface)] pl-8 pr-3 text-right data-mono focus-visible:border-[var(--primary)] focus-visible:ring-[var(--primary)]"
              />
            </div>
          </div>
          {state.status === "error" ? (
            <p className="body-sm text-xs text-[var(--failed-status)]" role="alert">
              {state.message}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="body-sm text-xs text-[var(--on-surface-variant)]">
              Changes land in the draft — Deploy Changes makes them live.
            </span>
            <SaveDraftButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SaveDraftButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      className="h-8 shrink-0 border-[var(--outline-variant)]"
    >
      {pending ? <Spinner className="size-3.5" /> : null} Save to draft
    </Button>
  );
}
