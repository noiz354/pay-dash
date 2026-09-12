import { NextResponse, type NextRequest } from "next/server";
import { guardExport } from "@/server/services/export-guard";
import {
  listTransactions,
  normalizeRefundStateFilter,
  normalizeSlaFilter,
  toCsv,
  type Channel,
  type TransactionStatus,
} from "@/server/data/transactions";

// CSV export endpoint backing the "Export CSV" / "Download report" buttons.
// Mirrors the ledger filters so what you see is what you export.
export async function GET(request: NextRequest) {
  // BE-004: fail-closed export guard (JRN-017)
  const guard = await guardExport(request, "transaction.read");
  if (!guard.ok) return guard.response;

  const sp = request.nextUrl.searchParams;
  const { rows } = await listTransactions({
    status: (sp.get("status") as TransactionStatus | "ALL") ?? "ALL",
    channel: (sp.get("channel") as Channel | "ALL") ?? "ALL",
    range: (sp.get("range") as "7d" | "30d" | "90d" | "all") ?? "all",
    q: sp.get("q") ?? "",
    refundState: normalizeRefundStateFilter(sp.get("refundState")),
    // Fail-safe parse: unknown values fall back to ALL — the export may only
    // ever be broader than requested, never leak a different slice.
    sla: normalizeSlaFilter(sp.get("sla")),
    page: 1,
    pageSize: 100,
  });

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
