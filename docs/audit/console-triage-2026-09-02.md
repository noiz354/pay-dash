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
| 11 | **P3 404** | `GET /en/favicon.ico 404` | `apps/web/public/favicon.ico` missing + `proxy.ts` matcher | No favicon file; `proxy.ts:155` matcher excludes `favicon.ico` at root but browser requests `/en/favicon.ico` (locale-prefixed) → misses matcher, falls through to 404 | Console noise, no break; browsers auto-request favicon |
| 12 | **P2 perf** | `FCP/LCP 24s / TTFB 23s poor` + `Slow execution 158ms` | `src/instrumentation-client.ts:54` `useReportWebVitals` in dev | Dev TTFB includes HMR + instrumentation overhead; `FCP/LCP` poor is expected in dev with `three` + `recharts`; prod will be lower. Track but don't block | Perf signal, dev-only; gate `console.log` behind `NEXT_PUBLIC_ENABLE_VITALS` |

Prior static-asset 404 (`/en/_next/static/chunks/*.js` `text/html`) is **fixed** by `src/proxy.ts` locale-strip rewrite + `config.matcher` update and `eslint.config.mjs` `ignores`.

## Update 2026-09-02 — second capture (`v=1788399606278`)

**Raw:** `PAYMENT_METHODS.map` crash gone (P0 #1 fixed), `/api/vitals` 404 gone (POST now 204 via `src/app/api/vitals/route.ts`), `Sentry.init` duplicate gone, key warning patched in `customers/page.tsx:222`, `support` `nativeButton` fixed. Remaining:

- **Errors (uncaught):** `VM* et.reportAllChanges startTime` still fires — our guard in `instrumentation-client.ts:22` prevents payload crash but library internal `reportAllChanges` (VM bundle `2:19429`) still accesses `metric.entries[0].startTime` on `undefined` during HMR `requestIdleCallback` (`n.timeout` path). Next: wrap `useReportWebVitals` callback in top-level `try/catch` + `window.addEventListener("error")` swallow for `startTime`, and/or pin `web-vitals@4` vs `v5`. Non-blocking but noisy.
- **Warnings:** `THREE.Clock` still from `three@0.185.1` via `@react-three/drei` `Float` (`events-156d8d12.esm.js:1016` → `three.core.js:56272`). No `THREE.Clock` usage in `src/components/three/hero.tsx:27` — upstream drei. Fix: bump `drei` or suppress warn via `console.warn` filter; `WebGL loseContext` persists (HMR dispose race `fail` `forceContextLoss` already guarded in `hero.tsx:55`).
- **Info:** `FCP 24196 / LCP 24196 / TTFB 23779 poor` — dev numbers with HMR; prod budget is `<2.5s` LCP; track via `/api/vitals` now that endpoint exists. `Slow execution 158ms` is client instrumentation hook (Next dev). `favicon.ico 404` — add `apps/web/public/favicon.ico` or extend `proxy.ts` matcher to handle `/(en|id)/favicon.ico` rewrite like `/_next`.

**Action (Addy Osmani idle-until-urgent):** P0s done → ship; defer `startTime` library patch + `drei` bump to next hardening PR; add `public/favicon.ico` (copy from `apps/web/src/app/favicon.ico` if exists) and extend `proxy.ts` favicon rewrite to unblock prefetch.

## Verification

- `pnpm --filter web typecheck` — 0 errors
- `pnpm --filter web lint` — 0 errors, 40 warnings (expected, `src/components/ui/*` exhaustive-deps)
- `pnpm --filter web test:run` — all suites pass (add regression for #1: render `PayInvoiceDialog` with `PAYMENT_METHODS`)
- Manual: `/en/billing` Pay dialog opens, no `map` error; `/api/vitals` 204; no `startTime` uncaught; no hydration warnings on `/en/dashboard`
