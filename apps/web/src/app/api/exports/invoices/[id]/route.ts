import { NextResponse } from "next/server";
import { guardExport } from "@/server/services/export-guard";
import { tenantScope } from "@/domain/security/tenant";
import { invoiceStatementCsv } from "@/server/data/invoices";

// Single-invoice statement backing the per-row download button.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // BE-004: fail-closed export guard
  const guard = await guardExport(_request, "transaction.read");
  if (!guard.ok) return guard.response;
  const scope = tenantScope(guard.organizationId);

  const { id } = await params;
  const csv = await invoiceStatementCsv(scope, decodeURIComponent(id));
  if (!csv) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${decodeURIComponent(id)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
