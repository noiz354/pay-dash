"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { ROLE_DEFINITIONS, type OrganizationRole, type Permission } from "@/domain/organization/roles";
import { hasPermission } from "@/domain/organization/roles";
import { formatRelative } from "@/lib/format";
import { SLA_BAND_LABELS } from "@/lib/sla";
import type { CommandCenterItem } from "@/lib/command-center";
import { SlaBadge } from "./sla-badge";

// Wave 4 §2 — Command Center lane card.
//
// Every card must be actionable, and "actionable" has two honest forms:
//   - the viewer holds the permission  -> a primary CTA into the filtered queue
//   - the viewer does not              -> who is blocking, and a link to that
//                                         queue anyway (so the journey is visible
//                                         rather than a dead end)
// A disabled button with no explanation is the failure mode this avoids.

const TONE_STYLES: Record<CommandCenterItem["tone"], { accent: string; text: string; count: string }> = {
  critical: {
    accent: "bg-[var(--critical-text)]",
    text: "text-[var(--critical-text)]",
    count: "bg-[var(--critical-text)]/12 text-[var(--critical-text)]",
  },
  warning: {
    accent: "bg-[var(--overdue-text)]",
    text: "text-[var(--overdue-text)]",
    count: "bg-[var(--overdue-text)]/12 text-[var(--overdue-text)]",
  },
  pending: {
    accent: "bg-[var(--pending-text)]",
    text: "text-[var(--pending-text)]",
    count: "bg-[var(--pending-text)]/12 text-[var(--pending-text)]",
  },
  neutral: {
    accent: "bg-[var(--on-surface-variant)]",
    text: "text-[var(--on-surface)]",
    count: "bg-[var(--surface-container-high)] text-[var(--on-surface)]",
  },
  success: {
    accent: "bg-[var(--success-text)]",
    text: "text-[var(--success-text)]",
    count: "bg-[var(--success-text)]/12 text-[var(--success-text)]",
  },
};

/** Human labels for the roles that hold a permission (spec §3 persona names off). */
export function rolesThatCan(permission: Permission): OrganizationRole[] {
  return ROLE_DEFINITIONS.filter((def) => hasPermission(def.value, permission)).map((def) => def.value);
}

export function roleLabelOf(role: OrganizationRole): string {
  return ROLE_DEFINITIONS.find((def) => def.value === role)?.label ?? role;
}

/** "Finance Admin or Owner" — the escalation copy when the viewer cannot act. */
export function blockingRolesLabel(permission: Permission | null): string | null {
  if (!permission) return null;
  const roles = rolesThatCan(permission);
  if (roles.length === 0) return null;
  if (roles.length === 1) return roleLabelOf(roles[0]);
  if (roles.length === 2) return `${roleLabelOf(roles[0])} or ${roleLabelOf(roles[1])}`;
  return `${roleLabelOf(roles[0])} (+${roles.length - 1} more)`;
}

export type CommandCenterCardProps = {
  item: CommandCenterItem;
  /** Called after the card is activated — used for ANA `command_center_action`. */
  onAct?: (item: CommandCenterItem) => void;
};

