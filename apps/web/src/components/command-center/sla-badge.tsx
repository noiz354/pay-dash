import * as React from "react";

import { cn } from "@/lib/utils";
import { SLA_BAND_LABELS, formatSlaRemaining, type SlaBand } from "@/lib/sla";

// Wave 4 §3 — SLA badge.
//
// One visual vocabulary for the four bands, shared by the Command Center, the
// ledger and the payouts hub so "Overdue" means the same thing everywhere.
// Colours come from the AA-measured `--*-text` tokens added in Wave 4 §7; the
// vivid `--*-status` tokens are used only for the dot and the low-alpha fill,
// where the 4.5:1 text minimum does not apply.
//
// The band is never conveyed by colour alone (WCAG 1.4.1): every badge carries a
// text label and an icon, and the countdown is rendered as text.

const BAND_STYLES: Record<SlaBand, { className: string; icon: string; dot: string }> = {
  NORMAL: {
    className: "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--sla-normal-text)]",
    icon: "check_circle",
    dot: "bg-[var(--success-status)]",
  },
  APPROACHING: {
    className: "border-[var(--pending-status)]/40 bg-[var(--pending-status)]/10 text-[var(--sla-approaching-text)]",
    icon: "schedule",
    dot: "bg-[var(--pending-status)]",
  },
  OVERDUE: {
    className: "border-[var(--failed-status)]/40 bg-[var(--failed-status)]/10 text-[var(--sla-overdue-text)]",
    icon: "timer_off",
    dot: "bg-[var(--failed-status)]",
  },
  CRITICAL: {
    className: "border-[var(--critical-text)]/50 bg-[var(--critical-text)]/12 text-[var(--sla-critical-text)]",
    icon: "emergency",
    dot: "bg-[var(--critical-text)]",
  },
};

export type SlaBadgeProps = {
  band: SlaBand;
  /** Seconds until due; negative once overdue. Renders the countdown when given. */
  remainingSeconds?: number | null;
  /** Render only the dot + countdown, for tight table cells. */
  compact?: boolean;
  className?: string;
};

export function SlaBadge({ band, remainingSeconds, compact = false, className }: SlaBadgeProps) {
  const style = BAND_STYLES[band];
  const countdown = typeof remainingSeconds === "number" ? formatSlaRemaining(remainingSeconds) : null;
  const label = SLA_BAND_LABELS[band];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        style.className,
        className,
      )}
      data-testid={`sla-badge-${band.toLowerCase()}`}
      data-sla-band={band}
      title={`${label}${countdown ? ` — ${countdown}` : ""}`}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", style.dot)} aria-hidden="true" />
      {!compact ? (
        <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
          {style.icon}
        </span>
      ) : null}
      <span>{compact && countdown ? countdown : label}</span>
      {!compact && countdown ? <span className="font-normal opacity-80">· {countdown}</span> : null}
      {/* Screen readers get the full sentence; the visual parts are decorative. */}
      <span className="sr-only">{countdown ? `${label}, ${countdown}` : label}</span>
    </span>
  );
}

/**
 * Sortable table header affordance for the SLA column. Kept here so every list
 * screen sorts SLA the same way (worst band first, then oldest).
 */
export function SlaSortHint({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
  if (!active) return null;
  return (
    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
      {direction === "asc" ? "arrow_upward" : "arrow_downward"}
    </span>
  );
}
