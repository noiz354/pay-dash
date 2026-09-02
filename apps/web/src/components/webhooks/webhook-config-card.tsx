import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/common/copy-button";
import { KNOWN_WEBHOOK_EVENTS } from "@/lib/webhook-status";

// What the "Monitor Webhooks" setup step is really about: the endpoint that
// receives callbacks and whether its token is configured. The token value
// itself is never rendered — only its presence. Retries and the IP allowlist
// live on /settings/developer (ADR-0009); we link out, not duplicate.
export function WebhookConfigCard({ endpointUrl, tokenConfigured }: { endpointUrl: string; tokenConfigured: boolean }) {
  return (
    <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm">
      <h2 className="headline-md text-[var(--on-surface)] mb-3">Endpoint</h2>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="label-caps text-[11px] text-[var(--on-surface-variant)]">Receives callbacks at</div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className="data-mono text-sm text-[var(--on-surface)] break-all">{endpointUrl}</span>
            <CopyButton value={endpointUrl} label="Copy URL" />
          </div>
          <p className="body-sm text-[var(--on-surface-variant)] mt-2">
            Verify the <span className="data-mono text-xs">x-callback-token</span> on every inbound callback
            (INTEGRATION.md §7), dedupe by event id, respond 200 fast, persist the event.
          </p>
        </div>
        <div className="shrink-0 flex flex-col gap-2 items-start md:items-end">
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium " +
              (tokenConfigured
                ? "border-[var(--success-status)]/20 bg-[var(--success-status)]/10 text-[var(--success-status)]"
                : "border-[var(--pending-status)]/20 bg-[var(--pending-status)]/10 text-[var(--pending-status)]")
            }
          >
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
              {tokenConfigured ? "verified_user" : "warning"}
            </span>
            {tokenConfigured ? "Token configured (value hidden)" : "No token set — dev accepts without verification"}
          </span>
          <Link
            href="/settings/developer"
            className="body-sm text-[var(--primary)] hover:underline"
          >
            Retry policy &amp; IP allowlist →
          </Link>
        </div>
      </div>
      <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
        <span className="label-caps text-[11px] text-[var(--on-surface-variant)]">Handled event types</span>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {KNOWN_WEBHOOK_EVENTS.map((t) => (
            <span
              key={t}
              className="data-mono text-[11px] rounded bg-[var(--surface-container-high)] px-1.5 py-0.5 text-[var(--on-surface-variant)]"
            >
              {t}
            </span>
          ))}
          <span className="data-mono text-[11px] rounded bg-[var(--surface-container-high)] px-1.5 py-0.5 text-[var(--on-surface-variant)] italic">
            …stored as unhandled
          </span>
        </div>
      </div>
    </Card>
  );
}
