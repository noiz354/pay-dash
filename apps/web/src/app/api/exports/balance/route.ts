import { NextResponse, type NextRequest } from "next/server";
import { listMovements, movementsToCsv } from "@/server/data/balance";
import type { MovementStatus, MovementType } from "@/lib/balance-status";

// Backs the "Export CSV" button on /balance — the movement history, honouring
// whatever filters are currently in the URL so what you see is what you
// export (ADR-0011).
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const { rows } = await listMovements({
    type: (sp.get("type") as MovementType | "all") ?? "all",
    status: (sp.get("status") as MovementStatus | "all") ?? "all",
    range: (sp.get("range") as "7d" | "30d" | "90d" | "all") ?? "all",
    q: sp.get("q") ?? "",
    sort: (sp.get("sort") as "recent" | "amount") ?? "recent",
    page: 1,
    pageSize: 500,
  });

  return new NextResponse(movementsToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="balance-movements-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
