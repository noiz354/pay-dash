import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { FraudSummaryCards } from "@/components/blocklist/fraud-summary-cards";
import { AddBlocklistDialog } from "@/components/blocklist/add-blocklist-dialog";
import { BlocklistPanel } from "@/components/blocklist/blocklist-panel";
import { ExportCsvButton } from "@/components/transactions/export-csv-button";
import { listBlocklist, blocklistSummary } from "@/server/data/blocklist";
import type { BlocklistType } from "@/lib/blocklist-options";

// The panel (and deep links) carry the lowercase tab value; the store uses
// the enum. Map URL -> store type.
const TAB_TYPE: Record<string, BlocklistType> = {
  ip: "IP",
  card: "CARD",
  email: "EMAIL",
};

// Fraud Prevention (ADR-0024). INTEGRATION.md:92/:113/:319: no Xendit
// source — "Fraud rules are Dashboard/console-only" — so the blocklist is
// app-owned. The prototype shipped two contradictory hard-coded lists (one
// per route, 2023 dates) plus invented metrics (14,209 / 8,432 / 3,194,
// "+12% this week"); now both routes run on one seeded store: derived
// per-type metric cards, URL-driven tabs/search (mirrored by the Export
// button), a real Add dialog, real per-row removal and real pagination.
export const metadata: Metadata = {
  title: "Fraud Prevention — Kinetic Ledger",
  description:
    "Dashboard-owned blocklist: IP addresses, card numbers and email domains.",
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function FraudPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const type = TAB_TYPE[(one(sp.type) ?? "").toLowerCase()] ?? "IP";
  const q = one(sp.q) ?? "";

  const [ip, card, email, summary] = await Promise.all([
    listBlocklist({ type: "IP", q, page: 1, pageSize: 10 }),
    listBlocklist({ type: "CARD", q, page: 1, pageSize: 10 }),
    listBlocklist({ type: "EMAIL", q, page: 1, pageSize: 10 }),
    blocklistSummary(),
  ]);
  const sections = { IP: ip, CARD: card, EMAIL: email };

  return (
    <main className="mx-auto max-w-container-max p-gutter space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Fraud Prevention</h1>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
            Manage blocklists and monitor high-risk entities —{" "}
            <Link href="/fraud/blocklist" className="text-[var(--primary)] hover:underline">
              open the blocklist
            </Link>
            .
          </p>
        </div>
        <AddBlocklistDialog />
      </div>

      <FraudSummaryCards summary={summary} />

      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-0">
        <span className="body-sm text-xs text-[var(--on-surface-variant)]">
          {summary.total} blocked entities
        </span>
        <ExportCsvButton
          label="Export"
          endpoint="/api/exports/blocklist"
          filePrefix="blocklist"
          className="h-8 px-3"
        />
      </div>

      <BlocklistPanel sections={sections} activeType={type} queryActive={q.trim().length > 0} />
    </main>
  );
}
