"use client";

import * as React from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { toggleRuleAction, type ActionState } from "@/server/actions/risk";
import type { VelocityRule } from "@/server/data/risk";

const SCOPE_LABELS: Record<VelocityRule["scope"], string> = {
  GLOBAL: "Global",
  CARD: "Per card",
  CUSTOMER: "Per customer",
};

const WINDOW_LABELS: Record<VelocityRule["window"], string> = {
  hourly: "per hour",
  daily: "per day",
  monthly: "per month",
  per_txn: "per transaction",
};

function thresholdLabel(rule: VelocityRule) {
  return rule.metric === "VOLUME"
    ? `${formatMoney(rule.threshold, "IDR")} ${WINDOW_LABELS[rule.window]}`
    : `${rule.threshold} transactions ${WINDOW_LABELS[rule.window]}`;
}

// The velocity ruleset (ADR-0023) — the page's title finally has a referent.
// Each row switch drafts the rule's enabled state; Deploy Changes makes it
// live. The prototype had no rules at all.
export function RulesTable({ rules }: { rules: VelocityRule[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const toggle = (rule: VelocityRule, enabled: boolean) => {
    if (busyId) return;
    setBusyId(rule.id);
    const fd = new FormData();
    fd.set("id", rule.id);
    fd.set("enabled", String(enabled));
    toggleRuleAction(undefined, fd)
      .then((res) => {
        if (res.status === "success") toast.success(res.message);
        else toast.error(res.message);
        router.refresh();
      })
      .finally(() => setBusyId(null));
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
      <Table>
        <TableHeader className="label-caps bg-[var(--surface-container-low)]">
          <TableRow>
            <TableHead>Rule</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Threshold</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="w-24 text-right">Enabled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => (
            <TableRow key={rule.id} className={rule.enabled ? "" : "opacity-60"}>
              <TableCell>
                <div className="body-sm font-medium text-[var(--on-surface)]">{rule.name}</div>
                <div className="data-mono text-xs text-[var(--on-surface-variant)]">{rule.id}</div>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center rounded bg-[var(--surface-container)] px-2 py-1 text-xs font-medium text-[var(--on-surface)]">
                  {SCOPE_LABELS[rule.scope]}
                </span>
              </TableCell>
              <TableCell className="data-mono text-[var(--on-surface-variant)]">
                {thresholdLabel(rule)}
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                    rule.action === "BLOCK"
                      ? "border-[var(--failed-status)]/20 bg-[var(--failed-status)]/10 text-[var(--failed-status)]"
                      : "border-[var(--pending-status)]/20 bg-[var(--pending-status)]/10 text-[var(--pending-status)]"
                  }`}
                >
                  {rule.action === "BLOCK" ? "Block" : "Alert"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(enabled) => toggle(rule, Boolean(enabled))}
                  disabled={busyId !== null}
                  aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
