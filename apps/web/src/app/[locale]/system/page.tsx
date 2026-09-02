import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { WebhookStatusPill } from "@/components/webhooks/webhook-status-pill";
import { getSystemWebhookSummary } from "@/server/data/webhooks";
import { formatRelative } from "@/lib/format";

// System Status (ADR-0017). The prototype invented an entire observability
// layer — 99.99% uptime, 42ms latency, 15% DB capacity, a 142-deep webhook
// QUEUE (QUEUES.md: no queue exists; the route processes inline), a 24h
// "delivery traffic" chart and a delivery table aimed at merchant URLs
// (api.merchant.com & co. — the outbound fiction ADR-0014 removed from
// /webhooks), plus a "Monitoring Settings" panel whose Save button ran
// e.preventDefault(). This page now states only what the app measures:
// inbound webhook flow, from the store the endpoint writes.
export const metadata: Metadata = {
  title: "System Status — Kinetic Ledger",
  description: "What this deployment measures: inbound webhook flow. Uptime and database health need an APM this app doesn't have.",
};

const OUTCOMES = [
  { key: "received", label: "Received", icon: "rss_feed", tone: "var(--success-status)" },
  { key: "duplicated", label: "Duplicated", icon: "final", tone: "var(--pending-status)" },
  { key: "rejected", label: "Rejected", icon: "cancel", tone: "var(--failed-status)" },
] as const;

export default async function SystemPage() {
  const summary = await getSystemWebhookSummary();

  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">System Status</h1>
          <p className="body-md text-[var(--on-surface-variant)] mt-1">
            Inbound webhook flow, from the log the endpoint writes — the only system data this app has.
          </p>
        </div>
        {summary.lastReceivedAt ? (
          <div
            className="flex items-center gap-2 bg-[var(--surface-container-low)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 shrink-0"
            role="status"
            aria-label={`Last callback ${formatRelative(summary.lastReceivedAt)}`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full bg-[var(--success-status)]"
              aria-hidden="true"
            />
            <span className="data-mono text-xs text-[var(--on-surface)]">
              Last callback {formatRelative(summary.lastReceivedAt)}
            </span>
          </div>
        ) : null}
      </div>

      {/* Last 24 hours, by outcome — real counts from the callback log. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {OUTCOMES.map((o) => (
          <Card key={o.key} className="bg-[var(--surface-container-lowest)] border-[var(--border-subtle)] rounded-xl p-5 shadow-sm">
            <h2 className="label-caps text-[var(--on-surface-variant)] mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]" style={{ color: o.tone }} aria-hidden="true">
                {o.icon}
              </span>
              {o.label}
            </h2>
            <div className="flex items-end gap-2">
              <span className="headline-xl text-[var(--on-surface)] data-mono">
                {summary.last24h[o.key]}
              </span>
              <span className="body-sm text-[var(--on-surface-variant)] mb-1">
                in the last 24h
              </span>
            </div>
            <p className="body-sm text-[var(--on-surface-variant)] mt-2">
              {o.key === "received" && "Verified and stored — the provider sees a 200 and won't retry."}
              {o.key === "duplicated" && "Provider retries of event ids we already held — idempotent no-ops."}
              {o.key === "rejected" && "Refused at the endpoint (token, JSON or payload) — raw body kept."}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Recent callbacks — rows route into the log's detail pages. */}
        <Card className="xl:col-span-8 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-[var(--surface-container-low)]">
            <h2 className="headline-md text-[var(--on-surface)]">Most recent callbacks</h2>
            <Link href="/webhooks" className="body-sm text-[var(--primary)] hover:underline">
              View full log
            </Link>
          </div>
          {summary.recent.length === 0 ? (
            <div className="p-6 body-sm text-[var(--on-surface-variant)]">
              No callbacks recorded yet — the endpoint logs every POST it receives.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {summary.recent.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/webhooks/${e.id}`}
                    data-testid={`system-recent-${e.id}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-[var(--surface-container-low)]/60 transition-colors group"
                  >
                    <WebhookStatusPill status={e.status} className="w-24 justify-center shrink-0" />
                    <span className="data-mono text-xs text-[var(--on-surface)] min-w-0 truncate">{e.type}</span>
                    <span className="data-mono text-[11px] text-[var(--on-surface-variant)] hidden sm:inline min-w-0 truncate">
                      {e.eventId}
                    </span>
                    <span className="body-sm text-[var(--on-surface-variant)] ml-auto shrink-0">
                      {formatRelative(e.receivedAt)}
                    </span>
                    <span
                      className="material-symbols-outlined text-[16px] text-[var(--on-surface-variant)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      aria-hidden="true"
                    >
                      arrow_forward
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* What this page does and doesn't measure — stated, not faked. */}
        <div className="xl:col-span-4 space-y-6">
          <Card className="bg-[var(--surface-container-lowest)] border-[var(--border-subtle)] rounded-xl p-5 shadow-sm">
            <h2 className="headline-md text-[var(--on-surface)] mb-3">What this page measures</h2>
            <ul className="space-y-3 body-sm text-[var(--on-surface-variant)]">
              <li className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[18px] mt-0.5 text-[var(--success-status)]" aria-hidden="true">
                  check
                </span>
                <span>
                  Inbound webhook flow — every callback arriving at{" "}
                  <span className="data-mono text-xs">/api/webhooks/xendit</span> is logged with its
                  outcome (ADR-0014).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[18px] mt-0.5 text-[var(--on-surface-variant)]" aria-hidden="true">
                  hourglass_empty
                </span>
                <span>
                  Uptime, latency and database health — not measured: the app has no APM backing them,
                  so this page refuses to print invented numbers.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="material-symbols-outlined text-[18px] mt-0.5 text-[var(--on-surface-variant)]" aria-hidden="true">
                  playlist_remove
                </span>
                <span>
                  Queue depth — zero by design. Callbacks are processed inline; a queue is QUEUES.md’s
                  next rung, added only when volume demands it.
                </span>
              </li>
            </ul>
            <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] space-y-2">
              <Link href="/settings/developer" className="body-sm text-[var(--primary)] hover:underline flex items-center gap-1">
                Endpoint &amp; token settings
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
              <Link href="/settings/notifications" className="body-sm text-[var(--primary)] hover:underline flex items-center gap-1">
                Notification preferences
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
