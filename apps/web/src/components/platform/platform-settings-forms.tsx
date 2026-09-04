"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { createConnectedAccountAction, createSplitRuleAction, createTransferAction, type PlatformActionState } from "@/server/actions/platform";

const initialState: PlatformActionState<{ id: string }> = { status: "idle", message: "" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? "Submitting…" : label}
    </Button>
  );
}

export function PlatformSettingsForms() {
  const [caState, caAction] = useActionState(createConnectedAccountAction, initialState);
  const [srState, srAction] = useActionState(createSplitRuleAction, initialState);
  const [trState, trAction] = useActionState(createTransferAction, initialState);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form action={caAction} className="rounded-xl border border-[var(--border)] p-4 space-y-3">
        <h3 className="text-sm font-semibold">Connected account (Stripe Connect)</h3>
        <div className="space-y-1">
          <Label htmlFor="ca-email">Account email</Label>
          <Input name="email" id="ca-email" type="email" placeholder="owner@example.com" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ca-type">Account type</Label>
          <NativeSelect name="type" id="ca-type" defaultValue="express">
            <NativeSelectOption value="express">Express</NativeSelectOption>
            <NativeSelectOption value="custom">Custom</NativeSelectOption>
            <NativeSelectOption value="standard">Standard</NativeSelectOption>
          </NativeSelect>
        </div>
        <SubmitButton label="Create connected account" />
        {caState.message && <p className="text-xs text-[var(--muted)]">{caState.message}</p>}
      </form>

      <form action={srAction} className="rounded-xl border border-[var(--border)] p-4 space-y-3">
        <h3 className="text-sm font-semibold">Split rule</h3>
        <div className="space-y-1">
          <Label htmlFor="sr-name">Rule name</Label>
          <Input name="name" id="sr-name" placeholder="Marketplace payout split" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sr-currency">Currency</Label>
          <NativeSelect name="currency" id="sr-currency" defaultValue="IDR">
            <NativeSelectOption value="IDR">IDR</NativeSelectOption>
            <NativeSelectOption value="USD">USD</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sr-destinations">Destinations (JSON array of accountId + percent)</Label>
          <Input name="destinations" id="sr-destinations" placeholder='[{"accountId":"acct_1","percent":70}]' required />
        </div>
        <SubmitButton label="Create split rule" />
        {srState.message && <p className="text-xs text-[var(--muted)]">{srState.message}</p>}
      </form>

      <form action={trAction} className="rounded-xl border border-[var(--border)] p-4 space-y-3">
        <h3 className="text-sm font-semibold">Internal transfer (platform)</h3>
        <div className="space-y-1">
          <Label htmlFor="tr-amount">Amount</Label>
          <Input name="amount" id="tr-amount" placeholder="500000" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tr-destination">Destination account</Label>
          <Input name="destination" id="tr-destination" placeholder="acct_1" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tr-currency">Currency</Label>
          <NativeSelect name="currency" id="tr-currency" defaultValue="IDR">
            <NativeSelectOption value="IDR">IDR</NativeSelectOption>
            <NativeSelectOption value="USD">USD</NativeSelectOption>
          </NativeSelect>
        </div>
        <SubmitButton label="Create transfer" />
        {trState.message && <p className="text-xs text-[var(--muted)]">{trState.message}</p>}
      </form>
    </div>
  );
}
