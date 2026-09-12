import { NextResponse, type NextRequest } from "next/server";

import { guardApiRead } from "@/server/services/export-guard";
import { resolveSessionOrgContext } from "@/server/services/session-org-context";
import { getCommandCenter, toDto } from "@/server/data/command-center";
import { getHandoffCounts } from "@/server/data/handoff";

// Wave 4 §2 — Command Center polling endpoint.
//
// Backs the dashboard's 20s refresh. It is guarded exactly like the CSV exports
// (BE-004): anonymous → 401, authenticated → 200. `no-store` on every response
// so a shared proxy or the browser cache can never serve one operator's
// exception counts to another.
//
// Authority is recomputed here on every poll. The client cannot widen `canAct`
// by editing its own state — the next poll overwrites it from the session.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Any authenticated actor may read their own Command Center; per-item
  // authority is carried on each card via `canAct` rather than by hiding the
  // payload (hiding it would recreate the dead end the lanes exist to remove).
  const guard = await guardApiRead(request);
  if (!guard.ok) return guard.response;

  let roles: Awaited<ReturnType<typeof resolveSessionOrgContext>>["roles"] = [];
  try {
    const ctx = await resolveSessionOrgContext();
    roles = ctx.roles;
  } catch {
    roles = [];
  }

  // One instant for the whole snapshot, so lanes and SLA badges agree.
  const now = new Date();
  try {
    const [snapshot, handoffCounts] = await Promise.all([getCommandCenter(roles, now), getHandoffCounts(roles, now)]);
    return NextResponse.json(
      { ...toDto(snapshot), handoffCounts },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0", "Content-Type": "application/json" } },
    );
  } catch (error) {
    // Never leak internals; the client renders its error state and keeps the
    // last good snapshot on screen.
    const message = error instanceof Error ? error.message : "Aggregation failed";
    return NextResponse.json(
      { error: "Could not build the command center snapshot", detail: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
