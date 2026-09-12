"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { TimelineEntry } from "@/server/data/timeline";

/**
 * Canonical Timeline — CMP-009
 * 
 * Single-event model with deterministic dedupe
 * Actor, action, state change, timestamp, reason
 * No duplicate entries (e.g., "Refund issued" appears once)
 */

export interface TimelineProps {
  /** Timeline entries */
  entries: TimelineEntry[];
  /** Whether to show compact view */
  compact?: boolean;
}

/**
 * Action types and their display properties
 */
const ACTION_CONFIG: Record<string, {
  label: string;
  icon: string;
  badgeVariant: "success" | "pending" | "failed" | "info";
}> = {
  // Payment actions
  PAYMENT_CREATED: { label: "Payment created", icon: "add", badgeVariant: "info" },
  PAYMENT_PENDING: { label: "Payment pending", icon: "pending", badgeVariant: "pending" },
  PAYMENT_SUCCEEDED: { label: "Payment succeeded", icon: "check_circle", badgeVariant: "success" },
  PAYMENT_FAILED: { label: "Payment failed", icon: "error", badgeVariant: "failed" },
  PAYMENT_RETRIED: { label: "Payment retried", icon: "replay", badgeVariant: "pending" },
  
  // Payout actions
  PAYOUT_CREATED: { label: "Payout created", icon: "add", badgeVariant: "info" },
  PAYOUT_PENDING: { label: "Payout pending", icon: "pending", badgeVariant: "pending" },
  PAYOUT_APPROVED: { label: "Payout approved", icon: "check", badgeVariant: "success" },
  PAYOUT_PROCESSING: { label: "Payout processing", icon: "sync", badgeVariant: "pending" },
  PAYOUT_PAID: { label: "Payout paid", icon: "check_circle", badgeVariant: "success" },
  PAYOUT_PARTIAL: { label: "Payout partial", icon: "warning", badgeVariant: "failed" },
  PAYOUT_FAILED: { label: "Payout failed", icon: "error", badgeVariant: "failed" },
  PAYOUT_CANCELLED: { label: "Payout cancelled", icon: "cancel", badgeVariant: "failed" },
  PAYOUT_RETRIED: { label: "Payout retried", icon: "replay", badgeVariant: "pending" },
  
  // Refund actions
  REFUND_REQUESTED: { label: "Refund requested", icon: "account_balance_wallet", badgeVariant: "pending" },
  REFUND_APPROVED: { label: "Refund approved", icon: "check", badgeVariant: "success" },
  REFUND_EXECUTED: { label: "Refund executed", icon: "check_circle", badgeVariant: "success" },
  REFUND_FAILED: { label: "Refund failed", icon: "error", badgeVariant: "failed" },
  
  // Blocklist actions
  BLOCKLIST_ADDED: { label: "Added to blocklist", icon: "block", badgeVariant: "failed" },
  BLOCKLIST_REMOVED: { label: "Removed from blocklist", icon: "check", badgeVariant: "success" },
  
  // KYC actions
  KYC_UPLOADED: { label: "KYC uploaded", icon: "upload", badgeVariant: "info" },
  KYC_SUBMITTED: { label: "KYC submitted", icon: "send", badgeVariant: "pending" },
  KYC_APPROVED: { label: "KYC approved", icon: "verified_user", badgeVariant: "success" },
  KYC_REJECTED: { label: "KYC rejected", icon: "cancel", badgeVariant: "failed" },
  
  // Webhook actions
  WEBHOOK_RECEIVED: { label: "Webhook received", icon: "call_received", badgeVariant: "success" },
  WEBHOOK_DUPLICATED: { label: "Webhook duplicated", icon: "content_copy", badgeVariant: "info" },
  WEBHOOK_REJECTED: { label: "Webhook rejected", icon: "block", badgeVariant: "failed" },
  WEBHOOK_REPLAYED: { label: "Webhook replayed", icon: "replay", badgeVariant: "info" },
  
  // Default
  UNKNOWN: { label: "Unknown", icon: "help", badgeVariant: "info" },
};

/**
 * Badge variants
 */
const BADGE_VARIANTS = {
  success: "bg-[var(--success-status)]/10 text-[var(--success-status)] border-[var(--success-status)]",
  pending: "bg-[var(--pending-status)]/10 text-[var(--pending-status)] border-[var(--pending-status)]",
  failed: "bg-[var(--failed-status)]/10 text-[var(--failed-status)] border-[var(--failed-status)]",
  info: "bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] border-[var(--border-subtle)]",
} as const;

