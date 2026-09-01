# Progress — Prototype → Production

Build-status tracker for the payment-gateway dashboard. Prototype screens are done; production migration is tracked in Milestones below.

## Milestones (shipped = ✅, in-progress = 🟡, planned = ⬜)

| Phase | Scope | Status | ADR | Owner | Date |
|---|---|---|---|---|---|
| 0 Scaffold | Next.js App Router + TS + Tailwind + tokens + TEST MODE banner | ✅ | 0001 0002 | | 2026-08-30 |
| 1 Data/Auth/Security | Postgres + Prisma + DAL + headers + Better Auth | ✅ | 0003 0004 |  | 2026-08-31 |
| 2 Payments/Webhooks | `xendit-node` + `/api/webhooks/xendit` verify/dedupe/queue + ledger | ✅ | 0003 |  | 2026-08-31 |
| 3 Observability/Tracking | Sentry + OTEL `instrumentation.ts` + pino + `track()` + Web Vitals | ✅ | 0005 |  | 2026-08-31 |
| 4 i18n/Animation | `next-intl` `app/[locale]` + `motion` | ✅ | 0002 |  | 2026-08-31 |
| 5 3D/Polish | `three` + R3F + drei behind `dynamic(ssr:false)` + `Hero3D` | ✅ | — |  | 2026-08-31 |
| 6 Testing/CI | Vitest + RTL + Playwright + GitHub Actions + `prisma migrate deploy` | ✅ | 0001 |  | 2026-08-31 |

> Flip one row per PR that touches `apps/web`. See `AGENTS.md` and `docs/adr/`.

## Screen Migration (33 prototypes → `apps/web` routes)

