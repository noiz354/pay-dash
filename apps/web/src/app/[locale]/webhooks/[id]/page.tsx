import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/common/copy-button";
import { WebhookStatusPill } from "@/components/webhooks/webhook-status-pill";
import { ReplayWebhookButton } from "@/components/webhooks/replay-webhook-button";
import { getWebhookEvent } from "@/server/data/webhooks";
import { formatDateLong, formatDateTime, formatRelative } from "@/lib/format";
import { WEBHOOK_SOURCE_LABELS, KNOWN_WEBHOOK_EVENTS } from "@/lib/webhook-status";

// Webhook callback detail (ADR-0014) — the destination of every log row.
// Shows what the endpoint did with this callback and the exact payload it
// received; Replay re-POSTs the same event id through the shared pipeline
// (it lands as a DUPLICATED row — the idempotency demo).
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return { title: `${id} — Webhook — Kinetic Ledger` };
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="label-caps text-[var(--on-surface-variant)] shrink-0">{label}</span>
      <span className={`text-right break-words ${mono ? "data-mono text-[var(--on-surface)]" : "body-sm text-[var(--on-surface)]"}`}>
        {value}
      </span>
    </div>
  );
}

function payloadText(payload: unknown): string {
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload, null, 2);
}

export default async function WebhookDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const event = await getWebhookEvent(id);
  if (!event) notFound();

  const known = (KNOWN_WEBHOOK_EVENTS as readonly string[]).includes(event.type);

  return (
    <main className="mx-auto w-full max-w-container-max p-gutter space-y-6 pb-12">
      <Breadcrumb>
        <BreadcrumbList className="body-sm">
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/dashboard">Dashboard</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/webhooks">Webhook logs</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="data-mono">{event.id}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <section className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="headline-xl data-mono text-[var(--on-surface)] break-all">{event.eventId}</h1>
            <WebhookStatusPill status={event.status} />
            <CopyButton value={event.eventId} label="Copy event id" />
          </div>
          <p className="body-md text-[var(--on-surface-variant)] mt-1">
            {event.type} · received {formatDateLong(event.receivedAt)} · {WEBHOOK_SOURCE_LABELS[event.source]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link href="/webhooks">
            <Button variant="outline" className="border-[var(--border-subtle)] gap-1">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                arrow_back
              </span>
              Back to logs
            </Button>
          </Link>
          {event.status !== "REJECTED" ? <ReplayWebhookButton id={event.id} /> : null}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Details */}
        <Card className="lg:col-span-5 bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm">
          <h2 className="headline-md text-[var(--on-surface)] mb-2">Callback details</h2>
          <div className="divide-y divide-[var(--border-subtle)]">
            <Row label="Row id" value={event.id} mono />
            <Row label="Event id" value={event.eventId} mono />
            <Row
              label="Type"
              value={
                <>
                  {event.type}
                  {event.unhandled ? (
                    <span className="block text-[11px] text-[var(--on-surface-variant)]">no handler branch</span>
                  ) : null}
                </>
              }
              mono
            />
            <Row label="Received" value={`${formatDateTime(event.receivedAt)} · ${formatRelative(event.receivedAt)}`} />
            <Row label="Source" value={WEBHOOK_SOURCE_LABELS[event.source]} />
            {event.reason ? <Row label="Reason" value={event.reason} /> : null}
            <Row label="Endpoint" value="/api/webhooks/xendit" mono />
          </div>
        </Card>

        <div className="lg:col-span-7 space-y-6">
          {/* Payload */}
          <Card className="bg-[var(--surface)] border-[var(--border-subtle)] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="headline-md text-[var(--on-surface)]">
                {event.status === "REJECTED" ? "Raw body" : "Payload"}
              </h2>
              <CopyButton value={payloadText(event.payload)} label="Copy" />
            </div>
            <pre className="data-mono text-xs text-[var(--on-surface)] bg-[var(--surface-container-low)] border border-[var(--border-subtle)] rounded-lg p-4 overflow-x-auto max-h-96">
              {payloadText(event.payload) ?? "—"}
            </pre>
            <p className="body-sm text-[var(--on-surface-variant)] mt-2">
              {event.status === "REJECTED"
                ? "The body as it arrived — the endpoint refused it before parsing could produce a payload."
                : known
                  ? "Stored as received; the handler branch for this type is wired in the route (ledger processing is the next phase, per QUEUES.md)."
                  : "Stored as received — no handler branch exists for this type, so it is flagged unhandled."}
            </p>
          </Card>

          {/* Status note */}
          <Card className="border-[var(--border-subtle)] bg-[var(--surface-container-low)]/40 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[22px] mt-0.5 text-[var(--on-surface-variant)]" aria-hidden="true">
                {event.status === "RECEIVED"
                  ? "check_circle"
                  : event.status === "DUPLICATED"
                    ? "final"
                    : "cancel"}
              </span>
              <div>
                <h2 className="headline-md text-[var(--on-surface)]">
                  {event.status === "RECEIVED" && "This callback was received"}
                  {event.status === "DUPLICATED" && "This callback was a duplicate"}
                  {event.status === "REJECTED" && "This callback was rejected"}
                </h2>
                <p className="body-sm text-[var(--on-surface-variant)] mt-1">
                  {event.status === "RECEIVED" &&
                    "The endpoint verified the callback, stored it and (in production) queued its work. The provider sees a 200 and will not retry."}
                  {event.status === "DUPLICATED" &&
                    `The provider retried event id ${event.eventId}, which we already hold — this delivery was the idempotent no-op (200, deduped). The first delivery is the one the ledger would process. ${event.reason ?? ""}`}
                  {event.status === "REJECTED" &&
                    `The endpoint refused this callback: ${event.reason ?? "no reason recorded"}. A 4xx/5xx makes the provider retry — check the token and payload shape on the sending side.`}
                </p>
                {event.status !== "REJECTED" ? (
                  <p className="body-sm text-[var(--on-surface-variant)] mt-2">
                    In TEST MODE, <span className="font-medium text-[var(--on-surface)]">Replay callback</span>{" "}
                    re-POSTs the same event id — watch the log gain a Duplicated row.
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
