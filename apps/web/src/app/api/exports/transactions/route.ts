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
import { normalizeRequestedOrganization } from "@/server/services/transaction-organization-context";
import { parseOrganizationContext } from "@/domain/tenancy/organization-context";

// CSV export endpoint backing the "Export CSV" / "Download report" buttons.
// Mirrors the ledger filters so what you see is what you export.
//
// Wave 7A — the tenant predicate (spec §3, gap G-4). `guardExport()` has always
// resolved the actor's organization and returned it; this route threw that value
// away and exported whatever the process-wide store held. The guard's
// organization id is now the query predicate, so an export can only ever be a
// *narrowing* of the caller's own tenant: same filters, same pageSize cap, plus
// `where organizationId = <session org>`. A CSV is the highest-impact leak in a
// dashboard because it is designed to leave the building.
function searchParamsOf(request: NextRequest | Request): URLSearchParams {
  // `nextUrl` is the Next-provided parse; the fallback keeps the handler
  // constructible from a plain Request (which is how its tests drive it) instead
  // of silently 401-ing when the framework-shaped field is absent.
  const next = (request as NextRequest).nextUrl;
  return (next ?? new URL(request.url)).searchParams;
}

export async function GET(request: NextRequest) {
  // BE-004: fail-closed export guard (JRN-017)
  const guard = await guardExport(request, "transaction.read");
  if (!guard.ok) return guard.response;

  let context;
  let sp: URLSearchParams;
  try {
    // `guardExport()` returns `"unknown"` when it could not resolve a session in
    // a mode that does not enforce one. That string is not a tenant: an export
    // scoped to it would be an empty file that *looks* like a legitimate result,
    // which is the worst possible answer for a reporting surface. Refuse instead.
    if (guard.organizationId === "unknown") {
      return NextResponse.json(
        { error: "unauthorized", reason: "no organization could be resolved for this request" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    // An empty guard result is likewise a denial, not a tenant — there is no
    // default organization to fall through to.
    context = parseOrganizationContext({ organizationId: guard.organizationId });
    // A `?organizationId=` here is a client trying to pick a tenant. The session
    // answer stands; the attempt is flagged for audit.
    sp = searchParamsOf(request);
    context = normalizeRequestedOrganization(context, sp.get("organizationId"), "transactions.export").context;
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const { rows } = await listTransactions(context, {
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
      // `no-store` plus `Vary: Cookie`: a tenant-specific artefact must not be
      // servable from any shared cache to a different session (spec §6, cache keys).
      "Cache-Control": "no-store, private",
      Vary: "Cookie",
      "X-Export-Rows": String(rows.length),
    },
  });
}
