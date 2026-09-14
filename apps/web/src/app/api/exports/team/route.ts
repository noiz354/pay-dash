import { NextResponse, type NextRequest } from "next/server";
import { guardExport, UNRESOLVED_ORGANIZATION_ID } from "@/server/services/export-guard";
import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { normalizeRequestedOrganization } from "@/server/services/transaction-organization-context";
import { listMembers, membersToCsv } from "@/server/data/team";
import type { TeamRole } from "@/lib/team-roles";

// CSV export endpoint backing the team page "Export" button (ADR-0022).
// Mirrors the Members tab filters so what you see is what you export —
// same contract as /api/exports/customers.
//
// Wave 7F Q4 — tenant-bound. A roster export is an identity leak with a
// filename: names, emails and roles. This route already asked `guardExport` for
// `team.manage` and then dropped the guard's organization on the floor, listing
// every member in the process (the 7A shape #3 defect, spec P-7). Now
// `guard.organizationId` is the query predicate, applied before the
// role/needle filters; a browser-supplied `?organizationId=` is normalized
// against the guard scope and flagged, never honoured; an unresolved guard org
// is refused with 401 rather than exported. Per-user response: `private,
// no-store` + `Vary: Cookie`, so no shared cache can hold one tenant's roster.
//
// The CSV vocabulary is unchanged and carries no tenant column: the file is
// already scoped to one organization, and an `organization` column would only
// serve to mix tenants back together downstream.
export async function GET(request: NextRequest) {
  // BE-004: fail-closed export guard (JRN-017)
  const guard = await guardExport(request, "team.manage");
  if (!guard.ok) return guard.response;
  if (guard.organizationId === UNRESOLVED_ORGANIZATION_ID) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const ctx = parseOrganizationContext({ organizationId: guard.organizationId });

  const sp = request.nextUrl.searchParams;
  const { context } = normalizeRequestedOrganization(ctx, sp.get("organizationId"), "exports-team");
  const { rows } = await listMembers(context, {
    q: sp.get("q") ?? "",
    role: (sp.get("role") as TeamRole | "ALL") ?? "ALL",
    status: "ALL",
    page: 1,
    pageSize: 100,
  });

  return new NextResponse(membersToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="team-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
      "Vary": "Cookie",
    },
  });
}
