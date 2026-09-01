import { NextResponse } from "next/server";

// Reusable Route Handler — NEXTJS_CONCEPTS.md #6 `route.ts`, #31 `route.ts` webhook, #36 instrumentation
// Health check for Docker/K8s + Vercel; lightweight, no auth
export async function GET() {
  // Optional DB check — reuse prisma singleton (#106)
  // Avoid failing health if DB down; report status instead
  let db: "ok" | "skipped" | "error" = "skipped";
  try {
    // Dynamic import to avoid bundling prisma in edge if ever used
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$queryRaw`SELECT 1`;
    db = "ok";
  } catch {
    db = "error";
  }

  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      db,
      version: process.env.npm_package_version ?? "0.1.0",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
