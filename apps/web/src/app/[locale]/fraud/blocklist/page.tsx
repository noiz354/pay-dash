import type { Metadata } from "next";
import { AddBlocklistDialog } from "@/components/blocklist/add-blocklist-dialog";
import { BlocklistPanel } from "@/components/blocklist/blocklist-panel";
import { listBlocklist, blocklistSummary } from "@/server/data/blocklist";
import type { BlocklistType } from "@/lib/blocklist-options";

// The panel (and deep links) carry the lowercase tab value; the store uses
// the enum. Map URL -> store type.
const TAB_TYPE: Record<string, BlocklistType> = {
  ip: "IP",
  card: "CARD",
  email: "EMAIL",
};

// Blocklist (ADR-0024) — the focused view over the same store /fraud runs
// on (one source of truth; the prototype's two contradictory lists are
// gone). Tabs + search are URL state; delete is a real action; the
// "1-4 of 124" pagination is the real count.
export const metadata: Metadata = {
  title: "Blocklist — Kinetic Ledger",
  description: "The fraud blocklist: IP addresses, card numbers and email domains.",
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function BlocklistPage({
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
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="headline-xl text-[var(--on-surface)]">Blocklist</h1>
          <p className="body-sm mt-1 text-[var(--on-surface-variant)]">
            Prevent fraudulent transactions by blocking specific attributes — {summary.total}{" "}
            entities blocked.
          </p>
        </div>
        <AddBlocklistDialog />
      </div>

      <BlocklistPanel sections={sections} activeType={type} queryActive={q.trim().length > 0} />
    </main>
  );
}
