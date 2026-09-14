import { NextResponse } from "next/server";

/**
 * Liveness probe — "is this process able to serve requests?"
 *
 * Deliberately does NOT touch the database. A liveness probe that fails because a
 * dependency is down makes the orchestrator restart a healthy process in a loop,
 * which turns a database outage into an application outage. Dependency state is
 * what `/api/ready` is for.
 *
 * Audit finding O-02: this route used to run `SELECT 1`, then return HTTP 200 with
 * `{"status":"ok","db":"error"}` — a 200 whose body contradicted it. `compose.yaml`
 * grepped that body for the substring `ok`, so a container with no database was
 * declared healthy and kept receiving traffic. Liveness now answers only the
 * question it is asked; readiness answers the other one.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
