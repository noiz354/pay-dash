"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * ConflictDialog — 409 Conflict Recovery (CMP-020)
 * 
 * Explains conflict, shows latest snapshot, allows review and retry
 * Does NOT auto-overwrite — requires user confirmation
 */

export interface ConflictSnapshot {
  /** Human-readable description of the conflict */
  description: string;
  /** Current state of the entity */
  currentState: Record<string, unknown>;
  /** Proposed changes */
  proposedChanges: Record<string, unknown>;
  /** When the conflict was detected */
  detectedAt: Date;
}

export interface ConflictDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Conflict snapshot to display */
  snapshot: ConflictSnapshot;
  /** Callback to retry with latest data */
  onRetry: () => void | Promise<void>;
  /** Callback to review changes (navigate to detail page) */
  onReview?: () => void;
  /** Is retry in progress */
  isRetrying?: boolean;
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return new Intl.NumberFormat("id-ID").format(value);
  }
  if (value instanceof Date) {
    return value.toLocaleString("id-ID");
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return JSON.stringify(value);
}

/**
 * Display a diff-like view of changes
 */
function ChangeDiff({ label, oldValue, newValue }: { label: string; oldValue: unknown; newValue: unknown }) {
  const hasChange = formatValue(oldValue) !== formatValue(newValue);
  
  if (!hasChange) {
    return null;
  }
  
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-4 py-2 border-b border-[var(--border-subtle)]">
      <span className="body-sm text-[var(--on-surface)]">{label}</span>
      <span className="body-sm text-[var(--failed-status)] line-through">{formatValue(oldValue)}</span>
      <span className="body-sm text-[var(--success-status)] font-medium">{formatValue(newValue)}</span>
    </div>
  );
}

export function ConflictDialog({
  open,
  onClose,
  snapshot,
  onRetry,
  onReview,
  isRetrying = false,
}: ConflictDialogProps) {
  // Extract changes for display
  const changes = Object.entries(snapshot.proposedChanges);
  
  // Calculate time since detection
  const age = Math.floor((Date.now() - snapshot.detectedAt.getTime()) / 1000);
  const ageText = age < 60 
    ? `${age}s ago` 
    : age < 3600 
      ? `${Math.floor(age / 60)}m ago`
      : `${Math.floor(age / 3600)}h ago`;

  return (
    <Dialog open={open} onOpenChange={(newOpen) => !newOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[var(--warning)]" aria-hidden="true">
              warning
            </span>
            Data Conflict Detected
          </DialogTitle>
          <DialogDescription>
            {snapshot.description || "The data has changed since you started editing. Please review the latest state before proceeding."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Conflict info */}
          <div className="flex items-center gap-2 text-sm text-[var(--on-surface-variant)]">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">info</span>
            <span>Detected {ageText}</span>
          </div>

          {/* Current state */}
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4">
            <h3 className="body-sm font-medium text-[var(--on-surface)] mb-3">Current State</h3>
            <pre className="text-xs overflow-x-auto p-2 bg-[var(--surface)] rounded">
              {JSON.stringify(snapshot.currentState, null, 2)}
            </pre>
          </div>

          {/* Proposed changes */}
          {changes.length > 0 && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-4">
              <h3 className="body-sm font-medium text-[var(--on-surface)] mb-3">Your Changes</h3>
              <div className="text-xs space-y-1">
                {changes.map(([key, newValue]) => (
                  <ChangeDiff
                    key={key}
                    label={key}
                    oldValue={snapshot.currentState[key]}
                    newValue={newValue}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-end gap-3">
          {onReview && (
            <Button variant="outline" onClick={onReview}>
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                visibility
              </span>
              Review Details
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={onRetry} 
            disabled={isRetrying}
            className="bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary)]/90"
          >
            {isRetrying ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin" aria-hidden="true">
                  sync
                </span>
                Retrying...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  refresh
                </span>
                Retry with Latest
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook for managing conflict dialog state
 */
export function useConflictDialog() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState<ConflictSnapshot | null>(null);
  const [isRetrying, setIsRetrying] = React.useState(false);

  const open = React.useCallback((newSnapshot: ConflictSnapshot) => {
    setSnapshot(newSnapshot);
    setIsOpen(true);
  }, []);

  const close = React.useCallback(() => {
    setIsOpen(false);
    setSnapshot(null);
    setIsRetrying(false);
  }, []);

  const wrapRetry = React.useCallback((onRetry: () => Promise<void>) => {
    return async () => {
      setIsRetrying(true);
      try {
        await onRetry();
        close();
      } catch (error) {
        setIsRetrying(false);
        // Don't close on error, let user try again
      }
    };
  }, [close]);

  return {
    isOpen,
    snapshot,
    isRetrying,
    open,
    close,
    wrapRetry,
    dialogProps: {
      open: isOpen,
      onClose: close,
      snapshot: snapshot!,
      isRetrying,
    } as ConflictDialogProps,
  };
}
