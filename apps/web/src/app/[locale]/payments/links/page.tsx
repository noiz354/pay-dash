import { Suspense } from "react";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { TableSkeleton } from "@/components/common/table-skeleton";
import { SectionBoundary } from "@/components/common/section-boundary";
import { LinksFilters } from "@/components/links/links-filters";
import { LinksTable } from "@/components/links/links-table";
import { LinksKindTabs } from "@/components/links/links-kind-tabs";
import { CreateLinkDialog } from "@/components/links/create-link-dialog";
import { listLinks } from "@/server/data/links";
import type { LinkKind } from "@/server/data/links";
import { LINK_STATUSES } from "@/lib/link-status";
import type { LinkStatus } from "@/lib/link-status";

// Payment Links (ADR-0013). The prototype page shipped four hardcoded rows
// with a literal ",250.00" amount, dead "#" tabs and a "24 results" counter
// with no page behind it. Everything here is now the store: derived status
// (cancelled → paid → expired → open), URL filters, real pagination, and a
// detail page for every row.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment Links — Kinetic Ledger",
  description: "Create and track single-amount and multi-item payment links; status is derived from the ledger.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function kindOf(v: string | undefined): LinkKind {
  return v === "multiple" ? "multiple" : "single";
}

function statusOf(v: string | undefined): LinkStatus | "all" {
  return v && (LINK_STATUSES as readonly string[]).includes(v) ? (v as LinkStatus) : "all";
}

// Awaited inside the streaming child; a stable key on the Suspense boundary
// (see the page export) makes filter changes re-fire with a skeleton.
async function LinksList({ searchParams, kind }: { searchParams: SearchParams; kind: LinkKind }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const status = statusOf(one(sp.status));

  const data = listLinks({
    q,
    status,
    kind,
    page: Number(one(sp.page) ?? 1) || 1,
    pageSize: 10,
  });

  const hasFilters = q.trim().length > 0 || status !== "all";

  return (
    <>
      <LinksFilters resultCount={data.total} />
      <LinksTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageCount={data.pageCount}
        pageSize={data.pageSize}
        kind={kind}
        hasFilters={hasFilters}
      />
    </>
  );
}

export default async function PaymentLinksPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const kind = kindOf(one(sp.kind));
  const newOpen = one(sp.new) === "1";
  const key = new URLSearchParams(
    Object.entries(sp).map(([k, v]) => [k, String(one(v) ?? "")])
  ).toString();

  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Payment Links</h1>
          <p className="body-md text-[var(--on-surface-variant)] mt-1">
            Send a customer a link; when they pay, the ledger records it and the link flips to paid on its own.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Suspense
            fallback={
              <div className="h-9 w-32 rounded-lg animate-pulse bg-[var(--surface-container-low)]" aria-hidden="true" />
            }
          >
            <CreateLinkDialog kind={kind} defaultOpen={newOpen} triggerLabel="New link" />
          </Suspense>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] shadow-sm">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 bg-[var(--surface-canvas)]">
          <h2 className="headline-md text-[var(--on-surface)]">Links</h2>
          <Suspense fallback={null}>
            <LinksKindTabs kind={kind} />
          </Suspense>
        </div>
        <SectionBoundary title="Payment links unavailable">
          <Suspense key={key} fallback={<TableSkeleton rows={8} columns={6} />}>
            <LinksList searchParams={searchParams} kind={kind} />
          </Suspense>
        </SectionBoundary>
      </section>

      <p className="body-sm text-[var(--on-surface-variant)]">
        TEST MODE — links you simulate settle immediately.{" "}
        <Link href="/transactions" className="text-[var(--primary)] hover:underline">
          View the full ledger
        </Link>
      </p>
    </main>
  );
}
