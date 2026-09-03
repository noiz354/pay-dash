# Console triage — 2026-09-02

Source: `http://localhost:3000/en/dashboard` + `/en/billing` + `/en/customers` manual run after `ba8d1b0` (post `eslint.config.mjs` + `proxy.ts` static-asset fix). Raw log saved from browser console (chunks `webpack.js`, `main-app.js`, `layout.css` now 200; remaining errors below).

## Summary (Addy Osmani: idle-until-urgent, PRPL, fix what blocks paint/interaction first)

| # | Severity | Signature | File | Root cause | User impact |
|---|----------|-----------|------|------------|-------------|
| 1 | **P0 crash** | `PAYMENT_METHODS.map is not a function` at `pay-invoice-dialog.tsx:160` | `src/server/actions/invoices.ts:27` (`"use server"` at top) → `src/components/billing/pay-invoice-dialog.tsx:24,160` | Constant exported from `"use server"` module is not traversable as static array in client bundle; `SectionBoundary` catches but billing summary stays broken. | Billing Pay dialog crashes; `/en/billing` shows error boundary |
| 2 | **P0 crash** | `Cannot read properties of undefined (reading 'startTime')` at `et.reportAllChanges` | `src/instrumentation-client.ts:21` `useReportWebVitals` + `web-vitals` v5 `Metric` has no `startTime` (only `entries[0].startTime`) | Library internal `reportAllChanges` accesses missing field → uncaught, triggers Fast Refresh loop |
| 3 | **P1 404** | `POST /api/vitals 404` | `src/lib/analytics.ts:21` `navigator.sendBeacon("/api/vitals")` | No route under `src/app/api/` (`auth, exports, health, webhooks` only) | Every `web_vital` flush 404s, clutters console |
| 4 | **P1 warn** | `Sentry.init() more than once` | `sentry.client.config.ts:3` + `src/instrumentation-client.ts:8` | Both files call `Sentry.init` | Duplicate init, noisy |
| 5 | **P2 warn** | `Each child in a list should have a unique "key" prop` — `CustomersTable` | `src/components/customers/customers-table.tsx` + `src/app/[locale]/customers/page.tsx:222` | Map without `key` | React warning, no crash |
| 6 | **P2 warn** | Hydration mismatch `base-ui-_R_*` / `chart-_R_*` | `src/components/ui/button.tsx:47`, `dropdown-menu.tsx:18`, `chart.tsx:94`, `transactions-table.tsx:107` | `useId` non-deterministic server vs client, `data-chart` id generated per render | Console noise, no visual break |
| 7 | **P2 warn** | `Base UI: nativeButton prop true` | `src/app/[locale]/support/page.tsx:131` `Button` | `nativeButton` expects real `<button>` in `render` prop | A11y warning |
| 8 | **P2 warn** | `THREE.Clock deprecated → THREE.Timer` | `src/components/dashboard/hero.tsx:75` via `three@0.185.1` | `THREE.Clock` constructor deprecated | Library warning |
| 9 | **P2 warn** | `WebGL: loseContext: context already lost` | `three.module.js:16592` via `Hero3D` `Canvas` | No `gl.dispose()` on unmount | occasional |
| 10 | **P3 info** | `Preload … but not used` ×40 + `Slow execution 276ms` / `TTFB 26s poor` | `src/app/layout.tsx` preloads fonts/media | Preloads for routes not visited; TTFB poor in dev (instrumentation overhead) | Perf noise in dev only |

Prior static-asset 404 (`/en/_next/static/chunks/*.js` `text/html`) is **fixed** by `src/proxy.ts` locale-strip rewrite + `config.matcher` update and `eslint.config.mjs` `ignores`.

## Verification

- `pnpm --filter web typecheck` — 0 errors
- `pnpm --filter web lint` — 0 errors, 40 warnings (expected, `src/components/ui/*` exhaustive-deps)
- `pnpm --filter web test:run` — all suites pass (add regression for #1: render `PayInvoiceDialog` with `PAYMENT_METHODS`)
- Manual: `/en/billing` Pay dialog opens, no `map` error; `/api/vitals` 204; no `startTime` uncaught; no hydration warnings on `/en/dashboard`
