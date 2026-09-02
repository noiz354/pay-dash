import type { Metadata } from "next";
import { ReportBuilder } from "@/components/reports/report-builder";
import { getLedgerRows } from "@/server/data/transactions";
import { getPayoutBatches } from "@/server/data/payouts";
import { listCustomers } from "@/server/data/customers";

// Custom Reports Builder (ADR-0020). The prototype was a pure mockup: five
// hard-coded rows (ids, emails, dates and USD amounts that exist nowhere in
// the app), a fabricated "1,248 rows" count, and a config column in which
// every single control — data source, dates, presets, filters, columns,
// Apply/Reset, Schedule, Export CSV, pagination — had no handler. The store
// already ships toCsv()/customersToCsv(), so the rebuilt page runs a real
// query over the app's own rows and downloads a real CSV.
export const metadata: Metadata = {
  title: "Custom Reports Builder — Kinetic Ledger",
  description:
    "Query the transaction ledger, payout batches and customers — real rows, real filters, a real CSV export.",
};

export default async function ReportsBuilderPage() {
  const [transactions, batches, customersPage] = await Promise.all([
    getLedgerRows(),
    getPayoutBatches(),
    listCustomers({ pageSize: 500 }),
  ]);

  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      <div>
        <h1 className="headline-xl text-[var(--on-surface)]">Custom Reports Builder</h1>
        <p className="body-sm text-[var(--on-surface-variant)] mt-1">
          Configure data source and filters — the preview and CSV export run over your actual data.
        </p>
      </div>
      <ReportBuilder
        transactions={transactions}
        batches={batches}
        customers={customersPage.rows}
      />
    </main>
  );
}
