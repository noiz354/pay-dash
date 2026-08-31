# ADR-0005: Observability — Sentry + OpenTelemetry + Structured Logs

Date: 2026-08-30
Status: Accepted

## Context
Payment app needs error tracking, tracing, and business audit (`INTEGRATION.md:285-303` webhooks, `INTEGRATION.md:265-278` idempotency). Prior stack plan requires Sentry + `instrumentation.ts` + Web Vitals.

## Decision
We will use **Sentry for Next.js** (`@sentry/nextjs`, wizard, `sentry.client.config.ts` / `sentry.server.config.ts` / `sentry.edge.config.ts`, source maps in CI), **OpenTelemetry** via `instrumentation.ts` `registerOTel('xendit-app')` (`@vercel/otel`), **pino** JSON logs with `user_id org_id payment_request_id xendit_* idempotency_key trace_id`, and **Web Vitals** via Vercel Speed Insights or `useReportWebVitals`.

## Consequences
Positive: unified error + trace + log correlation per payment; release-tracked source maps. Negative: Sentry/OTel add bundle + config; log volume must be sampled.

## Alternatives Considered
Highlight/Bugsnag — Sentry has strongest Next.js wizard. Datadog/New Relic — add as OTEL exporters later.

## Verification
Trigger unhandled error in Server Action → appears in Sentry with `environment` + `release`; `instrumentation.ts` `register()` runs on server start; `useReportWebVitals` posts LCP/CLS/INP.
