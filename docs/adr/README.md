# Architecture Decision Records — PayDash

One file per decision: **Context / Decision / Alternatives / Trade-offs / Consequences** (see `TEMPLATE.md`).

**Rule:** a change to a decision (not just its implementation) gets a new ADR that supersedes the old one (keep the old file, mark it Superseded-by).

## Foundational architecture (pre-redesign)

| ADR | Decision |
|---|---|
| [0001](./0001-nextjs-app-router.md) | Next.js App Router + TypeScript + pnpm |
| [0002](./0002-tailwind-shadcn-tokens.md) | Tailwind CSS + shadcn/ui + Kinetic tokens as CSS variables |
| [0003](./0003-postgres-prisma.md) | PostgreSQL + Prisma |
| [0004](./0004-auth-clerk-vs-betterauth.md) | Auth — Clerk (default) vs Better Auth |
| [0005](./0005-observability-sentry-otel.md) | Observability — Sentry + OpenTelemetry + structured logs |
| [0006](./0006-server-actions-transaction-flows.md) | Server Actions + URL state for the transaction journey |
| [0007](./0007-customer-directory-and-proxy-activation.md) | Customer directory: derived data seam, URL deep links, activated proxy |
| [0008](./0008-billing-invoices-derived-from-ledger.md) | Billing: invoices derived from ledger fees |
| [0009](./0009-settings-hub-and-persisted-preferences.md) | Settings: a real hub, persisted preferences, reveal-once keys |
| [0010](./0010-payout-batches-and-gated-disbursement.md) | Payouts: batches own recipients, gated disbursement |
| [0011](./0011-balance-derived-from-ledger-and-payouts.md) | Balance: one figure, derived from ledger + payouts |
| [0012](./0012-dashboard-derived-home-state.md) | Dashboard: the home page states what the stores already know |
| [0013](./0013-payment-links-derived-status.md) | Payment links: a real store, status the merchant never sets |
| [0014](./0014-webhooks-inbound-callback-log.md) | Webhooks: the log of callbacks the app actually receives |
| [0015](./0015-developer-settings-webhook-truth.md) | Developer settings: the webhook card tells the receive-side truth |
| [0016](./0016-support-hub-real-affordances.md) | Support: the hub that knows where you came from |
| [0017](./0017-system-measured-status.md) | System: the status page states only what's measured |
| [0018](./0018-merchant-profile-auto-debit-real.md) | Merchant profile: the auto-debit switch is real |
| [0019](./0019-kyc-submission-the-app-can-own.md) | KYC: submission the app can own |
| [0020](./0020-report-builder-a-query-the-app-can-run.md) | Report builder: a query the app can run |
| [0021](./0021-subscriptions-plans-the-app-can-hold.md) | Subscriptions: plans the app can hold |
| [0022](./0022-team-members-the-dashboard-can-manage.md) | Team: members the dashboard can manage |
| [0023](./0023-risk-limits-and-rules-the-dashboard-can-enforce.md) | Risk: limits and rules the dashboard can enforce |
| [0024](./0024-blocklist-one-store-both-fraud-pages-run-on.md) | Blocklist: one store both fraud pages run on |
| [0025](./0025-onboarding-checklist-derived-from-real-stores.md) | Onboarding: a checklist the app can actually track |
| [0026](./0026-audit-log-the-event-history-the-app-owns.md) | Audit log: the event history the app actually owns |
| [0027](./0027-provider-neutral-domain-persistence.md) | Provider-neutral domain persistence |
| [0028](./0028-stripe-connect-architecture.md) | Stripe Connect charge ownership and integration architecture |
| [0029](./0029-cloud-run-gemini-journal.md) | Cloud Run Gemini Journal for Ideathon |

## UX redesign decisions (Wave 0–4, finalized Wave 5)

> Narrative version: `UX_REDESIGN_FINAL_IMPLEMENTATION_REPORT.md` §4 (invariants). These ADRs are the decision-level record of what shipped in the redesign.

| ADR | Decision | Wave |
|---|---|---|
| [0030](./0030-fail-closed-auth.md) | Auth is fail-closed (default strict) | W0 |
| [0031](./0031-canonical-navigation.md) | Canonical grouped navigation (config + resolver, alias-safe) | W1 |
| [0032](./0032-url-as-list-state.md) | The URL is the source of truth for list state | W2 |
| [0033](./0033-canonical-datatable.md) | One canonical DataTable | W2/W3 |
| [0034](./0034-server-side-permissions.md) | Server-side permission enforcement (UI is secondary) | W0, reinforced W4 |
| [0035](./0035-dual-control.md) | Dual control for threshold money movement (two phases, distinct actors) | W0/W4 |
| [0036](./0036-idempotency.md) | Idempotency keys for money-adjacent mutations | W3 |
| [0037](./0037-background-polling.md) | Background polling (20 s) as the freshness mechanism | W3, rewritten W4 |
| [0038](./0038-stale-ux.md) | Stale UX — age always shown, >60 s labeled | W3/W4 |
| [0039](./0039-conflict-recovery.md) | 409 conflict recovery — never auto-apply | W3/W4 |
| [0040](./0040-role-aware-command-palette.md) | Role-aware, safe-only command palette (⌘K) | W3, rebuilt W4 |

## Hardening decisions (Wave 6–7)

| ADR | Decision | Wave |
|---|---|---|
| [0041](./0041-canonical-tenant-scoping.md) | Canonical tenant scoping — required `OrganizationContext` at the data boundary, remainder quarantined fail-closed | W7A |
