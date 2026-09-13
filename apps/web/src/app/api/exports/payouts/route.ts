import { NextResponse, type NextRequest } from "next/server";
import { guardExport, UNRESOLVED_ORGANIZATION_ID } from "@/server/services/export-guard";
import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { normalizeRequestedOrganization } from "@/server/services/transaction-organization-context";
import { batchesToCsv, listBatches } from "@/server/data/payouts";
import type { PayoutStatus } from "@/lib/payout-status";

// Backs the "Export Log" button — the batch history CSV, honouring whatever
// filters are currently in the URL so what you see is what you export.
//
// Wave 7B Q4 — tenant-bound: `guard.organizationId` is the authoritative
// tenant, parsed into a context and used as the query predicate *before* any
// filter/sort/page. A browser-supplied `?organizationId=` is normalized
// against the guard scope and flagged, never honoured. An unresolved guard
// org (the "unknown" sentinel) is refused with 401, never exported.
export async function GET(request: NextRequest) {
  // BE-004: fail-closed export guard (JRN-017)
  const guard = await guardExport(request, "report.export");
  if (!guard.ok) return guard.response;
  if (guard.organizationId === UNRESOLVED_ORGANIZATION_ID) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const ctx = parseOrganizationContext({ organizationId: guard.organizationId });

  const sp = request.nextUrl.searchParams;
  const { context } = normalizeRequestedOrganization(ctx, sp.get("organizationId"), "exports-payouts");
  const { rows } = await listBatches(context, {
    q: sp.get("q") ?? "",
    status: (sp.get("status") as PayoutStatus | "ALL") ?? "ALL",
    range: (sp.get("range") as "30d" | "90d" | "12m" | "all") ?? "all",
    sort: (sp.get("sort") as "recent" | "amount" | "recipients") ?? "recent",
    page: 1,
    pageSize: 500,
  });

  return new NextResponse(batchesToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payout-batches-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
      "Vary": "Cookie",
    },
  });
}
