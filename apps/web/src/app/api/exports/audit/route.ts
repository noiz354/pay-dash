import { NextResponse, type NextRequest } from "next/server";
import {
  isAuditCategory,
  isAuditRange,
  isAuditStatus,
} from "@/lib/audit-options";
import { auditEventsToCsv, listAuditEvents, type AuditFilters } from "@/server/data/audit";

// CSV export endpoint backing the audit page's "Export CSV" button (ADR-0026).
// Mirrors the filter bar in the URL (`q`, `category`, `status`, `range`) so
// what you see is what you export — same contract as the other /api/exports.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const category = sp.get("category") ?? "ALL";
  const status = sp.get("status") ?? "ALL";
  const range = sp.get("range") ?? "all";

  // One filter implementation (the store's) — the URL just feeds it.
  const filters: AuditFilters = {
    q: sp.get("q") ?? "",
    category: isAuditCategory(category) ? category : "ALL",
    status: isAuditStatus(status) ? status : "ALL",
    range: isAuditRange(range) ? range : "all",
  };

  const first = await listAuditEvents({ ...filters, page: 1, pageSize: 100 });
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.pageCount - 1) }, (_, i) =>
      listAuditEvents({ ...filters, page: i + 2, pageSize: 100 })
    )
  );
  const rows = [first, ...rest].flatMap((p) => p.rows);

  return new NextResponse(auditEventsToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
