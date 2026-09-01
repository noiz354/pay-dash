import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { ExportCsvButton } from "@/components/transactions/export-csv-button";
import { PayoutsSummaryCards } from "@/components/payouts/payouts-summary-cards";
import { BatchUploadDropzone } from "@/components/payouts/batch-upload-dropzone";
import { BatchesTable } from "@/components/payouts/batches-table";
import { getPayoutsOverview, listBatches } from "@/server/data/payouts";

// Bulk payouts workspace. The prototype's numbers were broken literals and its
// dropzone was a decorative div; both now come from (and write to) real data.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bulk Payouts — Kinetic Ledger",
  description: "Upload recipients, review the parse and release a batch.",
};

export default async function BulkPayoutsPage() {
  const [overview, recent] = await Promise.all([
    getPayoutsOverview(),
    listBatches({ sort: "recent", pageSize: 5 }),
  ]);

  return (
    <main className="mx-auto w-full max-w-container-max space-y-6 p-gutter">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-[var(--on-surface-variant)]">
            <Link href="/payouts" className="body-sm transition-colors hover:text-[var(--primary)]">
              Payouts
            </Link>
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              chevron_right
            </span>
            <span className="body-sm font-medium text-[var(--on-surface)]" aria-current="page">
              Bulk Payouts
            </span>
          </nav>
          <h1 className="headline-xl leading-tight text-[var(--on-surface)]">Batch Disbursements</h1>
          <p className="body-md mt-2 max-w-2xl text-[var(--on-surface-variant)]">
            Upload a recipient file, check the parse result, then create the batch. Nothing is paid until you
            release it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportCsvButton label="Export Log" endpoint="/api/exports/payouts" filePrefix="payout-batches" />
          <Link
            href="/payouts/settings"
            className="label-md rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-[var(--on-surface)] hover:bg-[var(--surface-container-low)]"
          >
            Payout settings
          </Link>
        </div>
      </div>

      <PayoutsSummaryCards overview={overview} />

      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-[var(--primary)]" aria-hidden="true">
            upload_file
          </span>
          <h2 className="headline-md text-[var(--on-surface)]">New batch</h2>
        </div>
        <BatchUploadDropzone />
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)]">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="headline-md text-[var(--on-surface)]">Recent batches</h2>
          <Link href="/payouts" className="body-sm text-[var(--primary)] hover:underline">
            View all payouts
          </Link>
        </div>
        <BatchesTable data={recent} />
      </section>
    </main>
  );
}