export const CommandCenterCard = React.memo(function CommandCenterCard({ item, onAct }: CommandCenterCardProps) {
  const tone = TONE_STYLES[item.tone];
  const blocker = item.canAct ? null : blockingRolesLabel(item.permission);

  return (
    <li>
      <Link
        href={item.href}
        onClick={() => onAct?.(item)}
        data-testid={`cc-card-${item.id}`}
        data-can-act={item.canAct ? "true" : "false"}
        aria-label={`${item.title}, ${item.count} ${item.count === 1 ? "item" : "items"}${
          item.slaBand ? `, ${SLA_BAND_LABELS[item.slaBand]}` : ""
        }${blocker ? `, waiting on ${blocker}` : ""}`}
        className={cn(
          "group relative flex h-full flex-col gap-3 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)]",
          "bg-[var(--surface)] p-4 transition-[border-color,box-shadow] duration-[var(--duration-fast)]",
          "hover:border-[var(--primary)]/50 hover:shadow-[var(--shadow-card)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]",
          // Motion is decorative only and already gated by the global
          // prefers-reduced-motion rule in globals.css.
        )}
      >
        {/* Tone accent — a non-colour cue is provided by the icon and label. */}
        <span className={cn("absolute inset-y-0 left-0 w-1", tone.accent)} aria-hidden="true" />

        <div className="flex items-start justify-between gap-3 pl-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className={cn("material-symbols-outlined mt-0.5 text-[20px] shrink-0", tone.text)} aria-hidden="true">
              {item.icon}
            </span>
            <div className="min-w-0">
              <h4 className="truncate body-md font-semibold text-[var(--on-surface)]">{item.title}</h4>
              <p className="mt-0.5 line-clamp-2 body-sm text-[var(--on-surface-variant)]">{item.description}</p>
            </div>
          </div>
          <span
            className={cn("data-mono shrink-0 rounded-full px-2.5 py-1 text-[15px] font-bold leading-none", tone.count)}
            data-testid={`cc-count-${item.id}`}
          >
            {item.count}
            <span className="sr-only"> {item.count === 1 ? "item" : "items"}</span>
          </span>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pl-2">
          {item.slaBand && item.slaBand !== "NORMAL" ? <SlaBadge band={item.slaBand} compact /> : null}

          {item.oldestAgeSeconds !== null && item.oldestAgeSeconds > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--on-surface-variant)]">
              <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                schedule
              </span>
              Oldest {formatRelative(new Date(Date.now() - item.oldestAgeSeconds * 1000).toISOString())}
            </span>
          ) : null}

          {item.samples.length > 0 ? (
            <span className="data-mono truncate text-[11px] text-[var(--on-surface-variant)]" title={item.samples.join(", ")}>
              {item.samples.join(" · ")}
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3 pl-2">
          {item.canAct ? (
            <span className={cn("inline-flex items-center gap-1 body-sm font-semibold", tone.text)}>
              {actionVerb(item)}
              <span className="material-symbols-outlined text-[16px] transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5" aria-hidden="true">
                arrow_forward
              </span>
            </span>
          ) : (
            // Not a dead end: name the blocker and still open the queue.
            <span className="inline-flex items-center gap-1 body-sm text-[var(--on-surface-variant)]">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                lock
              </span>
              Waiting on {blocker ?? "an approver"}
            </span>
          )}
          <span className="sr-only">Opens the filtered queue</span>
        </div>
      </Link>
    </li>
  );
});

function actionVerb(item: CommandCenterItem): string {
  if (item.lane === "recently_completed") return "View activity";
  if (item.permission === "payout.retry") return "Retry";
  if (item.permission === "payout.release") return "Approve";
  if (item.permission === "refund.execute") return "Review refunds";
  if (item.permission === "provider.connect.test") return "Inspect";
  if (item.permission === "audit.read") return "Review";
  if (item.permission === "money_in.create") return "Triage";
  return "Open queue";
}

/** Skeleton card — same box metrics as the real card so CLS stays ≈ 0 (§8). */
export function CommandCenterCardSkeleton() {
  return (
    <li aria-hidden="true">
      <div className="flex h-full flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="size-5 animate-pulse rounded bg-[var(--surface-container-high)]" />
            <div className="space-y-2">
              <div className="h-3.5 w-32 animate-pulse rounded bg-[var(--surface-container-high)]" />
              <div className="h-3 w-44 animate-pulse rounded bg-[var(--surface-container-low)]" />
            </div>
          </div>
          <div className="h-7 w-9 animate-pulse rounded-full bg-[var(--surface-container-high)]" />
        </div>
        <div className="h-5 w-24 animate-pulse rounded-full bg-[var(--surface-container-low)]" />
        <div className="h-4 w-full animate-pulse rounded bg-[var(--surface-container-low)]" />
      </div>
    </li>
  );
}
