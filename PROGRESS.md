# Progress — Prototype → Production

Build-status tracker for the payment-gateway dashboard. Prototype screens are done; production migration is tracked in Milestones below.

## Milestones (shipped = ✅, in-progress = 🟡, planned = ⬜)

| Phase | Scope | Status | ADR | Owner | Date |
|---|---|---|---|---|---|
| 0 Scaffold | Next.js App Router + TS + Tailwind + tokens + TEST MODE banner | ✅ | 0001 0002 | | 2026-08-30 |
| 1 Data/Auth/Security | Postgres + Prisma + DAL + Clerk/Better Auth + headers | ⬜ | 0003 0004 | | |
| 2 Payments/Webhooks | `xendit-node` + `/api/webhooks/xendit` verify/dedupe/queue + ledger | ⬜ | 0003 | | |
| 3 Observability/Tracking | Sentry + OTEL `instrumentation.ts` + pino + `track()` + Web Vitals | ⬜ | 0005 | | |
| 4 i18n/Animation | `next-intl` `app/[locale]` + `motion` (defer if en-US only) | ⬜ | 0002 | | |
| 5 3D/Polish | `three` + R3F + drei behind `dynamic(ssr:false)` (only if hero needed) | ⬜ | — | | |
| 6 Testing/CI | Vitest + RTL + Playwright + GitHub Actions + `prisma migrate deploy` | ⬜ | 0001 | | |

> Flip one row per PR that touches `apps/web`. See `AGENTS.md` and `docs/adr/`.

## Screen Migration (33 prototypes → `apps/web` routes)

