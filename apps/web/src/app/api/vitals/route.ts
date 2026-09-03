import { NextResponse } from "next/server";

// Addy Osmani: idle + beacon endpoint for web-vitals / analytics.ts
// Accepts sendBeacon POSTs from `src/lib/analytics.ts` and `instrumentation-client.ts`
// No-op in this scaffold — keeps 204 so console stays clean; swap to real store when needed.
export async function POST(request: Request) {
  try {
    // Drain body so sendBeacon doesn't retry; tolerate any JSON shape
    await request.text();
  } catch {}
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "vitals" });
}
