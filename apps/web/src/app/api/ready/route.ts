import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Readiness probe — "should this instance be receiving traffic?"
 *
 * Split out from `/api/health` (audit finding O-02). Liveness answers "is the
 * process up"; readiness answers "can it do its job". Conflating them is what
 * produced a health endpoint returning HTTP 200 `{"status":"ok","db":"error"}`
 * while no database was running, and a `compose.yaml` healthcheck that grepped
 * the body for the substring `ok` — so an instance with no database stayed in
 * rotation forever and nothing ever paged.
 *
 * `READY_REQUIRE_DB=false` exists for local development without Postgres. It is
 * refused when `APP_ENV=production` (see `lib/env.ts`), so the escape hatch
 * cannot be carried into a deployment by accident.
 */
export async function GET() {
  let db: "ok" | "error" = "error";
  let reason: string | undefined;

  try {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
  } catch (error) {
    db = "error";
    reason = error instanceof Error ? error.message : "database probe failed";
  }

  const requireDb = env.READY_REQUIRE_DB === "true";
  const ready = db === "ok" || !requireDb;

  return NextResponse.json(
    {
      status: ready ? "ready" : "not-ready",
      timestamp: new Date().toISOString(),
      checks: {
        db: {
          status: db,
          required: requireDb,
          ...(reason && db === "error" ? { reason } : {}),
        },
      },
      version: process.env.npm_package_version ?? "0.1.0",
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
