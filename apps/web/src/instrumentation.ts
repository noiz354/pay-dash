import * as Sentry from "@sentry/nextjs";
import { registerOTel } from "@vercel/otel";

/**
 * Single instrumentation entrypoint — ADR-0005 + NEXTJS #36.
 *
 * Next.js resolves `src/instrumentation.ts` when the app lives under `src/`, and
 * ignores a root-level `instrumentation.ts`. This file used to hold only the OTEL
 * registration while a sibling at the package root wired Sentry — so the root file
 * never loaded, `Sentry.init` never ran on the server or the edge, and the SDK
 * printed four configuration warnings on every boot (audit finding O-01).
 *
 * Everything now lives here. `sentry.server.config.ts` / `sentry.edge.config.ts`
 * are kept as the per-runtime `Sentry.init` payloads and imported below, which is
 * the layout the SDK asks for.
 */
export async function register() {
  // Tracing first: `registerOTel` patches the globals Sentry's OTEL integration
  // relies on, so initialising it before Sentry keeps span export coherent.
  registerOTel({ serviceName: process.env.OTEL_SERVICE_NAME ?? "paydash-web" });

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Nested React Server Component render errors are only reported through this
 * hook. Without it, a throw inside a streamed <Suspense> boundary reaches the
 * browser's error.tsx and nothing else — the server never learns (O-01).
 */
export const onRequestError = Sentry.captureRequestError;