| Screen | Prototype | Route | Status | Notes |
|---|---|---|---|---|
| Home Overview | `screens/mobile/dashboard_home/` | `app/[locale]/dashboard/page.tsx` | ✅ | MetricCard+DataTable pill #d97706 — 2026-08-31 ADR-0001/0002 |
| API Key Management | `screens/mobile/api_key_management/` | `app/[locale]/settings/api-keys/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | No SDK — Dashboard-only (`INTEGRATION.md:313`) |
| Balance History | `screens/mobile/balance_history/` | `app/[locale]/balance/page.tsx` | ✅ | IDR data-mono + Auto-Withdrawal — 2026-08-31 ADR-0001/0002 |
| Custom Reports Builder | `screens/mobile/custom_reports_builder/` | `app/[locale]/reports/builder/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | `Transaction.getAllTransactions()` |
| Customer Directory | `screens/mobile/customer_directory/` | `app/[locale]/customers/page.tsx` | ✅ | `table+avatar+badge+pagination+checkbox` — 2026-08-31 ADR-0002 |
| Developer Settings | `screens/mobile/developer_settings/` | `app/[locale]/settings/developer/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | Webhooks Dashboard |
| Fraud Prevention Blocklist | `screens/mobile/fraud_prevention_blocklist/` | `app/[locale]/fraud/blocklist/page.tsx` | ✅ | `table+badge+input+button` — 2026-08-31 ADR-0002 |
| Identity Verification (KYC) | `screens/mobile/identity_verification_kyc/` | `app/[locale]/kyc/page.tsx` | ✅ | `card+progress+accordion+input` — 2026-08-31 ADR-0002 |
| Payment Links | `screens/mobile/payment_links_invoices/` | `app/[locale]/payments/links/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | `Invoice` / `PaymentRequest` |
| Payout Settings | `screens/mobile/payout_settings/` | `app/[locale]/payouts/settings/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | `Payout.getPayoutChannels()` |
| Subscription Management | `screens/mobile/subscription_management/` | `app/[locale]/subscriptions/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | `Invoice` recurring |
| Team Permissions | `screens/mobile/team_permissions/` | `app/[locale]/team/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | No SDK |
| Transaction Ledger | `screens/mobile/transaction_ledger/` | `app/[locale]/transactions/page.tsx` | ✅ | 7-col DataTable DAL #106 — 2026-08-31 ADR-0001/0002 |
| Webhook Logs | `screens/mobile/webhook_logs/` | `app/[locale]/webhooks/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | Receive-only, persist inbound |
| Dashboard Home | `screens/desktop/dashboard_home_desktop/` | `app/[locale]/dashboard/page.tsx` | ✅ | Shared responsive — 2026-08-31 |
| Balance & History | `screens/desktop/balance_history_desktop/` | `app/[locale]/balance/page.tsx` | ✅ | Shared — 2026-08-31 |
| Billing & Invoices | `screens/desktop/billing_invoices_desktop/` | `app/[locale]/billing/page.tsx` | ✅ | `table+select+tabs+calendar+badge` — 2026-08-31 ADR-0002 |
| Bulk Payouts | `screens/desktop/bulk_payouts_desktop/` | `app/[locale]/payouts/bulk/page.tsx` | ✅ | `file-upload+progress+card+table` — 2026-08-31 ADR-0002 |
| Custom Reports Builder | `screens/desktop/custom_reports_builder_desktop/` | `app/[locale]/reports/builder/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | Shared |
| Customer Directory | `screens/desktop/customer_directory_desktop/` | `app/[locale]/customers/page.tsx` | ✅ | Shared — 2026-08-31 |
| Detailed Audit Log | `screens/desktop/detailed_audit_log_desktop/` | `app/[locale]/audit/page.tsx` | ✅ | `tabs+select+calendar+checkbox` — 2026-08-31 ADR-0002 |
| Developer Settings | `screens/desktop/developer_settings_desktop/` | `app/[locale]/settings/developer/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | Shared |
| Fraud Prevention Console | `screens/desktop/fraud_prevention_desktop/` | `app/[locale]/fraud/page.tsx` | ✅ | `table+tabs+switch+badge` — 2026-08-31 ADR-0002 |
| Identity Verification (KYC) | `screens/desktop/identity_verification_kyc_desktop/` | `app/[locale]/kyc/page.tsx` | ✅ | Shared — 2026-08-31 |
| Merchant Profile Settings | `screens/desktop/merchant_profile_settings_desktop/` | `app/[locale]/settings/merchant/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | No SDK |
| Notification Preferences | `screens/desktop/notification_preferences_desktop/` | `app/[locale]/settings/notifications/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | No SDK |
| Risk & Velocity Limits | `screens/desktop/risk_velocity_limits_desktop/` | `app/[locale]/risk/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | No SDK |
| Onboarding Checklist | `screens/desktop/sub_merchant_onboarding_checklist_desktop/` | `app/[locale]/onboarding/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | `forUserId` partial |
| Subscription Management | `screens/desktop/subscription_management_desktop/` | `app/[locale]/subscriptions/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | Shared |
| Support & Documentation Hub | `screens/desktop/support_documentation_hub_desktop/` | `app/[locale]/support/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | Static |
| System Health & Webhooks | `screens/desktop/system_health_monitoring_desktop/` | `app/[locale]/system/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | Webhooks |
| Team & Permissions | `screens/desktop/team_permissions_desktop/` | `app/[locale]/team/page.tsx` | ✅ | shadcn 100+ — 2026-08-31 ADR-0002 | Shared |
| Transaction Ledger | `screens/desktop/transaction_ledger_desktop/` | `app/[locale]/transactions/page.tsx` | ✅ | Shared — 2026-08-31 |

Full manifest in `SCREENS.md`.

## Prototype Baseline (shipped)

- Mobile (Kinetic Enterprise): 14 of 14 built — `screens/mobile/*/code.html` + `screen.png`
- Desktop (Kinetic Ledger): 19 of 19 built — `screens/desktop/*_desktop/code.html` + `screen.png`
- Design systems: Kinetic Enterprise + Kinetic Ledger — Complete (`design-system/*/DESIGN.md`)

## Decisions Log

| ADR | Title | Status |
|---|---|---|
| [0001](docs/adr/0001-nextjs-app-router.md) | Next.js App Router + TypeScript + pnpm | Accepted |
| [0002](docs/adr/0002-tailwind-shadcn-tokens.md) | Tailwind + shadcn/ui + Kinetic Tokens | Accepted |
| [0003](docs/adr/0003-postgres-prisma.md) | PostgreSQL + Prisma | Accepted |
| [0004](docs/adr/0004-auth-clerk-vs-betterauth.md) | Auth — Clerk vs Better Auth | Accepted |
| [0005](docs/adr/0005-observability-sentry-otel.md) | Observability — Sentry + OTEL | Accepted |

Template: `docs/adr/TEMPLATE.md`

## Change Log (newest top)

- **2026-08-31** — Milestones 3-6: Observability Sentry+OTEL `instrumentation.ts`+`instrumentation-client.ts`+`sentry.*.config.ts` + `WebVitals` pino `track()`; i18n `next-intl` `routing.ts`+`request.ts` `messages/en, id` `withNextIntl`+`NextIntlClientProvider`; 3D `three@0.185`+`@react-three/fiber`+`@react-three/drei` `Hero3D` `dynamic(ssr:false)`; Testing Vitest+RTL+Playwright `vitest.config.ts`+`e2e/smoke.spec.ts`+`ci.yml` `pnpm test` 3 passed — ADR-0005/0002/0001.
- **2026-08-31** — Migrate `fraud` (`table+tabs+switch+badge` `fraud_prevention_desktop`), `fraud/blocklist` (`table+badge`), `kyc` (`card+progress+accordion+input` `identity_verification_kyc`) — shadcn `AGENTS.md:20` `switch/tabs/calendar`, 13 routes, codegraph 145 files wal — 2026-08-31 ADR-0002.
- **2026-08-31** — Migrate remaining 14 routes (17 rows) `settings/api-keys`, `reports/builder`, `settings/developer`, `payments/links`, `payouts/settings`, `subscriptions`, `team`, `webhooks`, `settings/merchant`, `settings/notifications`, `risk`, `onboarding`, `support`, `system` — shadcn 100+ (`table, avatar, badge, select, tabs, calendar` etc.) per `AGENTS.md:20`, 27 routes, codegraph 162 files wal — 2026-08-31 ADR-0002.
- **2026-08-31** — shadcn 100+ via `registry.directory` (62 `add -a` + 32 `@diceui/@tailark` → 94 `ui/*.tsx` + 6 `layout/*` kept, `primitive-elements.md` audit, `globals.css:25` `--primary:#003fb1` restored) — typecheck/build pass, codegraph 141 files wal.
- **2026-08-31** — Migrate `customers` (`table+avatar+badge+pagination+checkbox` `customer_directory:257`), `bulk_payouts` (`file-upload+progress`), `billing` (`select+tabs+calendar`), `audit` (`tabs+select+calendar+checkbox`) — shadcn primitives per `AGENTS.md:20`, 10 routes, ADR-0002.
- **2026-08-31** — Parse 33 screens → `docs/screens-index.json` + `tokens-diff.md`; merge tokens `warning` alias; layout primitives `sidebar/top-bar/bottom-nav/metric-card/data-table`; migrate `dashboard/balance/transactions` (responsive `lg:grid-cols-12`, `label-caps` sticky, `data-mono` right, DAL `ledger` #106, `xendit` #31) — typecheck/build pass, codegraph 25→33 files wal, ADR-0001/0002.
- **2026-08-30** — Phase 0 scaffold: `apps/web` Next.js 15 + TS + Tailwind 4 + Kinetic Ledger/Enterprise tokens as CSS vars + TEST MODE #d97706 banner + shadcn button/card + `app/[locale]/dashboard` (typecheck/build pass, ADR-0001/0002).
- **2026-08-30** — Docs scaffold: `docs/adr/` (5 ADRs), `docs/STACK.md`, `docs/ARCHITECTURE.md`, `PROGRESS.md` → phased tracker, `SCREENS.md` migrated-route column.
- **2026-08-29** — Reorganized repo into `design-system/` and `screens/{mobile,desktop}`; added `README.md`, `AGENTS.md`, `PROGRESS.md`, `SCREENS.md`.
