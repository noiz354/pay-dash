import { registerOTel } from "@vercel/otel";

// Reusable OTEL — ADR-0005 + NEXTJS #36 instrumentation.ts
export function register() {
  registerOTel({ serviceName: "xendit-app" });
}
