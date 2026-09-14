import { NextResponse, type NextRequest } from "next/server";
import { guardExport, UNRESOLVED_ORGANIZATION_ID } from "@/server/services/export-guard";
import { parseOrganizationContext } from "@/domain/tenancy/organization-context";
import { normalizeRequestedOrganization } from "@/server/services/transaction-organization-context";
import { invoicesToCsv, listInvoices } from "@/server/data/invoices";
import type { InvoiceStatus } from "@/lib/invoice-status";

// Statement export backing the "Export Statement" button; mirrors the invoice
// filters currently in the URL so what you see is what you export.
//
// Wave 7D Q4 — tenant-bound. Invoices are ledger-derived, so an unscoped
// statement export leaked a *computed* view of every tenant's fees: the
// aggregate was the leak. `guard.organizationId` is now the query predicate,
// applied before the range/status/needle filters; a browser-supplied
// `?organizationId=` is normalized against the guard scope and flagged, never
// honoured; an unresolved guard org is refused with 401. Per-user response:
// `private, no-store` + `Vary: Cookie` (the 7A shape #3 defect).
export async function GET(request: NextRequest) {
  // BE-004: fail-closed export guard (JRN-017)
  const guard = await guardExport(request, "transaction.read");
  if (!guard.ok) return guard.response;
  if (guard.organizationId === UNRESOLVED_ORGANIZATION_ID) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const ctx = parseOrganizationContext({ organizationId: guard.organizationId });

  const sp = request.nextUrl.searchParams;
  const { context } = normalizeRequestedOrganization(ctx, sp.get("organizationId"), "exports-invoices");
  const { rows } = await listInvoices(context, {
    q: sp.get("q") ?? "",
    status: (sp.get("status") as InvoiceStatus | "ALL") ?? "ALL",
    range: (sp.get("range") as "3m" | "6m" | "12m" | "all") ?? "all",
    sort: (sp.get("sort") as "recent" | "amount" | "due") ?? "recent",
    page: 1,
    pageSize: 100,
  });

  return new NextResponse(invoicesToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
      "Vary": "Cookie",
    },
  });
}
