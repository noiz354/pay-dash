import { NextResponse } from "next/server";
import { guardExport, UNRESOLVED_ORGANIZATION_ID } from "@/server/services/export-guard";
import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { invoiceStatementCsv } from "@/server/data/invoices";

// Single-invoice statement backing the per-row download button.
//
// Wave 7D Q4 — tenant-bound. The id is in the URL, so this is the sharpest edge
// of the billing export surface: a caller who knows another tenant's period
// could ask for its statement directly. The guard's organization is now the
// predicate, and "not yours" answers exactly like "does not exist" (404, same
// body) so the endpoint is not an enumeration oracle. An unresolved guard org is
// refused with 401 before any store read. Per-user response: `private, no-store`
// + `Vary: Cookie`.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // BE-004: fail-closed export guard
  const guard = await guardExport(_request, "transaction.read");
  if (!guard.ok) return guard.response;
  if (guard.organizationId === UNRESOLVED_ORGANIZATION_ID) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const ctx = parseOrganizationContext({ organizationId: guard.organizationId });

  const { id } = await params;
  const csv = await invoiceStatementCsv(ctx, decodeURIComponent(id));
  if (!csv) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${decodeURIComponent(id)}.csv"`,
      "Cache-Control": "private, no-store",
      "Vary": "Cookie",
    },
  });
}
