"use client";

import * as React from "react";
import { CopyButton } from "@/components/common/copy-button";
import { Button } from "@/components/ui/button";

/**
 * Reveal-once secret panel.
 * Plaintext secrets exist for exactly one render — the store only keeps a mask.
 * The panel makes that contract visible: blurred by default, one reveal, one
 * copy, and an explicit acknowledgement before it can be dismissed.
 */
export function SecretReveal({
  secret,
  onAcknowledge,
  acknowledgeLabel = "I have stored it safely",
}: {
  secret: string;
  onAcknowledge?: () => void;
  acknowledgeLabel?: string;
}) {
  const [revealed, setRevealed] = React.useState(false);

  return (
    <div className="space-y-3 rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] p-4">
      <div className="flex items-start gap-2">
        <span className="material-symbols-outlined text-[18px] text-[var(--on-surface-variant)]" aria-hidden="true">
          warning
        </span>
        <p className="body-sm text-[var(--on-surface-variant)]">
          This secret is shown once. Store it in your secret manager now — we only keep a masked copy.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <code
          data-testid="secret-value"
          className={`data-mono flex-1 truncate rounded bg-[var(--surface-container-high)] px-3 py-2 text-sm text-[var(--on-surface)] ${
            revealed ? "" : "blur-sm select-none"
          }`}
        >
          {secret}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 border-[var(--border-subtle)]"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? "Hide secret" : "Reveal secret"}
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            {revealed ? "visibility_off" : "visibility"}
          </span>
        </Button>
        <CopyButton value={secret} label="Copy" />
      </div>

      {onAcknowledge ? (
        <Button
          type="button"
          className="h-9 w-full bg-[var(--primary)] text-[var(--on-primary)]"
          onClick={onAcknowledge}
        >
          {acknowledgeLabel}
        </Button>
      ) : null}
    </div>
  );
}