/**
 * Format date for display
 */
function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Timeline Entry component
 */
function TimelineEntry({ entry, compact = false }: { entry: TimelineEntry; compact?: boolean }) {
  const config = ACTION_CONFIG[entry.action] ?? ACTION_CONFIG.UNKNOWN;

  return (
    <li className="relative pl-6">
      {/* Connector line */}
      <div 
        className="absolute left-3 top-0 bottom-0 w-0.5 bg-[var(--border-subtle)]" 
        aria-hidden="true"
      />
      
      {/* Icon */}
      <div 
        className="absolute left-0 top-1 h-6 w-6 rounded-full bg-[var(--surface)] flex items-center justify-center border-2"
        style={{ borderColor: `var(--${config.badgeVariant === "success" ? "success-status" : config.badgeVariant === "failed" ? "failed-status" : "pending-status"})` }}
      >
        <span 
          className={`material-symbols-outlined text-[14px] ${config.badgeVariant === "success" ? "text-[var(--success-status)]" : config.badgeVariant === "failed" ? "text-[var(--failed-status)]" : "text-[var(--pending-status)]"}`}
          aria-hidden="true"
        >
          {config.icon}
        </span>
      </div>
      
      {/* Content */}
      <div className="pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge 
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold label-caps border ${BADGE_VARIANTS[config.badgeVariant]}`}
          >
            {config.label}
          </Badge>
          <span className="body-sm text-[var(--on-surface-variant)]">
            {formatDate(entry.timestamp)}
          </span>
        </div>
        
        {/* Actor */}
        {entry.actor && (
          <div className="body-sm text-[var(--on-surface-variant)] mt-1">
            by {entry.actor}
          </div>
        )}
        
        {/* Reason */}
        {entry.reason && (
          <div className="body-sm text-[var(--on-surface)] mt-1">
            {entry.reason}
          </div>
        )}
        
        {/* State change */}
        {entry.fromState && entry.toState && (
          <div className="body-sm text-[var(--on-surface-variant)] mt-1">
            State: <span className="text-[var(--on-surface)]">{entry.fromState}</span> → <span className="text-[var(--on-surface)]">{entry.toState}</span>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Main Timeline component
 */
export function Timeline({ entries, compact = false }: TimelineProps) {
  // Deduplicate entries (deterministic dedupe by hash)
  const seen = new Set<string>();
  const dedupedEntries = entries.filter((entry) => {
    const key = `${entry.action}:${entry.entityId}:${entry.timestamp}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  // Sort by timestamp (newest first)
  const sortedEntries = [...dedupedEntries].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    return bTime - aTime; // Newest first
  });

  if (sortedEntries.length === 0) {
    return (
      <div className="text-center py-8">
        <span className="material-symbols-outlined text-[48px] text-[var(--on-surface-variant)]" aria-hidden="true">
          timeline
        </span>
        <p className="body-sm text-[var(--on-surface-variant)] mt-2">
          No timeline events yet
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <ul className="list-none m-0 p-0">
        {sortedEntries.map((entry) => (
          <TimelineEntry key={`${entry.id}-${entry.timestamp}`} entry={entry} compact={compact} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Compact timeline (single line per entry)
 */
export function CompactTimeline({ entries }: TimelineProps) {
  const seen = new Set<string>();
  const dedupedEntries = entries.filter((entry) => {
    const key = `${entry.action}:${entry.entityId}:${entry.timestamp}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const sortedEntries = [...dedupedEntries].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    return bTime - aTime;
  });

  return (
    <div className="flex flex-wrap gap-2">
      {sortedEntries.map((entry) => {
        const config = ACTION_CONFIG[entry.action] ?? ACTION_CONFIG.UNKNOWN;
        return (
          <Badge 
            key={`${entry.id}-${entry.timestamp}`}
            className={`rounded-full px-3 py-1 body-sm ${BADGE_VARIANTS[config.badgeVariant]}`}
          >
            <span className="material-symbols-outlined text-[14px] mr-1" aria-hidden="true">
              {config.icon}
            </span>
            {config.label}
          </Badge>
        );
      })}
    </div>
  );
}
