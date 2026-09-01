import { Button } from "@/components/ui/button";

export default function BulkPayoutsPage() {
  return (
    <main className="mx-auto w-full max-w-[var(--container-max)] p-[var(--gutter)] space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-[var(--on-surface-variant)]">
            <span className="body-sm">Payments</span>
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_right</span>
            <span className="body-sm font-medium text-[var(--on-surface)]" aria-current="page">Bulk Payouts</span>
          </nav>
          <h1 className="headline-xl leading-tight text-[var(--on-surface)]">Batch Disbursements</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="h-9 gap-2 border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 text-[var(--on-surface)] hover:bg-[var(--surface-container)] body-sm font-medium">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">download</span>
            Export Log
          </Button>
          <Button aria-label="New Batch" className="h-9 gap-2 bg-[var(--primary)] px-4 text-[var(--on-primary)] shadow-sm hover:bg-[var(--on-primary-fixed-variant)] body-sm font-medium active:scale-95">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
            New Batch
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
          <div className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-5">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-container)]">
                  <span className="material-symbols-outlined text-[18px] text-[var(--pending-status)]" aria-hidden="true">pending_actions</span>
                </div>
                <span className="label-caps text-[var(--on-surface-variant)]">Pending Disbursements</span>
              </div>
              <span className="rounded-full bg-[var(--pending-status)]/10 px-2 py-0.5 label-caps text-[var(--pending-status)]">Processing</span>
            </div>
            <div>
              <div className="headline-xl font-bold tracking-tight text-[var(--on-surface)]">,250,890.00</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="body-sm text-[var(--on-surface-variant)]">Across 3 active batches</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-5">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-container)]">
                  <span className="material-symbols-outlined text-[18px] text-[var(--success-status)]" aria-hidden="true">task_alt</span>
                </div>
                <span className="label-caps text-[var(--on-surface-variant)]">Completed (30D)</span>
              </div>
              <div className="flex items-center gap-1 rounded-full bg-[var(--success-status)]/10 px-2 py-0.5 text-[var(--success-status)]">
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">trending_up</span>
                <span className="label-caps">12%</span>
              </div>
            </div>
            <div>
              <div className="headline-xl font-bold tracking-tight text-[var(--on-surface)]">8,405,200.50</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="body-sm text-[var(--on-surface-variant)]">14,205 total recipients</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] p-5 lg:col-span-1">
          <div className="mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[var(--primary)]" aria-hidden="true">upload_file</span>
            <h2 className="headline-md text-[var(--on-surface)]">Quick Upload</h2>
          </div>
          <div className="group flex flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--outline-variant)] bg-[var(--surface-canvas)] p-6 text-center transition-colors hover:border-[var(--primary)] hover:bg-[var(--surface-container-low)]">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-container)] transition-colors group-hover:bg-[var(--primary)]/10">
              <span className="material-symbols-outlined text-[var(--outline)] group-hover:text-[var(--primary)]" aria-hidden="true">description</span>
            </div>
            <p className="body-sm text-[var(--on-surface)]">Drag &amp; drop CSV or JSON file</p>
            <p className="label-caps text-[var(--outline)]">or click to browse</p>
            <div className="mt-4 w-full border-t border-[var(--outline-variant)]/30 pt-4">
              <a href="#" className="body-sm flex items-center justify-center gap-1 text-[var(--primary)] hover:underline">
                Download Template
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">open_in_new</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
