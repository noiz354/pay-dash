import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Link } from "@/i18n/navigation";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { SectionBoundary } from "@/components/common/section-boundary";
import { WebhookFilters } from "@/components/webhooks/webhook-filters";
import { WebhooksTable } from "@/components/webhooks/webhooks-table";
import { WebhookConfigCard } from "@/components/webhooks/webhook-config-card";
import { SimulateWebhookDialog } from "@/components/webhooks/simulate-webhook-dialog";
import { listWebhooks } from "@/server/data/webhooks";
import { env } from "@/lib/env";
import { WEBHOOK_STATUSES } from "@/lib/webhook-status";
import type { WebhookStatus } from "@/lib/webhook-status";

// Webhook Logs (ADR-0014). The prototype page shipped four invented
// "deliveries to api.merchant.com/webhooks/stripe" — but this app RECEIVES
// callbacks (INTEGRATION.md §7, :307). Now the page is the log of inbound
// callbacks the endpoint persists: verified, deduped by event id, stored —
// with TEST MODE simulation/replay standing in for the provider.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Webhook Logs — Kinetic Ledger",
  description: "Every callback arriving at /api/webhooks/xendit — received, duplicated or rejected, with its payload.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function statusOf(v: string | undefined): WebhookStatus | "all" {
  return v && (WEBHOOK_STATUSES as readonly string[]).includes(v) ? (v as WebhookStatus) : "all";
}

// Awaited inside the streaming child; a stable key on the Suspense boundary
// (see the page export) makes filter changes re-fire with a skeleton.
async function WebhookLog({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const status = statusOf(one(sp.status));
  const type = one(sp.type) ?? "all";

  const data = listWebhooks({
    q,
    status,
    type,
    page: Number(one(sp.page) ?? 1) || 1,
    pageSize: 10,
  });

  const hasFilters = q.trim().length > 0 || status !== "all" || type !== "all";

  return (
    <>
      <WebhookFilters resultCount={data.total} />
      <WebhooksTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageCount={data.pageCount}
        pageSize={data.pageSize}
        hasFilters={hasFilters}
      />
    </>
  );
}

export default async function WebhooksPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const simulateOpen = one(sp.simulate) === "1";
  const key = new URLSearchParams(
    Object.entries(sp).map(([k, v]) => [k, String(one(v) ?? "")])
  ).toString();

  // The endpoint URL as this deployment serves it — copyable, never guessed.
  const host = (await headers()).get("host") ?? "localhost:3000";
  const endpointUrl = `https://${host}/api/webhooks/xendit`;

  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Webhook Logs</h1>
          <p className="body-md text-[var(--on-surface-variant)] mt-1">
            Every callback arriving at your endpoint — verified, deduped by event id and stored.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Suspense
            fallback={
              <div className="h-9 w-44 rounded-lg animate-pulse bg-[var(--surface-container-low)]" aria-hidden="true" />
            }
          >
            <SimulateWebhookDialog defaultOpen={simulateOpen} />
          </Suspense>
        </div>
      </div>

      <SectionBoundary title="Endpoint unavailable">
        <WebhookConfigCard endpointUrl={endpointUrl} tokenConfigured={!!env.XENDIT_WEBHOOK_TOKEN} />
      </SectionBoundary>

      <section className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 bg-[var(--surface-canvas)]">
          <h2 className="headline-md text-[var(--on-surface)]">Recent callbacks</h2>
        </div>
        <SectionBoundary title="Webhook logs unavailable">
          <Suspense key={key} fallback={<TableSkeleton rows={8} columns={4} />}>
            <WebhookLog searchParams={searchParams} />
          </Suspense>
        </SectionBoundary>
      </section>

      <p className="body-sm text-[var(--on-surface-variant)]">
        TEST MODE — simulated and replayed callbacks run the same pipeline as real ones.{" "}
        <Link href="/settings/developer" className="text-[var(--primary)] hover:underline">
          Configure retry policy &amp; IP allowlist
        </Link>
      </p>
    </main>
  );
}
