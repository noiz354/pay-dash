import { NextResponse, type NextRequest } from "next/server";
import { guardExport, UNRESOLVED_ORGANIZATION_ID } from "@/server/services/export-guard";
import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { normalizeRequestedOrganization } from "@/server/services/transaction-organization-context";
import { isBlocklistType } from "@/lib/blocklist-options";
import { blocklistToCsv, listBlocklist } from "@/server/data/blocklist";

// CSV export endpoint backing the fraud pages' "Export" button (ADR-0024).
// Mirrors the panel filters in the URL (`type`, `q`) so what you see is what
// you export — same contract as /api/exports/customers.
//
// Wave 7G Q4 — tenant-bound. A blocklist export is a fraud-signal leak with a
// filename: which IPs, cards and domains a merchant considers malicious. This
// route already asked `guardExport` for `audit.read` and then dropped the
// guard's organization on the floor, listing every entry in the process (the
// 7A shape #3 defect, spec P-7). Now `guard.organizationId` is the query
// predicate, applied before the type/needle filters; a browser-supplied
// `?organizationId=` is normalized against the guard scope and flagged, never
// honoured; an unresolved guard org is refused with 401 rather than exported.
// Per-user response: `private, no-store` + `Vary: Cookie`, so no shared cache
// can hold one tenant's fraud controls.
//
// The CSV vocabulary is unchanged and carries no tenant column (GS-5): the
// file is already scoped to one organization, and an `organization` column
// would only serve to mix tenants back together downstream.
export async function GET(request: NextRequest) {
  // BE-004: fail-closed export guard (JRN-017)
  const guard = await guardExport(request, "audit.read");
  if (!guard.ok) return guard.response;
  if (guard.organizationId === UNRESOLVED_ORGANIZATION_ID) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const ctx = parseOrganizationContext({ organizationId: guard.organizationId });

  const sp = request.nextUrl.searchParams;
  const { context } = normalizeRequestedOrganization(ctx, sp.get("organizationId"), "exports-blocklist");
  // the URL carries the lowercase tab value ("card") — normalise to the enum
  const rawType = (sp.get("type") ?? "ALL").toUpperCase();
  const { rows } = await listBlocklist(context, {
    type: isBlocklistType(rawType) ? rawType : "ALL",
    q: sp.get("q") ?? "",
    page: 1,
    pageSize: 100,
  });

  return new NextResponse(blocklistToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="blocklist-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
    },
  });
}