| Screen | Prototype | Route | Status | Notes |
|---|---|---|---|---|
| Home Overview | `screens/mobile/dashboard_home/` | `app/[locale]/dashboard/page.tsx` | ⬜ | Balance+Transaction |
| API Key Management | `screens/mobile/api_key_management/` | `app/[locale]/settings/api-keys/page.tsx` | ⬜ | No SDK — Dashboard-only (`INTEGRATION.md:313`) |
| Balance History | `screens/mobile/balance_history/` | `app/[locale]/balance/page.tsx` | ⬜ | `Balance.getBalance()` |
| Custom Reports Builder | `screens/mobile/custom_reports_builder/` | `app/[locale]/reports/builder/page.tsx` | ⬜ | `Transaction.getAllTransactions()` |
| Customer Directory | `screens/mobile/customer_directory/` | `app/[locale]/customers/page.tsx` | ⬜ | `Customer` |
| Developer Settings | `screens/mobile/developer_settings/` | `app/[locale]/settings/developer/page.tsx` | ⬜ | Webhooks Dashboard |
| Fraud Prevention Blocklist | `screens/mobile/fraud_prevention_blocklist/` | `app/[locale]/fraud/blocklist/page.tsx` | ⬜ | No SDK |
| Identity Verification (KYC) | `screens/mobile/identity_verification_kyc/` | `app/[locale]/kyc/page.tsx` | ⬜ | Not in v7 SDK |
| Payment Links | `screens/mobile/payment_links_invoices/` | `app/[locale]/payments/links/page.tsx` | ⬜ | `Invoice` / `PaymentRequest` |
| Payout Settings | `screens/mobile/payout_settings/` | `app/[locale]/payouts/settings/page.tsx` | ⬜ | `Payout.getPayoutChannels()` |
| Subscription Management | `screens/mobile/subscription_management/` | `app/[locale]/subscriptions/page.tsx` | ⬜ | `Invoice` recurring |
| Team Permissions | `screens/mobile/team_permissions/` | `app/[locale]/team/page.tsx` | ⬜ | No SDK |
| Transaction Ledger | `screens/mobile/transaction_ledger/` | `app/[locale]/transactions/page.tsx` | ⬜ | `Transaction` |
| Webhook Logs | `screens/mobile/webhook_logs/` | `app/[locale]/webhooks/page.tsx` | ⬜ | Receive-only, persist inbound |
| Dashboard Home | `screens/desktop/dashboard_home_desktop/` | `app/[locale]/dashboard/page.tsx` | ⬜ | Shared route, responsive |
| Balance & History | `screens/desktop/balance_history_desktop/` | `app/[locale]/balance/page.tsx` | ⬜ | Shared |
| Billing & Invoices | `screens/desktop/billing_invoices_desktop/` | `app/[locale]/billing/page.tsx` | ⬜ | `Invoice` |
| Bulk Payouts | `screens/desktop/bulk_payouts_desktop/` | `app/[locale]/payouts/bulk/page.tsx` | ⬜ | `Payout.createPayout()` idempotent |
| Custom Reports Builder | `screens/desktop/custom_reports_builder_desktop/` | `app/[locale]/reports/builder/page.tsx` | ⬜ | Shared |
| Customer Directory | `screens/desktop/customer_directory_desktop/` | `app/[locale]/customers/page.tsx` | ⬜ | Shared |
| Detailed Audit Log | `screens/desktop/detailed_audit_log_desktop/` | `app/[locale]/audit/page.tsx` | ⬜ | `Transaction` + webhooks |
| Developer Settings | `screens/desktop/developer_settings_desktop/` | `app/[locale]/settings/developer/page.tsx` | ⬜ | Shared |
| Fraud Prevention Console | `screens/desktop/fraud_prevention_desktop/` | `app/[locale]/fraud/page.tsx` | ⬜ | No SDK |
| Identity Verification (KYC) | `screens/desktop/identity_verification_kyc_desktop/` | `app/[locale]/kyc/page.tsx` | ⬜ | Shared |
| Merchant Profile Settings | `screens/desktop/merchant_profile_settings_desktop/` | `app/[locale]/settings/merchant/page.tsx` | ⬜ | No SDK |
| Notification Preferences | `screens/desktop/notification_preferences_desktop/` | `app/[locale]/settings/notifications/page.tsx` | ⬜ | No SDK |
| Risk & Velocity Limits | `screens/desktop/risk_velocity_limits_desktop/` | `app/[locale]/risk/page.tsx` | ⬜ | No SDK |
| Onboarding Checklist | `screens/desktop/sub_merchant_onboarding_checklist_desktop/` | `app/[locale]/onboarding/page.tsx` | ⬜ | `forUserId` partial |
| Subscription Management | `screens/desktop/subscription_management_desktop/` | `app/[locale]/subscriptions/page.tsx` | ⬜ | Shared |
| Support & Documentation Hub | `screens/desktop/support_documentation_hub_desktop/` | `app/[locale]/support/page.tsx` | ⬜ | Static |
| System Health & Webhooks | `screens/desktop/system_health_monitoring_desktop/` | `app/[locale]/system/page.tsx` | ⬜ | Webhooks |
| Team & Permissions | `screens/desktop/team_permissions_desktop/` | `app/[locale]/team/page.tsx` | ⬜ | Shared |
| Transaction Ledger | `screens/desktop/transaction_ledger_desktop/` | `app/[locale]/transactions/page.tsx` | ⬜ | Shared |

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

- **2026-08-30** — Phase 0 scaffold: `apps/web` Next.js 15 + TS + Tailwind 4 + Kinetic Ledger/Enterprise tokens as CSS vars + TEST MODE #d97706 banner + shadcn button/card + `app/[locale]/dashboard` (typecheck/build pass, ADR-0001/0002).
- **2026-08-30** — Docs scaffold: `docs/adr/` (5 ADRs), `docs/STACK.md`, `docs/ARCHITECTURE.md`, `PROGRESS.md` → phased tracker, `SCREENS.md` migrated-route column.
- **2026-08-29** — Reorganized repo into `design-system/` and `screens/{mobile,desktop}`; added `README.md`, `AGENTS.md`, `PROGRESS.md`, `SCREENS.md`.
