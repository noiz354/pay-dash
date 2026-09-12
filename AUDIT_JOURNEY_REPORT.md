# Web App User Journey Audit — PayDash / Kinetic Ledger

> **Scope:** `apps/web` — Next.js App Router + `next-intl` + Better Auth + Prisma Postgres + in-memory fallback stores  
> **Branch:** `arena/01a093bc-pay-dash` @ `f5942c38` | **Tanggal:** 2026-09-12  
> **Sifat:** Read-only, grounded pada implementasi kode. Setiap temuan merujuk path file / fungsi aktual.  
> **Routing:** Next.js App Router `src/app/[locale]/...` (`[locale]` = `en` | `id`, default `id`, `localePrefix: as-needed`)

---

## 1. Executive Summary

**PayDash Kinetic Ledger** adalah dashboard payment gateway enterprise (Xendit) yang sudah **migrated dari static HTML prototype ke Next.js App Router produktif** — 38 halaman ter-rout­ing, 16 Server Action modules, ~18 data store, webhook ingress real, dan RBAC 8-role.

**Temuan Utama:**

- **Routing & shell sudah matang.** `src/proxy.ts` + `next.config.ts rewrites` + `[locale]/layout.tsx` menjamin setiap bare URL (`/transactions`, `/customers`) ter-render di dalam shell (sidebar tetap), 404 in-shell bukan white page, dan skeleton streaming di setiap list page. Ini menghilangkan 90% broken route yang ada di prototype.
- **Business flow inti jalan end-to-end** untuk persona merchant/operator: `Sign-up → Dashboard → Create Transaction → Transaction Detail → Refund/Retry → Balance → Payout Bulk → Payout Detail → Release/Cancel` semuanya memiliki Server Action, revalidatePath, toast feedback, dan deep-link (`?refund=1`, `?topup=1`).
- **Auth ada tapi tidak enforced secara default.** `proxy.ts:84-105` hanya redirect ke `/sign-in` bila `AUTH_ENFORCED=1`. Di preview/dev (`AUTH_ENFORCED` unset) semua `/dashboard`, `/transactions`, `/balance`, `/payouts`, dll terbuka tanpa session. Ini by design (ADR-0004) tapi menjadi **P1 security gap** jika deploy ke production tanpa set env.
- **State sudah real, tidak lagi hard-coded.** Setiap angka di prototype yang dulu string literal (`Rp 1.240.500.000`, `14,209 alerts`) kini derived: `balance.ts` derivasi dari ledger + payout + top-up; `risk.ts` derivasi dari ledger riskScore; `audit.ts` derivasi dari 4 store; `payouts.ts` derivasi aggregat dari recipients. Konsistensi lintas halaman terjamin.
- **Gap utama:** (1) RBAC belum di-enforce di proxy — 18 rute tidak ada guard per-role; pengecekan `requireOrgContext("permission")` hanya di beberapa Server Action (customers, transactions refund) tapi tidak di payouts release, team, settings. (2) Duplicate workflow (Create Customer ada di `/customers` dan `/subscriptions` dialog, Create Transaction ada di dashboard quick action & ledger). (3) Beberapa empty/error state belum ditemukan (lihat §3). (4) Navigation yang sangat panjang (30 item sidebar) tanpa grouping/collapse adalah P2 UX gap.

**Kesimpulan:** App siap untuk UAT internal / demo dengan TEST MODE, tetapi **belum siap untuk production money-movement tanpa mengaktifkan `AUTH_ENFORCED` dan melengkapi RBAC guard per-route**.

---

## 2. Architecture & Routing Overview

### 2.1 Routing System

```
Next.js App Router (15.x) + next-intl 4.x
├── app/page.tsx                    → root chooser scaffold (Kinetic Ledger)
├── app/layout.tsx                  → root html/body + next-intl provider wrapper
├── app/[locale]/layout.tsx         → Sidebar + BottomNav + NextIntlClientProvider
│                                   → validates locale, 404 if not in ["en","id"]
├── app/[locale]/*/*.tsx            → ~38 pages (lihat §3)
├── app/api/*/route.ts              → Route Handlers (health, auth, webhooks, exports, ai-journal)
├── proxy.ts  (alias middleware.ts)  → i18n routing + auth gate + rewrites
└── next.config.ts rewrites/headers → bare → /id/* rewrite, security headers, Sentry
```

**File kunci:**

- `src/proxy.ts:1-145` — `handleI18nRouting` (next-intl) + bare→defaultLocale rewrite + session cookie check + public path handling + in-shell 404 fallback.
- `src/i18n/routing.ts:3-7` — `locales: ["en","id"], defaultLocale: "id", localePrefix: "as-needed"`.
- `src/app/[locale]/layout.tsx:1-28` — App Shell (Addy Osmani pattern: shell cached, content streamed).
- `next.config.ts:8-44` — rewrites untuk 30 appRoutes + 3 dynamic routes (`transactions/:id`, `customers/:id`, `billing/:id`).
- `middleware.ts` — re-export `src/proxy.ts` (Next.js hanya load root atau `src/middleware.ts`).

### 2.2 Data Layer

```
Postgres/Prisma (prod)  ←→  in-memory globalThis stores (dev/preview fallback)
src/server/data/*.ts    → single seam per domain (transactions, payouts, balance, customers, etc.)
src/server/repositories/provider-read.ts → live provider read (Xendit TEST)
src/domain/organization/roles.ts → RBAC matrix 8 roles × 27 permissions
src/lib/auth.ts → Better Auth instance (emailAndPassword, prismaAdapter)
```

Setiap `data/*.ts` memiliki `seed()` deterministik (mulberry32) untuk preview, dan `tryProvider*()` untuk live Xendit bila `PaymentProviderConnection` TEST tersedia. Mutasi selalu `revalidatePath("/[locale]/...", "page")`.

### 2.3 Auth

- `src/lib/auth.ts:12-52` — `betterAuth({ database: prismaAdapter, emailAndPassword.enabled: true, session 7d })`.
- `src/lib/auth-client.ts` — `signIn.email`, `signUp.email` (client SDK).
- `src/proxy.ts:89-102` — cek `request.cookies.has("better-auth.session_token" || "__Secure-...")`, redirect ke `/{locale}/sign-in?redirect=...` jika `AUTH_ENFORCED=1` dan `isAppRoute`.

---

## 3. Page Inventory

> **Auth column:** `Open` = dapat dirender tanpa session bila `AUTH_ENFORCED≠1` (preview default). `Guarded (opt-in)` = akan redirect ke sign-in jika `AUTH_ENFORCED=1`. `Public` = tidak pernah redirect.  
> **Persona:** berdasarkan `src/domain/organization/roles.ts` + sidebar visibility (semua item visible, tidak ada conditional UI per-role — gap).

| # | Route (canonical) | File | Persona (impl.) | Auth | Entry Point Utama | Primary Purpose |
|---|-------------------|------|-----------------|------|-------------------|-----------------|
| 1 | `/` | `app/page.tsx` | Semua | Public | Direct URL | Chooser scaffold → link ke `/en/dashboard` & `/id/dashboard` |
| 2 | `/{locale}/sign-in` | `app/[locale]/sign-in/page.tsx` | Guest | Public | Direct, `?redirect=` dari proxy, link dari sign-up | Email+password login via Better Auth |
| 3 | `/{locale}/sign-up` | `app/[locale]/sign-up/page.tsx` | Guest | Public | Link "Sign up" dari sign-in | Registrasi email+password → redirect `/dashboard` |
| 4 | `/{locale}/dashboard` | `app/[locale]/dashboard/page.tsx` | Auth (semua role) | Guarded | Sidebar "Dashboard", `/en`, `/id`, root chooser | Metrik 7d, setup progress, quick actions, BalanceStrip, chart range, recent 5 tx |
| 5 | `/{locale}/transactions` | `app/[locale]/transactions/page.tsx` | `transaction.read` | Guarded | Sidebar, dashboard metric tile, customer profile link | Ledger 46 tx, filter status/channel/range/q, page, create dialog, export CSV |
| 6 | `/{locale}/transactions/[id]` | `app/[locale]/transactions/[id]/page.tsx` | `transaction.read` | Guarded | Row click, row actions, audit/payment-link deep link | Detail summary, customer card, timeline, raw JSON, Refund/Retry |
| 7 | `/{locale}/balance` | `app/[locale]/balance/page.tsx` | `transaction.read` | Guarded | Sidebar, dashboard BalanceStrip, payout detail link | Balance overview (available/pending/reserved), trend, movements list, TopUp/Withdraw |
| 8 | `/{locale}/customers` | `app/[locale]/customers/page.tsx` | `customer.read` | Guarded | Sidebar, bottom-nav, dashboard quick action `?new=1` | Directory metrics, filters, CSV export, create customer, table with row actions |
| 9 | `/{locale}/customers/[id]` | `app/[locale]/customers/[id]/page.tsx` | `customer.read` | Guarded | Directory row, transaction detail "View customer" | Header, edit dialog, lifetime stats, payment methods, tx panel |
|10 | `/{locale}/billing` | `app/[locale]/billing/page.tsx` | `report.export` | Guarded | Sidebar, dashboard quick action "Invoices" | Invoice list (derived dari ledger fees), filters, CSV, create link to detail |
|11 | `/{locale}/billing/[id]` | `app/[locale]/billing/[id]/page.tsx` | `report.export` | Guarded | Billing row click | Header, totals, line items, billed tx (5), payment timeline |
|12 | `/{locale}/payouts` | `app/[locale]/payouts/page.tsx` | `payout.*` | Guarded | Sidebar, breadcrumb dari bulk/detail | Summary 4 cards, batch history filterable, create batch dialog |
|13 | `/{locale}/payouts/bulk` | `app/[locale]/payouts/bulk/page.tsx` | `payout.create` | Guarded | Sidebar, payouts page link, bulk sidebar | Summary + dropzone CSV → parse → create batch, recent 5 batches |
|14 | `/{locale}/payouts/[id]` | `app/[locale]/payouts/[id]/page.tsx` | `payout.*` | Guarded | Payouts table row, bulk recent | Batch header, 4 amount cards, recipients table, timeline, Release/Cancel/Retry |
|15 | `/{locale}/payouts/settings` | `app/[locale]/payouts/settings/page.tsx` | `settings.manage` | Guarded | Sidebar, balance "Payout settings", payout detail | Cadence/day/minimum/notify schedule + destination account + bank accounts |
|16 | `/{locale}/subscriptions` | `app/[locale]/subscriptions/page.tsx` | `recurring.*` | Guarded | Sidebar | MRR stats, filter q/status, table, row actions, create dialog (derivative) |
|17 | `/{locale}/team` | `app/[locale]/team/page.tsx` | `team.manage` | Guarded | Sidebar | Tabs Members/Roles/Pending, filters, CSV export, add member dialog |
|18 | `/{locale}/fraud` | `app/[locale]/fraud/page.tsx` | `audit.read` | Guarded | Sidebar | Fraud console derived dari blocklist store (10 seeded), metrics, card/panel |
|19 | `/{locale}/fraud/blocklist` | `app/[locale]/fraud/blocklist/page.tsx` | — | Guarded | Tab dari fraud, sidebar | Full blocklist CRUD (IP, email domain, card, etc.), pagination |
|20 | `/{locale}/kyc` | `app/[locale]/kyc/page.tsx` | `kyc.prepare/submit` | Guarded | Sidebar | 3-step rail, profile completeness, doc upload/record, awaiting review |
|21 | `/{locale}/audit` | `app/[locale]/audit/page.tsx` | `audit.read` | Guarded | Sidebar | 177 seeded events (PAYMENTS 140, PAYOUTS 10, WEBHOOKS 7, CONFIG 20), filters, CSV |
|22 | `/{locale}/reports/builder` | `app/[locale]/reports/builder/page.tsx` | `report.export` | Guarded | Sidebar "Reports" | Report builder (custom export), format/fields selection |
|23 | `/{locale}/payments/links` | `app/[locale]/payments/links/page.tsx` | `money_in.create` | Guarded | Sidebar "Payment Links" | Link list 8 seeded, filter q/status/kind, create dialog, QR/copy, simulate payment |
|24 | `/{locale}/payments/links/[id]` | `app/[locale]/payments/links/[id]/page.tsx` | `money_in.create` | Guarded | Links row click | Detail items, status derive, expire, simulate payment |
|25 | `/{locale}/payments/platform` | `app/[locale]/payments/platform/page.tsx` | `transfer.*` | Guarded | (orphan, tidak di sidebar) | Connected accounts, split rules, transfers — platform settlement |
|26 | `/{locale}/webhooks` | `app/[locale]/webhooks/page.tsx` | `provider.*` | Guarded | Sidebar | Endpoint card (host-derived URL), logs filterable, simulate dialog |
|27 | `/{locale}/webhooks/[id]` | `app/[locale]/webhooks/[id]/page.tsx` | `provider.*` | Guarded | Webhooks row click | Payload detail, status, replay button |
|28 | `/{locale}/system` | `app/[locale]/system/page.tsx` | — | Guarded | Sidebar | Platform health (last24h webhook outcomes), subtasks, ledger source |
|29 | `/{locale}/onboarding` | `app/[locale]/onboarding/page.tsx` | — | Guarded | Sidebar | Progress derived (tracked sections), 4 cards with deep-link CTAs |
|30 | `/{locale}/support` | `app/[locale]/support/page.tsx` | — | Guarded | Sidebar, transaction detail "Contact support", `?ref=` | Topics grid, system status link, mailto with ref prefill |
|31 | `/{locale}/risk` | `app/[locale]/risk/page.tsx` | `audit.read` | Guarded | Sidebar | Alerts bento (riskScore≥60), volume limits, rules table, profile panel, draft/deploy |
|32 | `/{locale}/ai-journal` | `app/[locale]/ai-journal/page.tsx` | — | Public (APP_ROUTE but intentionally public) | Sidebar | Gemini journal, Firebase auth, Firestore isolated threads, submission toolkit |
|33 | `/{locale}/ai-journal/ops-copilot` | `app/[locale]/ai-journal/ops-copilot/page.tsx` | — | Public | Sidebar, journal route cards | Ops copilot agent |
|34 | `/{locale}/ai-journal/recovery-agent` | `app/[locale]/ai-journal/recovery-agent/page.tsx` | — | Public | Sidebar | Recovery agent (refund/retry ops) |
|35 | `/{locale}/ai-journal/readiness-agent` | `app/[locale]/ai-journal/readiness-agent/page.tsx` | — | Public | Sidebar | Readiness checker |
|36 | `/{locale}/ai-journal/evaluation` | `app/[locale]/ai-journal/evaluation/page.tsx` | — | Public | Sidebar | Evaluation dashboard |
|37 | `/{locale}/settings` | `app/[locale]/settings/page.tsx` | `settings.manage` | Guarded | Sidebar, related-links di payouts/support | Hub 4 sections + related links (payout schedule, webhooks, billing) |
|38 | `/{locale}/settings/merchant` | `app/[locale]/settings/merchant/page.tsx` | `settings.manage` | Guarded | Sidebar "Merchant", settings hub | Legal/dba/address/tax/support/descriptor/brand/logo/autoDebit form |
|39 | `/{locale}/settings/notifications` | `app/[locale]/settings/notifications/page.tsx` | `settings.manage` | Guarded | Sidebar | Channel toggles + 5 topics (digest/dashboard/sms/email), critical lock |
|40 | `/{locale}/settings/api-keys` | `app/[locale]/settings/api-keys/page.tsx` | `settings.manage` | Guarded | Sidebar | 3 seeded keys, create/revoke/roll, scopes, env LIVE/TEST |
|41 | `/{locale}/settings/developer` | `app/[locale]/settings/developer/page.tsx` | `settings.manage` | Guarded | Sidebar + bottom-nav fallback, webhooks page link | Sandbox toggle, IP allowlist CRUD |
|42 | `/{locale}/settings/mcp` | `app/[locale]/settings/mcp/page.tsx` | `settings.manage` | Guarded | (nested, tidak di sidebar top) | MCP server control, Xendit data source |
|43 | `/{locale}/not-found` (in-shell) | `app/[locale]/not-found.tsx` | Semua | — | Unmatched rewrite | EmptyState + 3 links (dashboard/transactions/customers) |

> **Catatan:** 5 detail pages punya `loading.tsx` + `not-found.tsx` (transactions, customers, billing, payouts, webhooks, balance, payments/links, etc.) — total 18 boundary files. `fraud/page.tsx`, `kyc`, `risk`, dsb tidak punya `loading.tsx` (P3 gap, §10).

---

## 4. Persona / Role Matrix

Definisi formal di `src/domain/organization/roles.ts:14-85`.

| Permission / Route | OWNER | FINANCE_ADMIN | FINANCE_OPERATOR | DEVELOPER | ANALYST | COMPLIANCE | RISK_ANALYST | SUPPORT |
|--------------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **provider.connect.live** (`/settings/api-keys` LIVE, MCP) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **provider.connect.test** (`/settings/developer` sandbox) | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **money_in.create** (`/payments/links`, Create Tx) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **payout.create** (`/payouts/bulk`, Create Batch) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **payout.release/cancel** (`/payouts/[id]` Release) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **payout.retry** (Retry failures) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **refund.prepare/execute** (`/transactions/[id]` Refund) | ✅/✅ | ✅/✅ | ✅/❌ | ❌ | ❌ | ❌ | ❌ | ✅/❌ |
| **transfer.execute / split.activate** (`/payments/platform`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **kyc.prepare/submit** (`/kyc`) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅/✅ | ❌ | ❌ |
| **recurring.create** (`/subscriptions`) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **customer.read / transaction.read** (`/customers`, `/transactions`, `/balance`) | ✅ | ✅ | ✅ | ✅(tx only) | ✅ | ✅ | ✅ | ✅ |
| **audit.read / report.export** (`/audit`, `/reports/builder`, `/billing`) | ✅ | ✅ | ✅ (report) | ✅ (report) | ✅ | ✅ (audit) | ✅ | ❌ |
| **team.manage / settings.manage** (`/team`, `/settings/*`) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Observasi grounded:**

- **Proxy tidak mengecek role.** `src/proxy.ts:93-99` hanya cek `hasSession`, tidak cek `role` claim. Jadi FINANCE_OPERATOR bisa buka `/settings/api-keys` dan `/team` di UI — akan gagal hanya bila Server Action memanggil `requireOrgContext("permission")`.
- **Enforcement parsial di Server Action.** `src/server/actions/customers.ts:28` memanggil `requireOrgContext("customer.read")`; `transactions.ts:refundTransactionAction:147-160` memanggil `tryProviderRefund` dengan `approverId` untuk dual-control. Namun `payouts.ts:approveBatchAction` tidak memanggil `requireOrgContext` — siapapun dengan session bisa approve batch (P0/P1 temuan).
- **Sidebar tidak conditional.** `src/components/layout/sidebar.tsx:6-30` render 30 item tanpa `role` filter; `BottomNav` 5 item tanpa filter. User SUPPORT melihat tombol "Payout Settings" yang akan error saat di-submit (confusing journey).
- **AI Journal sengaja public.** `src/proxy.ts:4-12` memasukkan `/ai-journal` di `APP_ROUTE_PREFIXES` tapi juga di `PUBLIC_PATHS` via `isPublic(pathname.includes(p))` — sehingga tidak redirect walau `AUTH_ENFORCED`. Firebase Auth dipakai terpisah di dalam page.

---

## 5. User Journey per Page

Setiap sub-bab mengikuti format: **Entry → Preconditions → Actions (dengan handler aktual) → System Reaction → State**.

### 5.1 `/` — Root Chooser

- **Entry:** Direct URL `/`.
- **Preconditions:** Tidak ada.
- **Actions:** Klik "Dashboard /en" → `Link href="/en/dashboard"`; "Dashboard /id" → `/id/dashboard`; "Gemini Journal" → `/ai-journal` (`app/page.tsx:12-18`).
- **State:** Static, tidak ada loading/error. `proxy.ts:20-23` pass-through untuk `/`.

### 5.2 `/{locale}/sign-in` & `sign-up`

- **Entry:** Direct URL, link antar auth pages (`href="sign-up"` relative), `?redirect=` param dari proxy, bottom-nav tidak (P2 — tidak ada entry dari shell saat logged-out).
- **Preconditions:** Tidak ada; `isPublic` bypass auth.
- **Actions:**
  | Action | Handler | API | State mutation | UI feedback |
  |--------|---------|-----|---------------|-------------|
  | Submit sign-in | `onSubmit → signIn.email({email,password})` (`sign-in/page.tsx:14-24`) | `POST /api/auth/sign-in/email` (Better Auth `[...all]/route.ts`) | session cookie `better-auth.session_token` | `loading` spinner → error `<p class="text-[var(--error)]">` atau `router.push(redirect)` |
  | Submit sign-up | `signUp.email({email,password,name})` (`sign-up/page.tsx:16-23`) | `POST /api/auth/sign-up/email` | User + Account row (Prisma) | sama, redirect `/dashboard` |
- **State:** `idle` → `loading` (`setLoading(true)`) → `success` (navigate) / `error` (inline text). Tidak ada validation error per-field (hanya `required` HTML), tidak ada `forgot password` link (P2 gap).

### 5.3 `/{locale}/dashboard`

- **File:** `app/[locale]/dashboard/page.tsx` (dynamic, `Suspense` streaming).
- **Entry:** Root chooser, sidebar, bottom-nav Home, `/en` & `/id` rewrite, post-sign-in redirect.
- **Preconditions:** Opt-in auth (lihat §2.3). Data: `getLedgerMetrics()`, `getAnalyticsSeries()`, `listTransactions(pageSize 5)`, `getBalanceOverview()` (via `BalanceStrip`), `SetupProgress` (onboarding status).
- **Actions:**
  - **Metric tile click** → `Link href="/transactions?range=7d"` atau `?status=SUCCEEDED` / `FAILED` (`dashboard/page.tsx:46-78`).
  - **Chart range tabs** → `ChartRangeTabs` writes `?range=7d|30d|90d` ke URL, `key={range}` Suspense re-fire (`dashboard/page.tsx:238-246`).
  - **Quick Actions** 4 cards: Invoices→`/billing`, Add Customer→`/customers?new=1`, Payouts→`/payouts/bulk`, AI Journal→`/ai-journal` (`dashboard/page.tsx:148-165`).
  - **View all** → `/transactions` (`RecentTransactions` toolbar).
  - **Setup checklist** → each row is `SetupStepToggle` Server Action form (`components/dashboard/setup-step-toggle.tsx:useActionState`).
  - **BalanceStrip** → link ke `/balance` (`components/dashboard/balance-strip.tsx`).
- **State:** `loading` (skeleton 3 cards + chart), `populated` (metrics + chart + table), `empty` (chart `data=[]` empty state), `error` → `app/[locale]/error.tsx` retry button. Tidak ada `not-found` (dashboard selalu exist).

### 5.4 `/{locale}/transactions` (Ledger)

- **File:** `app/[locale]/transactions/page.tsx` + `components/transactions/transactions-table.tsx`.
- **Entry:** Sidebar, bottom-nav, dashboard tiles/chart/table "View all", customer profile "All payments from customer" (`/transactions?q=email`).
- **Preconditions:** — . `searchParams` parsed dengan `one()`.
- **Actions:**
  | Action | Handler | Service | Revalidate |
  |--------|---------|---------|------------|
  | Search/filter (status/channel/range/q) | `TransactionFilters` writes URLSearchParams → `router.push(?status=...)` (`components/transactions/transaction-filters.tsx`) | `listTransactions(filters)` (`server/data/transactions.ts`) | SSR re-render dengan `key={searchParams}` Suspense |
  | Pagination prev/next | `TablePagination` Link `?page=N` | sama | sama |
  | Create transaction | `CreateTransactionDialog` → `createTransactionAction` (`components/transactions/create-transaction-dialog.tsx:50-72`) | `createTransaction(validated)` → ledger push | `revalidatePath /dashboard + /transactions` → toast "Transaction txn_... created" + `router.refresh()` + `router.push(/transactions/${id})` optional |
  | Row click | `ClickableRow href=/transactions/${id}` (`transactions-table.tsx:80-98`) | `getTransaction(id)` | navigate detail |
  | Row actions: Refund / Support / Copy | `RowActions` dropdown (`row-actions.tsx`) | `?refund=1` deep-link ke detail, `support?ref=` , `navigator.clipboard` | — |
  | Export CSV | `ExportCsvButton endpoint=/api/exports/transactions` | `GET /api/exports/transactions` → CSV stream | download |
- **State:** `initial` (Suspense fallback `TableSkeleton rows=10 cols=7`), `populated` (table), `empty-unfiltered` → EmptyState "No transactions yet" + CTA create, `empty-filtered` → "No transactions match these filters" + Clear filters, `error` via `SectionBoundary`/`error.tsx`.

### 5.5 `/{locale}/transactions/[id]`

- **File:** `app/[locale]/transactions/[id]/page.tsx` + `components/transactions/refund-dialog.tsx` + `retry-button.tsx`.
- **Entry:** Ledger row click, create dialog "View" toast action, billing detail BilledTransactions, webhook payload link, support `?ref` back.
- **Preconditions:** `id` must exist di ledger; `notFound()` jika `getTransaction(id)==null`.
- **Actions:**
  - **Back to ledger** → `Link /transactions` breadcrumb.
  - **Contact support** → `Link /support?ref=${referenceId}`.
  - **Copy ID / Copy email / Copy JSON** → `CopyButton` (`navigator.clipboard.writeText` + toast).
  - **View customer** → derived via `customerIdFromEmail(email)` → `/customers/${id}`.
  - **All payments from customer** → `/transactions?q=${email}`.
  - **Retry** (hanya `status=FAILED`) → `RetryButton` → `retryTransactionAction` (`server/actions/transactions.ts:165-177`) → revalidate detail+ledger → toast "Payment re-submitted".
  - **Refund** (disabled jika `refundedAmount>=amount` atau `FAILED/PENDING`) → `RefundDialog` → `refundTransactionAction` → cek `tryProviderRefund` dulu (dual-control `approverId`), fallback `refundTransaction()` → revalidate → toast + `router.refresh()`. Param `?refund=1` auto-open.
- **State:** `loading` (`loading.tsx`), `not-found` (`not-found.tsx` → in-shell 404), `populated`, `submitting` (RefundSubmit `useFormStatus pending` spinner), `success` (toast), `validation error` (fieldErrors.amount inline), `backend error` (toast.error / duplicate refund message), `forbidden` tidak ada (gap §10).

### 5.6 `/{locale}/balance`

- **File:** `app/[locale]/balance/page.tsx` + `server/data/balance.ts` + `components/balance/*`.
- **Entry:** Sidebar, dashboard BalanceStrip, payout detail "View balance".
- **Preconditions:** — . Derivasi `getBalanceOverview()` dari ledger + payouts + topUps. `OPENING_BALANCE=1_000_000_000`.
- **Actions:**
  - **Top Up** → `TopUpDialog` (`components/balance/top-up-dialog.tsx`) → `topUpBalanceAction` (`server/actions/balance.ts`) → `revalidatePath /balance + /payouts` → toast + `available` baru. Deep-link `?topup=1`.
  - **Withdraw** → `WithdrawDialog` → `withdrawBalanceAction` → creates one-recipient payout batch + immediately approve (`server/data/balance.ts:withdrawBalance` creates+approves batch) → revalidate. Deep-link `?withdraw=1`.
  - **Auto-withdrawal toggle** → `AutoWithdrawalToggle` → `toggleAutoWithdrawalAction` (`useActionState`) → flips `automated` & promotes `manual`→`daily`.
  - **Movements filters** (type/status/range/q/sort) → writes URLSearchParams → `listMovements(filters)` → Suspense re-fire.
  - **Export CSV** → `GET /api/exports/balance`.
- **State:** `loading` (Card skeleton), `populated`, `empty movements` (EmptyState), `submitting` (topUp/withdraw pending), `success` (new balance toast), `validation error` (parseAmount null → field error), `error` via `SectionBoundary`.

### 5.7 `/{locale}/customers`

- **File:** `app/[locale]/customers/page.tsx` + `server/data/customers.ts` + `components/customers/*`.
- **Entry:** Sidebar, bottom-nav, dashboard Quick Actions `?new=1` (auto-open create dialog), transaction detail "View customer", transactions `q=email` back, team not.
- **Preconditions:** — . `listCustomers` merged ledger customers + manual customers.
- **Actions:**
  | Action | Handler |
  |--------|---------|
  | Search q / status / sort / page | `CustomerFilters` URL state → `listCustomers` |
  | Export | `ExportCsvButton → GET /api/exports/customers` |
  | Create customer | `CreateCustomerDialog` → `createCustomerAction` (`server/actions/customers.ts:18-55`) → `requireOrgContext("customer.read")` + `createProviderCustomer` (TEST) → `createCustomer` + revalidate → toast + `router.push(/customers/${id})` |
  | Row click | `CustomersTable` row → `/customers/${id}` |
  | Row actions: View profile / View transactions / Copy email / Edit / Archive | `CustomerRowActions` dropdown → `router.push(/customers/id)`, `/transactions?q=email`, `navigator.clipboard`, `?edit=1`, `archiveCustomerAction` |
  | Bulk copy/Archive selected | `CustomersTable` toolbar selection state |
- **State:** `loading` (metrics skeleton + TableSkeleton), `empty-unfiltered` → "No customers yet" + create CTA, `empty-filtered` → "No customers match" + clear, `submitting` (useFormStatus), `success` (toast), `validation` (name/email inline), `not-found` tidak di list (ada di detail).

### 5.8 `/{locale}/customers/[id]`

- **Entry:** Customers row, transaction detail "View customer", subscription row "View customer".
- **Preconditions:** `customerIdFromEmail` deterministik `cust_` + hash(email) — always resolves; `notFound()` jika `getCustomer(id)==null`.
- **Actions:** `EditCustomerDialog` → `updateCustomerAction`; `CustomerStatusMenu` → `archiveCustomerAction`; copy actions; `CustomerTransactionsPanel` links ke `/transactions/${tx.id}`.
- **State:** `loading`, `not-found`, `populated`, `submitting` (edit), `validation error`.

### 5.9 `/{locale}/billing` & `[id]`

- **Entry:** Sidebar "Billing", dashboard Quick Actions "Invoices", customer detail not, payout settings not. Billing row → `[id]`.
- **Preconditions:** `listInvoices()` derived dari ledger (fees) + historical seeded invoices.
- **Actions:** Filter status/range/q, Export, `PayInvoiceDialog` → `payInvoiceAction` (ledger check), `SavePaymentMethodDialog` → `createPaymentMethodAction`, `DownloadInvoiceButton` → `GET /api/exports/invoices/[id]`, row actions View/Pay/Download.
- **State:** loading skeleton, empty, populated, submitting (pay), success/error (toast), not-found (detail).

### 5.10 `/{locale}/payouts` (index), `/bulk`, `/[id]`, `/settings`

- **File:** `app/[locale]/payouts/page.tsx`, `bulk/page.tsx`, `[id]/page.tsx`, `settings/page.tsx`; `server/data/payouts.ts`; `server/actions/payouts.ts`.
- **Entry graph:**
  ```
  /balance ──→ /payouts ──→ /payouts/bulk ──→ /payouts/[id] ←─ /balance (withdraw batch)
     ↕              ↕               ↕                  ↕
  /payouts/settings ←──────────────────────────────────┘
  BottomNav tidak ada payouts → hanya sidebar.
  ```
- **Preconditions:** `isApprovable(status)` = DRAFT/SCHEDULED; `isCancellable` = DRAFT/SCHEDULED; `isRetryable` = FAILED/PARTIAL/RETURNED (`lib/payout-status.ts:38-50`).
- **Actions payouts/index:**
  - Filters q/status/range/sort/page → `listBatches`.
  - `CreateBatchDialog` → `createBatchAction` (CSV re-parse server-side).
  - Export → `/api/exports/payouts`.
- **Actions payouts/bulk:**
  - `BatchUploadDropzone` (`components/payouts/batch-upload-dropzone.tsx`) file input + CSV text → client parse preview + `createBatchAction` with `FormData{csv}` → revalidate → toast + link to new batch. Recent 5 table links to `/payouts/[id]`.
- **Actions payouts/[id]:**
  - Summary 4 cards derived via `summarise(batch)`.
  - `ReleaseBatchDialog mode=send` → `approveBatchAction` (`FormData{id,confirm=on}`) → `approveBatch(id)` flips recipients PENDING→PAID/FAILED → revalidate.
  - `ReleaseBatchDialog mode=cancel` → `cancelBatchAction`.
  - `RetryFailuresButton` → `retryBatchFailuresAction` → per-recipient retry.
  - `RecipientsTable` per-row retry → `retryRecipientAction` (`FormData{batchId,recipientId}`) → toast.
  - Export recipients CSV → `/api/exports/payouts/[id]`.
  - Links to `/balance` & `/payouts/settings`.
- **Actions payouts/settings:**
  - Schedule form → `updatePayoutScheduleAction` (`FormData{automated,cadence,weekday,monthDay,minimumAmount,notify*}`) → `updatePayoutSettings` + revalidate.
  - Destination account selector → `setDestinationAccountAction`.
  - Add bank account → `addBankAccountAction` → validasi `isValidAccountNumber` (8-20 digits).
  - Auto-withdrawal di balance juga mutates same store (shared via `getPayoutSettings()`).
- **State:** loading skeletons, populated, empty (no batches → empty state with create dialog), submitting (release/cancel pending), validation (CSV no valid rows → fieldErrors.csv, accountNumber regex), success (toast batchId created), error (toast retry failed), not-found ([id]).

### 5.11 `/{locale}/subscriptions`

- **Entry:** Sidebar. Tidak ada deep-link dari customer (gap — customer detail tidak punya "Create subscription for this customer" CTA).
- **Actions:** Filter q/status/page, stat cards (Active MRR, Pending, Past Due) derived dari `listSubscriptions` + `subscriptionSummary`, table row actions → `SubscriptionRowActions` (view customer, view email), create dialog → `createSubscriptionAction` (needs customer select from `directoryCustomers`), export CSV.
- **State:** loading, empty (no plans yet / no match), populated, submitting, validation, error.

### 5.12 `/{locale}/team`

- **Entry:** Sidebar. Breadcrumb none.
- **Actions:** Tabs Members/Roles/Pending (`Tabs` client, not URL state), Members filters q/status/page, add member → `inviteMemberAction` (`FormData{email,role}`), members board row actions (change role, remove, resend), pending invites actions (resend/cancel/accept). `INVITE_TTL_DAYS=7`. Export CSV.
- **State:** loading, empty (no members filtered), populated, submitting, error (duplicate email, invalid role).

### 5.13 `/{locale}/fraud` & `/fraud/blocklist`

- **Entry:** Sidebar Fraud → `/fraud`; tab/dropdown → `/fraud/blocklist`. Count "10 blocked entities" links between pages.
- **Actions:** Fraud overview metrics from `blocklistSummary()` + `listBlocklist()`, Tabs Card Numbers/IP/Domain, `AddBlocklistDialog` → `addBlocklistAction` (validasi `isValidIp`, `isValidEmailDomain`, `maskCardNumber`), per-entry remove → `removeBlocklistAction`, search/type/method filters, pagination, export blocklist.
- **State:** loading, populated, empty (no matches → empty state), submitting, validation (invalid IP → inline error), success (toast).

### 5.14 `/{locale}/kyc`

- **Entry:** Sidebar KYC, onboarding section deep-link.
- **Actions:** `KycUpload` (`components/kyc/kyc-upload.tsx`) file input + `submitKycDocumentAction` (`useActionState`) → `submitKycDocument({docType,fileName,fileSize})` stored in `server/data/kyc.ts` (in-memory single submission); `removeKycDocumentAction` untuk hapus; profile completeness banner links to `/settings/merchant`.
- **State:** `Action required` (no submission) vs `Awaiting review` (submitted), profile incomplete banner, uploading (pending), success/error (toast), file validation (max 10MB, PDF/JPEG/PNG).

### 5.15 `/{locale}/audit`

- **Actions:** Filters q/category/status/range/page writes URLSearchParams → `listAuditEvents(filters)` → `PaginatedAuditEvents` (pageSize 10), CSV export via `GET /api/exports/audit`, table paginated. `auditSummary()` for header total. Derived dari 4 stores (PAYMENTS 140, PAYOUTS 10, WEBHOOKS 7, CONFIG 20 = 177).
- **State:** loading not (no skeleton — gap, renders directly), populated, empty (no events match → EmptyState), error via error.tsx.

### 5.16 `/{locale}/reports/builder`

- **Entry:** Sidebar Reports (only sub-route `builder` exists — `/reports` itself 404 in-shell, P3).
- **Actions:** Builder form (date range, fields, format) → `GET /api/exports/{resource}` (transactions, customers, payouts, etc.) or CSV generation client-side. Derived preview.
- **State:** populated, empty, exporting (pending), success download, validation (missing fields).

### 5.17 `/{locale}/payments/links` & `/links/[id]`

- **Entry:** Sidebar "Payment Links". Not in BottomNav.
- **Actions:**
  | Action | Handler |
  |--------|---------|
  | Filter q/status/kind/page | `LinksFilters` → `listLinks` |
  | Create link | `CreateLinkDialog` → `createPaymentLinkAction` (items array, payerEmail, expiry) → `createLink` + revalidate → toast + copy link |
  | Copy link / QR | `CopyButton` + `QrCode` (`components/ui/qr-code.tsx`) |
  | Expire link | `ExpireLinkButton` → `expireLinkAction` |
  | Simulate payment | `SimulatePaymentButton` → `recordLinkPaymentAction` → `createTransaction` (ledger) + mark link paid → toast with View transaction |
  | View detail | Row click → `/payments/links/[id]` |
  | Detail actions | Same + share |
- **Status derivation:** `deriveLinkStatus(link, paidReferenceIds)` precedence CANCELLED → PAID → EXPIRED → OPEN (`server/data/links.ts:95-103`). Expired by clock, paid by ledger.
- **State:** loading skeleton, empty (no links yet), empty-filtered, populated, submitting, validation (amount zero, no items), success (toast with linkId), expired/cancelled badge.

### 5.18 `/{locale}/payments/platform` (orphan)

- **Entry:** Tidak ada link di sidebar/bottom-nav/quick actions — hanya direct URL `/payments/platform` atau dari `lib` not. **Dead-end discovery.**
- **Purpose:** Connected accounts, split rules, platform transfers (Xendit platform settlement).
- **Actions:** Forms `createConnectedAccountAction`, `createSplitRuleAction`, `createTransferAction` (platform-settings-forms.tsx with `useActionState`). Read from `server/platform/*`.
- **State:** populated, empty, submitting, validation, error. Auth gap: no role guard.

### 5.19 `/{locale}/webhooks` & `/webhooks/[id]`

- **File:** `app/[locale]/webhooks/page.tsx` + `server/data/webhooks.ts` + `server/webhooks/*`.
- **Entry:** Sidebar Webhooks. Detail via row click.
- **Actions:**
  - Config card shows endpointUrl `https://${host}/api/webhooks/xendit` (from `headers().get("host")`).
  - Filters q/status/type/page → `listWebhooks`.
  - Simulate webhook → `SimulateWebhookDialog` → `simulateWebhookAction` (`FormData{type,payload}`) → creates webhook event + `recordWebhookDelivery` (dedupe) + project → revalidate.
  - Row click → `/webhooks/[id]` detail with `replayWebhookButton` → `replayWebhookAction` → re-insert event.
  - Inbound real: `POST /api/webhooks/xendit` verifies `x-callback-token` constant-time, parses JSON, `recordWebhookDelivery`, then `projectWebhookEvent` async (idempotent projection into CanonicalPayment status).
- **State:** loading skeleton, populated, empty (no callbacks match), `not-found` (detail), simulating (pending), success/error (toast), endpoint token not configured banner.

### 5.20 `/{locale}/system`

- **Entry:** Sidebar System. Linked dari support "View detailed status" & maybe health.
- **Purpose:** Platform health from live measurements, not static banner.
- **Actions:** Read-only. Shows `last24h` webhook outcomes, recent 5 callbacks, lastReceivedAt chip, ledger source info, DB check hint. No mutations.
- **State:** populated, loading skeleton, error via SectionBoundary.

### 5.21 `/{locale}/onboarding`

- **Entry:** Sidebar Onboarding. Breadcrumb from `/settings/merchant` (Accounts).
- **Actions:** Read-only progress derived from `getOnboardingStatus()` (trackedComplete/trackedTotal, progress %). Four `OnboardingCard` per section each with CTA real link (e.g., "Set up payout account" → `/payouts/settings`, "Complete KYC" → `/kyc`, "Connect provider" → `/settings/developer`, "Invite team" → `/team`). Compliance section shown but not counted.
- **State:** populated, loading, error.

### 5.22 `/{locale}/support`

- **Entry:** Sidebar Support, transaction detail "Contact support", `?ref=` param from any report flow.
- **Actions:** Topics grid 4 links (`/settings/api-keys`, `/payouts`, `/kyc`, `/reports/builder`); system status link → `/system`; email button → `mailto:support@kinetic.test?subject=...&body=ref` via `supportMailto(ref)` (`lib/support.ts`).
- **State:** static, + conditional `ref` banner if `searchParams.ref` present.

### 5.23 `/{locale}/risk`

- **Entry:** Sidebar Risk.
- **Actions:** AlertsBento derived dari `getRiskOverview()` (alerts = tx with riskScore≥60), VolumeLimitsCard → `saveVolumeDraftAction` (draft mutate, deploy `deployRiskSettings`), RulesTable read-only, RiskProfilePanel, header actions `RiskHeaderActions` deploy/discard (Server Actions).
- **State:** loading, populated, empty (no alerts → empty bento), draft pending badge vs active, deploying (pending), deployed (toast), error.

### 5.24 `/{locale}/ai-journal/*` (5 pages)

- **Entry:** Sidebar AI Journal + 4 sub-items. Public routes (no auth redirect).
- **Purpose:** Gemini journal — Firebase Google Sign-In, Firestore `users/{uid}` isolated threads, Gemini multi-turn, Secret Manager. Not a payment flow.
- **Actions:**
  | Page | Action | Handler |
  |------|--------|---------|
  | `/ai-journal` | Sign in Firebase | `gemini-journal-agent.tsx` `onSignIn` → `signIn()` Firebase |
  | | Chat message | `submitMessage(content, tag)` → `POST /api/ai-journal/chat` → Gemini API → Firestore save |
  | | Submission coach | `SubmissionToolkit` copy + `POST /api/ai-journal/evaluation` |
  | `/ops-copilot` etc. | Agent cards | `AgentRouteCards` links between agents |
  | `/evaluation` | Rate message | `POST /api/ai-journal/feedback` + `POST /api/ai-journal/reports` |
- **State:** signed-out (sign-in CTA), loading thread, streaming response, empty thread, error (quota, auth).

### 5.25 `/{locale}/settings/*` (6 pages)

| Page | File | Actions |
|------|------|---------|
| Hub `/settings` | `settings/page.tsx` | Overview 4 cards via `getSettingsOverview()` each link to sub-page + related links (payouts, webhooks, billing) |
| Merchant `/merchant` | `settings/merchant/page.tsx` | `MerchantProfileForm` → `updateMerchantProfileAction` (legalName, dba, address, taxId, descriptor, brandColor hex, logoUrl, autoDebit) |
| Notifications | `notifications/page.tsx` | `NotificationPreferencesForm` → `updateNotificationChannelAction` + `updateNotificationPreferenceAction` per topic (digest/channel toggles, critical topics locked) |
| API Keys | `api-keys/page.tsx` | `CreateApiKeyDialog` → `createApiKeyAction` (name, env, scopes, confirm), revoke/roll dialogs → `revokeApiKeyAction`/`rollApiKeyAction` (confirm literal "on"), `SecretReveal` one-time display |
| Developer | `developer/page.tsx` | `DeveloperToggle` (sandboxMode) → `updateDeveloperToggleAction` optimistic, `IpAllowlistManager` → `addIpAllowAction`/`removeIpAllowAction` |
| MCP | `mcp/page.tsx` | `McpServerControl` + `McpXenditControl` + `McpDataSourceControl` (MCP server domain-tools, xendit-tools, pg-stores) |

- **State per form:** `idle` → `submitting` (useFormStatus pending, button disabled) → `success` toast + revalidatePath → inline updated values / `error` toast + fieldErrors.

---

## 6. End-to-End Journeys

### Journey A — Money-In: Create Payment → Settle → Refund (Core Merchant Ops)

```
Sign-up
  ↓ (signUp.email → POST /api/auth/sign-up/email → session cookie)
Dashboard (metrics 7d, recent 5)
  ↓ CTA "Create Payment" atau ledger toolbar
Transactions — list (46 seeded, filterable)
  ↓ "Create Transaction" dialog (useActionState)
CreateTransactionDialog ──→ createTransactionAction  (zod validation)
  ├─[validation error]→ fieldErrors inline + toast.error
  └─[success]──→ ledger.push({status:PROCESSING}) → revalidatePath dashboard+ledger
                 → toast "Transaction txn_... created" [View] → router.refresh()
Transactions list (new row PENDING/PROCESSING di atas)
  ↓ click row
Transaction Detail (/transactions/[id])
  ├── [FAILED] → RetryButton → retryTransactionAction → status PENDING → toast
  ├── [SUCCEEDED/REFUNDED?] → RefundDialog → refundTransactionAction
  │     ├─[provider connected] → tryProviderRefund (dual-control approverId check)
  │     └─[no provider] → refundTransaction (ledger) → revalidate detail/ledger/dashboard
  └─ links: View customer → /customers/[id]
             All payments from customer → /transactions?q=email
             Contact support → /support?ref=...
Balance — overview updated (available = OPENING+settled−reserved)
  ↓ top-up movement derived
Audit Log — new PAYMENTS events (Payment created, captured/declined, refund)
```

**Step table:**

| Step | Page | User Action | System Action | Result |
|------|------|-------------|---------------|--------|
| 1 | `/sign-up` | Fill name/email/password, submit | `signUp.email` → Prisma User+Account | Cookie + redirect `/dashboard` |
| 2 | `/dashboard` | Klik "Create Payment" atau ke `/transactions` | Suspense + metrics fetch | Ledger visible |
| 3 | `/transactions` | Klik "Create Payment", isi customer/amount/channel, submit | `createTransactionAction` validasi Zod → ledger push | Toast + row baru PENDING |
| 4 | `/transactions/[id]` | Lihat summary + timeline (info→authorized→captured) | `getTransaction` | Timeline derived |
| 5 | `/transactions/[id]` | Jika SUCCEEDED, klik Refund → isi amount+reason → submit | `refundTransactionAction` cek remaining refundable → provider or ledger → revalidate | Status REFUNDED, balance movement REFUND, audit PAYMENTS event |
| 6 | `/balance` | Verifikasi available turun by refund amount | `getBalanceOverview` derivasi ulang | Movements list has REFUND |
| 7 | `/support?ref=` | Klik "Contact support" pre-filled | `supportMailto(ref)` | Mailto subject contains ref |

**Complexity:** Pages 5, Clicks min 11, Forms 2, API/Server Actions 2, Decisions 2 (refund vs retry, provider vs local).

### Journey B — Balance & Payouts: Top-Up → Withdraw → Batch Release → Retry

```
Balance (/balance)
  ↓ "Top Up" dialog (deep-link ?topup=1)
  TopUpDialog → topUpBalanceAction (parseAmount, method)
  → store.topUps push → deriveMovements TOP_UP SETTLED
  → available naik, trend inflow
  ↓ "Withdraw" dialog (create one-recipient batch)
  WithdrawDialog → withdrawBalanceAction → createBatch+approveBatch (paired)
  → reserved dipotong dari available (effectOf PENDING), movement WITHDRAWAL PENDING
  ↓ link "View payout" → /payouts/[id] (batch dari withdraw)
Payouts Index (/payouts)
  ↓ filters / sort / paginate, atau klik "Bulk Payouts"
Payouts Bulk (/payouts/bulk)
  ↓ drag CSV atau paste → client parseRecipientsCsv preview ─────→ server re-parse
  ↓ "Create batch" → createBatchAction ({name,source,scheduledFor,note,csv})
  ├─[no valid rows] → fieldErrors.csv "Every row was rejected"
  └─[success] → batch DRAFT/SCHEDULED → toast batchId + link
Payouts Detail (/payouts/[id])
  ├── Summary cards derived via summarise()
  ├── RecipientsTable status PENDING/PAID/FAILED (derived)
  ├── [DRAFT/SCHEDULED] → ReleaseBatchDialog → approveBatchAction (confirm=on)
  │     → pending recipients → PAID/FAILED (simulated banking) → timeline "Disbursement started"
  ├── [DRAFT/SCHEDULED] → Cancel → cancelBatchAction → status CANCELLED
  └── [PARTIAL/FAILED] → RetryFailuresButton → retryBatchFailures → FAILED→PAID or still FAILED
Balance kembali → reserved → settled (atau failed kembali ke available)
Audit → new PAYOUTS events, Webhook Logs tidak terlibat (payout bukan webhook Xendit inbound)
```

**State machine payouts:** DRAFT → SCHEDULED → PROCESSING → PAID | PARTIAL | FAILED (→ retry → PAID). `deriveStatus` determines dari recipient statuses.

### Journey C — Customer & Sub-Merchant Lifecycle

```
Dashboard → Quick Actions "Add Customer" → /customers?new=1 (auto-open dialog)
  ↓ createCustomerAction (name,email,status,notes) → requireOrgContext + createProviderCustomer
Customers Directory (/customers)
  ↓ listCustomers (ledger-derived + manual), metrics 4 cards, filters, CSV export
  ↓ row actions: Edit → updateCustomerAction → revalidate
               Archive → archiveCustomerAction (status ACTIVE→BLOCKED, restorable)
               View transactions → /transactions?q=email
Customers Detail (/customers/[id])
  ↓ CustomerHeader, EditCustomerDialog, CustomerStatusMenu, Lifetime stats (LTV, methods), Payments panel (5 tx)
  ↓ link "View transaction" loop ke Journey A
Onboarding (/onboarding)
  ↓ progress derived trackedComplete/trackedTotal (compliance not counted)
  ↓ 4 section cards CTAs: Merchant → /settings/merchant, KYC → /kyc, Payout account → /payouts/settings, Team → /team
KYC (/kyc)
  ↓ step rail derived profileKycCompleteness + submission existence
  ↓ KycUpload → submitKycDocumentAction → stored single submission → status "Awaiting review"
```

### Journey D — Payment Links (Money-In Alternative)

```
Payments Links (/payments/links) 8 seeded
  ↓ filters q/status/kind/page, export
  ↓ Create link dialog → createPaymentLinkAction (label/amount/line items, payerEmail, expiry? nullable)
  → totalOf() + deriveStatus() → OPEN
  ↓ Detail (/payments/links/[id]) → items, total, statusBadge, QR, copy
  ├── Expire → expireLinkAction → status EXPIRED (clock)
  ├── Cancel → CANCELLED (cancelledAt set)
  └── Simulate payment → recordLinkPayment({id}) → createTransaction ({referenceId=linkId, status:SUCCEEDED})
      → ledger row succeeds → deriveLinkStatus now PAID (via paidReferenceIds)
      → toast "View" → /transactions/{transactionId}
Balance → new settlement movement
```

### Journey E — Fraud → Risk → Blocklist (Compliance Loop)

```
Transactions (riskScore 0-78) → Risk page derived alerts (score ≥60)
Fraud Console (/fraud) metrics from blocklist store (10 seeded)
  ↓ tabs Card/IP/Domain, metrics "10 blocked entities"
  ↔ Blocklist Detail (/fraud/blocklist) same store, CRUD
  ↓ AddBlocklistDialog → addBlocklistAction (isValidIp, isValidEmailDomain, maskCardNumber)
Risk (/risk) alerts bento + volume limits (IDR caps, derived usage) + rules table
  ↓ VolumeLimitsCard → saveVolumeDraftAction (draft state) → deployRiskSettings() → badge "Active Ruleset"
Audit → CONFIGURATION events (Blocklist added, Velocity ruleset deployed)
```

### Journey F — Webhook Inbound (Provider → App)

```
Xendit callback (outbound from provider)
  ↓ POST /api/webhooks/xendit {id,event,data} + x-callback-token
  → verifyXenditCallbackToken constant-time (server/webhooks/verify.ts)
  → JSON parse + Zod WebhookPayloadSchema
  ├─[401] Invalid token → rejectInbound(REJECTED) → json error
  ├─[400] Invalid JSON → REJECTED
  └─[200] → recordWebhookDelivery (dedupe on dedupeKey = provider:eventId)
           ├─ first time → RECEIVED, payload stored, projectWebhookEvent async → canonical status projection
           └─ retry same eventId → DUPLICATED, payload as duplicate, 200 no-op
Webhooks Log (/webhooks) — polls listWebhooks(q,status,type,page)
  ↓ filters, pagination
  ↓ Simulate webhook dialog (TEST MODE) → simulateWebhookAction → same dedupe path → new row
  ↓ Detail (/webhooks/[id]) → payload JSON viewer, Retry/Replay button → replayWebhookAction
System (/system) → last24h aggregat (received/duplicated/rejected)
Audit → WEBHOOKS category events
```

### Journey G — Team & Permissions

```
/team Tabs Members/Roles/Pending
  ↓ addMemberDialog → inviteMemberAction ({email,role∈ORGANIZATION_ROLES}) → team store + invite expiry 7d
  → members-board row: change role, remove, resend
  → PendingInvites: resend/cancel/accept (accept binds email to OrganizationMember role=status ACTIVE)
  → Export CSV / filter
Settings Hub (/settings) → sections overview (Merchant/Notifications/Keys/Developer)
  ├── Merchant → updateMerchantProfileAction
  ├── Notifications → setNotificationChannel + updateNotificationTopic
  ├── API Keys → createApiKeyAction (scopes, env) → SecretReveal one-time; revoke/roll with confirm=on
  └── Developer → sandbox toggle optimistic + IP allowlist add/remove
Billing/Team/Payouts all link back to Settings for billing profile / payouts schedule
```

### Journey H — Auth & Onboarding (Cross-cutting)

```
Root (/) → chooser → /sign-in (or /id/dashboard via proxy rewrite)
  ↓ sign-in → betterAuth verifies → session cookie → proxy now hasSession=true
  ↓ bare /customers → proxy rewrites → /id/customers with shell (no redirect)
  ↓ unknown /definitely-not-a-page → proxy rewrites → /id/definitely-not-a-page → [locale]/not-found.tsx (in-shell 404)
  → anywhere → [locale]/error.tsx reset boundary on throw
  → after login, Support?ref= deep link preserved via Email subject
```

---

## 7. Navigation Graph

### 7.1 High-level Mermaid

```mermaid
flowchart TD
  ROOT["/ (chooser)"] --> DASH["/dashboard"]
  ROOT --> AIJ["/ai-journal"]
  DASH --> TRANS["/transactions"]
  DASH --> BAL["/balance"]
  DASH --> CUST["/customers"]
  DASH --> BILL["/billing"]
  DASH --> PAYOUTS["/payouts"]
  DASH --> PAYLINKS["/payments/links"]
  DASH --> SETTINGS["/settings"]
  DASH --> TEAM["/team"]
  DASH --> RISK["/risk"]
  DASH --> FRAUD["/fraud"]
  DASH --> KYC["/kyc"]
  DASH --> AUDIT["/audit"]
  DASH --> WEBHOOKS["/webhooks"]
  DASH --> SUPPORT["/support"]

  TRANS --> TXD["/transactions/[id]"]
  TXD --> CUSTD["/customers/[id]"]
  TXD --> SUPPORT
  TXD -.->|retry FAILED| TXD
  TXD -.->|refund SUCCEEDED| TXD

  CUST --> CUSTD
  CUSTD --> TRANS
  CUST -.->|?new=1| CUST

  BILL --> BILLD["/billing/[id]"]
  BILLD --> TRANS

  BAL --> TOPUP{{"TopUpDialog → /balance"}}
  BAL --> WD{{"WithdrawDialog → /payouts/[id]"}}
  BAL --> PAYOUTS
  BAL --> PSETTINGS["/payouts/settings"]

  PAYOUTS --> BULK["/payouts/bulk"]
  PAYOUTS --> BATCH["/payouts/[id]"]
  BULK --> BATCH
  BATCH --> BAL
  BATCH --> PSETTINGS
  BATCH -.->|approve/cancel/retry| BATCH

  PSETTINGS --> BAL
  PSETTINGS --> PAYOUTS

  PAYLINKS --> PLD["/payments/links/[id]"]
  PLD -.->|simulate| TXD

  FRAUD --> BLOCKLIST["/fraud/blocklist"]
  FRAUD -.->|add/remove| FRAUD

  RISK -.->|draft/deploy| RISK

  KYC -.->|submit| KYC
  KYC --> SETTINGS

  WEBHOOKS --> WHD["/webhooks/[id]"]
  WEBHOOKS -.->|simulate| WEBHOOKS

  SETTINGS --> MERCHANT["/settings/merchant"]
  SETTINGS --> NOTIF["/settings/notifications"]
  SETTINGS --> KEYS["/settings/api-keys"]
  SETTINGS --> DEV["/settings/developer"]
  SETTINGS --> MCP["/settings/mcp"]
  MERCHANT -.->|KYC completeness| KYC

  TEAM -.->|invite| TEAM

  SUPPORT -.->|mailto| EXT["mailto:support@kinetic.test"]

  ONB["/onboarding"] --> MERCHANT
  ONB --> KYC
  ONB --> PSETTINGS
  ONB --> TEAM

  SYSTEM["/system"] --- HEALTH["/api/health"]

  SIGNIN["/sign-in"] <--> SIGNUP["/sign-up"]
  SIGNIN -.->|redirect?| DASH

  WHCB["POST /api/webhooks/xendit"] --> WEBHOOKS
  WHCB --> SYSTEM
  WHCB -.->|project| TRANS

  classDef orphan stroke-dasharray: 5 5;
  class PLATFORM["/payments/platform"] orphan
  REPORTS["/reports/builder"] --> TRANS
```

### 7.2 Transition Conditions

| Dari | Ke | Kondisi |
|------|----|---------|
| `transactions/[id]` | `Refund dialog success` | `status ∈ {SUCCEEDED, REFUNDED}` && remaining>0 |
| `transactions/[id]` | `Retry` | `status=FAILED` |
| `payouts/[id]` | `Approve (Release)` | `isApprovable(status)` = DRAFT/SCHEDULED |
| `payouts/[id]` | `Cancel` | `isCancellable(status)` |
| `payouts/[id]` | `Retry failures` | `isRetryable(status)` && failedCount>0 |
| `payments/links/[id]` | `Expire` | `status=OPEN` && not PAID/CANCELLED |
| `payments/links` | `PAID` | `deriveLinkStatus` → ledger SUCCEEDED with referenceId==linkId |
| `kyc` | `Awaiting review` | `getKycSubmission()!=null` |
| `risk` | `Deploy` | `hasDraft=true` |

### 7.3 Shell vs BottomNav Coverage

- **Sidebar (desktop):** 30 items (full index, §3). Always visible, `aria-current=page` wired via `usePathname()`.
- **BottomNav (mobile ≤md):** 5 items only: Home(transactions?), Balance, Customers, Settings/developer (`bottom-nav.tsx:6-13`). Gap: **no mobile entry to payouts/bulk, billing, support, team** except via dashboard Quick Actions (P2).

---

## 8. Frontend → API → Backend Mapping

### 8.1 Server Actions (mutations) — App Internal API

| Page | User Action | Frontend Function | Server Action (`src/server/actions/*.ts`) | Data Store Mutation (`src/server/data/*.ts`) | Revalidate |
|------|-------------|-------------------|-------------------------------------------|----------------------------------------------|------------|
| Transactions | Create | `CreateTransactionDialog` → `formAction` | `createTransactionAction` (`transactions.ts:25`) | `createTransaction()` push to `__kineticTxStore` | `/dashboard`, `/transactions` |
| Transactions detail | Refund | `RefundDialog` form | `refundTransactionAction` (`transactions.ts:48`) | `tryProviderRefund()` OR `refundTransaction(id,amount)` | `transactions/[id]`, `transactions`, `dashboard` |
| Transactions detail | Retry | `RetryButton` form | `retryTransactionAction` (`transactions.ts:165`) | `retryTransaction(id)` → status PENDING | same |
| Customers list | Create | `CreateCustomerDialog` | `createCustomerAction` (`customers.ts:15`) | `requireOrgContext("customer.read")` + `createProviderCustomer()` + `createCustomer()` | `/customers`, `/customers/[id]` |
| Customers detail | Edit | `EditCustomerDialog` | `updateCustomerAction` (`customers.ts:62`) | `updateCustomer({id,name,status,notes})` | same |
| Customers | Archive/Restore | row menu | `archiveCustomerAction` (`customers.ts:92`) | `updateCustomer({status:BLOCKED/ACTIVE})` | same |
| Balance | Top up | `TopUpDialog` | `topUpBalanceAction` (`balance.ts:23`) | `topUpBalance({amount,method})` → `__kineticBalanceStore.topUps` | `/balance`, `/payouts` |
| Balance | Withdraw | `WithdrawDialog` | `withdrawBalanceAction` (`balance.ts:52`) | `createBatch(single-recipient)` + `approveBatch` | `/balance`, `/payouts/[id]` |
| Balance | Toggle auto | `AutoWithdrawalToggle` | `toggleAutoWithdrawalAction` (`payouts.ts:165`) | `updatePayoutSettings({automated,cadence})` | `/balance`, `/payouts/*` |
| Payouts bulk | Create batch | `BatchUploadDropzone` | `createBatchAction` (`payouts.ts:35`) | `parseRecipientsCsv` re-parse server → `createBatch({recipients})` | `/payouts`, `/bulk`, `/balance`, `/payouts/[id]` |
| Payouts detail | Release | `ReleaseBatchDialog send` | `approveBatchAction` (`payouts.ts:52`) | `approveBatch(id)` → recipients PENDING→PAID/FAILED | `/payouts*`, `/balance` |
| Payouts detail | Cancel | `ReleaseBatchDialog cancel` | `cancelBatchAction` (`payouts.ts:71`) | `cancelBatch(id)` | same |
| Payouts detail | Retry failures | `RetryFailuresButton` | `retryBatchFailuresAction` (`payouts.ts:105`) | `retryBatchFailures(id)` | same |
| Payouts detail | Retry one | `RecipientsTable` | `retryRecipientAction` (`payouts.ts:132`) | `retryRecipient(batchId,recipientId)` | same |
| Payouts settings | Save schedule | `PayoutScheduleForm` | `updatePayoutScheduleAction` (`payouts.ts:162`) | `updatePayoutSettings({cadence,weekday,...})` | `/payouts*`, `/balance` |
| Payouts settings | Add account | `PayoutSettings` form | `addBankAccountAction` (`payouts.ts:221`) | `addBankAccount({bank,holder,accountNumber})` | same |
| Payment Links | Create | `CreateLinkDialog` | `createPaymentLinkAction` (`links.ts:18`) | `createLink({items,payerEmail,expiresAt})` | `/payments/links`, `/links/[id]` |
| Payment Links | Expire | `ExpireLinkButton` | `expireLinkAction` (`links.ts:45`) | `expireLink(id)` → expiresAt=now | same |
| Payment Links | Simulate | `SimulatePaymentButton` | `recordLinkPaymentAction` (`links.ts:60`) | `recordLinkPayment(id)` → `createTransaction` | `links`, `transactions`, `balance` |
| Invoices | Pay | `PayInvoiceDialog` | `payInvoiceAction` (`invoices.ts:22`) | `payInvoice(id,method)` → timeline + status | `/billing`, `/billing/[id]` |
| Invoices | Save method | `SavePaymentMethodDialog` | `createPaymentMethodAction` (`payment-methods.ts`) | `createPaymentMethod` | `/billing` |
| Blocklist | Add | `AddBlocklistDialog` | `addBlocklistAction` (`blocklist.ts:15`) | `addBlocklist(input)` | `/fraud`, `/fraud/blocklist` |
| KYC | Submit doc | `KycUpload` | `submitKycDocumentAction` (`kyc.ts:12`) | `submitKycDocument({docType,file})` → `__kineticKycStore` | `/kyc` |
| KYC | Remove doc | `KycUpload` | `removeKycDocumentAction` (`kyc.ts:34`) | `removeKycDocument()` | `/kyc` |
| Subscriptions | Create | `CreateSubscriptionDialog` | `createSubscriptionAction` (`subscriptions.ts:14`) | `createSubscription()` | `/subscriptions` |
| Team | Invite | `AddMemberDialog` | `inviteMemberAction` (`team.ts:12`) | `inviteMember({email,role})` + expiry | `/team` |
| Settings Merchant | Save | `MerchantProfileForm` | `updateMerchantProfileAction` (`settings.ts:40`) | `updateMerchantProfile()` | `/settings/merchant` |
| Settings Notify | Save | `NotificationPreferencesForm` | `updateNotificationChannelAction` / `updateNotificationPreferenceAction` | `setNotificationChannel` / `updateNotificationTopic` | `/settings/notifications` |
| Settings Keys | Create/Roll/Revoke | `CreateApiKeyDialog` / row actions | `createApiKeyAction` / `rollApiKeyAction` / `revokeApiKeyAction` (`settings.ts:121-180`) | `createApiKey`, `rollApiKey`, `revokeApiKey` | `/settings/api-keys` |
| Settings Dev | IP add/remove | `IpAllowlistManager` | `addIpAllowAction` / `removeIpAllowAction` | `addIpAllowEntry` / `removeIpAllowEntry` | `/settings/developer` |
| Settings Dev | Sandbox toggle | `DeveloperToggle` | `updateDeveloperToggleAction` | `setDeveloperToggle("sandboxMode")` | `/settings/developer` |
| Risk | Save limits | `VolumeLimitsCard` | `saveVolumeDraftAction` (`risk.ts:14`) | `patchDraft(patch)` | `/risk` |
| Risk | Deploy/Discard | `RiskHeaderActions` | `deployRiskSettings` / `discardDraft` | `deployRiskSettings()` / `discardDraft()` | `/risk` |
| Webhooks | Simulate | `SimulateWebhookDialog` | `simulateWebhookAction` (`webhooks.ts:12`) | `recordWebhookDelivery` + `projectWebhookEvent` | `/webhooks` |
| Webhooks | Replay | `ReplayWebhookButton` | `replayWebhookAction` (`webhooks.ts:38`) | same | `/webhooks/[id]` |
| AI Journal | Chat | `GeminiJournalAgent` | `POST /api/ai-journal/chat` (Route Handler) | Gemini API + Firestore `users/{uid}/conversations` | — |
| AI Journal | Feedback | `EvaluationDashboard` | `POST /api/ai-journal/feedback` | Firestore | — |

### 8.2 Route Handlers (HTTP API) — External & Internal

| Handler | Method | Auth | Frontend Caller | Backend Logic | Mutation |
|---------|--------|------|-----------------|---------------|----------|
| `/api/auth/[...all]` | `POST` | Public | `signIn.email` / `signUp.email` (better-auth client) | `auth` instance (`lib/auth.ts`) → Prisma User/Session/Account | DB writes + set-cookie |
| `/api/health` | `GET` | Public | Docker/K8s probe, `proxy.ts` not (pass-through) | `prisma.$queryRaw SELECT 1` | none (readiness signal) |
| `/api/webhooks/xendit` | `POST` | `x-callback-token` header | Xendit provider (outbound) | `verifyXenditCallbackToken` → Zod parse → `recordWebhookDelivery` (dedupe) → `projectWebhookEvent` async | `WebhookDelivery` + `__kineticWebhooksStore` |
| `/api/webhooks/stripe` | `POST` | `stripe-signature` (if configured) | Stripe (not wired in sidebar) | similar to xendit | same store |
| `/api/exports/*` (9 handlers) | `GET` | Session? (no explicit check — gap) | `ExportCsvButton` (`components/transactions/export-csv-button.tsx:download()` fetch + download) | `*_toCsv(rows)` helpers from `server/data/*` → CSV string + Content-Disposition | none (read projection) |
| `/api/exports/transactions` | `GET` | — | Ledger export | `listTransactions` → `transactionsToCsv` | — |
| `/api/exports/balance` | `GET` | — | Movements export | `listMovements` → `movementsToCsv` | — |
| `/api/exports/payouts` & `/payouts/[id]` | `GET` | — | Batches export | `listBatches`/`getBatch` → `batchesToCsv`/`recipientsToCsv` | — |
| `/api/exports/invoices/[id]` | `GET` | — | Invoice statement | `invoiceStatementCsv` | — |
| `/api/exports/customers`, `/subscriptions`, `/team`, `/audit`, `/blocklist`, `/invoices` | `GET` | — | respective Export buttons | corresponding `*_toCsv` | — |
| `/api/mcp` | `POST` | Bearer? (`server/mcp/auth.ts`) | MCP clients (Cursor, Claude) | `server/mcp/server.ts` → `domain-tools` + `journal-tools` + `xendit-tools` + `pg-stores` | varies (read + write via tools) |
| `/api/ai-journal/chat` | `POST` | Firebase ID token | `GeminiJournalAgent` | `server/ai-journal/gemini.ts` → Google Gemini API | Firestore message |
| `/api/ai-journal/conversations` | `GET/POST` | Firebase | journal agent | `server/ai-journal/repository.ts` → Firestore | Firestore |
| `/api/ai-journal/messages` | `GET/POST` | Firebase | journal agent | same | Firestore |
| `/api/ai-journal/evaluation`, `/feedback`, `/reports`, `/firebase-config` | `POST/GET` | Firebase | evaluation dashboard | Gemini + Firestore | — |
| `/api/vitals` | `POST` | Public | `instrumentation.ts` web vitals | logger | — |

### 8.3 Frontend → Service → DB (Prisma) Path (Production Target)

```
FormData (browser)
  → Server Action ("use server") validates with Zod
  → (optional) requireOrgContext(permission) → reads Session + OrganizationMember (Prisma)
  → (optional) tryProvider*() → PaymentProviderConnection (Prisma) → Xendit API via xendit.ts
  → data module mutation (Prisma write OR in-memory fallback)
  → revalidatePath (Next.js cache invalidation) → UI refreshes via router.refresh()
  → toast.success / fieldErrors inline
```

**Concrete trace example — Refund (dual path):**

```
Page /transactions/[id]
  ↓ <RefundDialog> formData {id, amount, reason, approverId?}
  → refundTransactionAction (/server/actions/transactions.ts:48)
    → getTransaction(id) (data/transactions.ts)
    → tryProviderRefund({originalPaymentId, amountMinor, currency, approverId})
      → getProviderReadService() → check PaymentProviderConnection where providerStatus=CONNECTED + capability includes refund
      → if connected: call provider refund API (xendit refund) via execute-provider-write.ts (idempotency + DurableOperation)
      → if not connected: return {connected:false}
    → fallback: refundTransaction(id,amount,reason) (in-memory ledger status REFUNDED, events push)
    → revalidatePath("/[locale]/transactions/[id]"), "/transactions", "/dashboard"
  ← return {status:"success", message:"Refund issued via xendit (...)" } OR {status:"error", message:"Refund exceeds remaining…"}
  → client: if success → setOpen(false), toast.success, router.refresh()
          else → toast.error + fieldErrors.amount inline
```

---

## 9. State & Status Transition

### 9.1 Per-Page State Matrix

> `Implemented?` = ada UI response aktual dalam kode (bukan asumsi). `Trigger` = kondisi yang menyebabkan state.

| Page | State | Trigger | UI Response | Implemented? |
|------|-------|---------|-------------|--------------|
| **Transactions list** | initial | SSR request | — | ✅ (`TransactionsPage` server component) |
| | loading | `Suspense key={searchParams}` re-fire saat filter/page berubah | `TableSkeleton rows=10 cols=7` + metrics card skeleton | ✅ |
| | empty (no data unfiltered) | `rows.length==0 && !isFiltered` | `EmptyState icon=receipt_long` "No transactions yet" + CTA "Create your first transaction" | ✅ |
| | empty (filtered) | `rows.length==0 && isFiltered` | EmptyState "No transactions match these filters" + "Clear filters" Link `/transactions` | ✅ |
| | populated | `rows>0` | `TransactionsTable` + `TablePagination` | ✅ |
| | submitting (create) | `useFormStatus pending` inside `CreateTransactionDialog` | Submit button disabled + Spinner "Creating…" | ✅ |
| | success (create) | `state.status=success` | Toast success + router.refresh + optional navigation to detail | ✅ |
| | validation error | Zod fail di `createTransactionAction` | `fieldErrors.customerName/amount/channel` inline `<p role=alert>` + toast "Please fix…" | ✅ |
| | backend error | catch all | `toast.error("Could not create…")` | ✅ |
| | unauthorized | No session + AUTH_ENFORCED=1 | Proxy redirect `/sign-in?redirect=...` | Partial (opt-in) |
| | not-found | — (list tidak 404) | — | N/A |
| **Transaction detail** | loading | `loading.tsx` | Skeleton lines mirroring header/cards/timeline | ✅ |
| | not-found | `getTransaction()==null` | `not-found.tsx` EmptyState "Transaction not found" + link to ledger | ✅ |
| | populated (SUCCEEDED) | status SUCCEEDED | Summary card + timeline 3 events (info→info→success), Refund enabled | ✅ |
| | populated (FAILED) | status FAILED | Timeline ends error, Retry button replaces Refund | ✅ |
| | populated (REFUNDED) | status REFUNDED | Refund disabled (refundable=0), events include refund warning | ✅ |
| | populated (PENDING/PROCESSING) | status pending | Timeline ends warning "Awaiting confirmation", Refund disabled | ✅ |
| | submitting (refund) | `RefundSubmit pending` | "Refunding…" spinner, dialog locked | ✅ |
| | validation error (refund) | amount > remaining | `fieldErrors.amount` inline + toast | ✅ |
| | backend error (refund) | provider error / dual-control | `toast.error(error.message)` | ✅ |
| **Balance** | loading | Suspense | Card skeletons (h-24 animate-pulse) | ✅ |
| | populated | derived movements non-empty | Overview 3 metrics (available/pending/reserved) + trend + table | ✅ |
| | empty (no movements) | OPENING only + no ledger | EmptyState "No movements" + ?topup CTA | ✅ (via conditional empty check) |
| | submitting topUp/withdraw | `useActionState pending` | Button disabled + "Adding…" / spinner | ✅ |
| | success topUp | `data.available` returned | Toast with new available formatted money | ✅ |
| | validation error | parseAmount==null or ≤0 or >5B | fieldErrors amount inline | ✅ |
| | error boundary | throw inside SectionBoundary | `<SectionBoundary title="...">` fallback + retry button | ✅ |
| **Customers** | loading | Suspense | Metrics 4 skeletons + TableSkeleton | ✅ |
| | empty unfiltered | rows==0 && !isFiltered | EmptyState + `<CreateCustomerDialog triggerLabel="Add your first customer">` | ✅ |
| | empty filtered | rows==0 && isFiltered | EmptyState "No customers match" + Clear | ✅ |
| | populated | rows>0 | `CustomersTable` with selection, pagination, metrics cards | ✅ |
| | submitting | pending | Spinner in dialog | ✅ |
| | validation error | Zod name/email/notes | inline fieldErrors + toast | ✅ |
| | not-found (detail) | `getCustomer()==null` | `not-found.tsx` + link to directory | ✅ |
| **Payouts index/bulk/detail** | loading | Suspense | summary skeleton 4×h-28 + TableSkeleton | ✅ |
| | empty (no batches) | rows==0 | EmptyState + Create batch dialog CTA | ✅ |
| | populated | batches present | BatchesTable + summary cards | ✅ |
| | submitting (create/approve/cancel/retry) | pending | Dialog button spinner, batch status badge updating after revalidate | ✅ |
| | validation error (create) | CSV no valid rows → fieldErrors.csv | Inline error + toast | ✅ |
| | backend error | approve fail / batch not approvable | toast.error | ✅ |
| | not-found (detail) | `getBatch()==null` | `not-found.tsx` | ✅ |
| **Settings sub-pages** | loading | Suspense? | `loading.tsx` skeleton (defined for merchant, api-keys, etc.) | Partial (settings/page not, settings/mcp not) |
| | populated | store reads | Forms with `defaultValue` from server data | ✅ |
| | submitting | useFormStatus pending | Button disabled + spinner | ✅ |
| | success | revalidatePath + data updated | Toast "Merchant profile saved." + form re-renders with new values | ✅ |
| | validation error | Zod hex color / IP CIDR / email / scopes | fieldErrors inline + toast "Please fix…" | ✅ |
| | unauthorized | if `AUTH_ENFORCED` + no session | Proxy redirect (not per-field) | Partial |
| **Auth (sign-in/up)** | submitting | `setLoading(true)` | Button "Signing in…" disabled | ✅ |
| | error | `res.error` from betterAuth | `<p class="text-[var(--error)]">` inline | ✅ |
| | success | no error | `router.push(redirect)` (`sign-in`) / `/dashboard` (`sign-up`) | ✅ |
| | validation error | HTML `required` + `type=email` | Browser native, no per-field Zod | Partial (missing field-level custom message) |
| **Webhooks** | loading | Suspense TableSkeleton | `TableSkeleton rows=8 cols=4` | ✅ |
| | empty (no callbacks) | total==0 | EmptyState (reported) | ✅ |
| | populated | rows>0 | WebhooksTable + ConfigCard (endpointUrl + tokenConfigured chip) | ✅ |
| | submitting simulate | pending | "Simulating…" spinner | ✅ |
| | error | X-CALLBACK-TOKEN invalid → 401 | UI banner REJECTED status in table | ✅ |
| **UI generic** | network error | fetch throws | `error.tsx` (`LocaleError`) EmptyState "Something went wrong" + "Try again" `reset()` | ✅ |
| | 404 app route | unmatched path | `not-found.tsx` in-shell "This page doesn't exist" + 3 links | ✅ |
| | global crash | unhandled in root | `global-error.tsx` | ✅ |
| | forbidden (403) | — | **Not implemented** — no page renders 403; proxy does not distinguish 401 vs 403; role thiếu → Server Action error toast, bukan UI 403. | ❌ |
| | unauthorized inline | session expiry mid-session | **Partial** — client components use `router.refresh()` after mutations; session expiry until next SSR will show stale UI, tidak ada `401` toast interceptor. | ❌ Partial |
| | optimistic offline | — | **Not implemented** — no service worker / queue; Server Action pending then error if offline (toast error), but no "queued" state. | ❌ |

### 9.2 Business State Machines (Derived from Code)

**Transaction (`TRANSACTION_STATUSES`):**

```
PROCESSING ──┬──→ SUCCEEDED ──→ REFUNDED (via refundTransaction)
PENDING   ───┤
             └──→ FAILED    ──→ retryTransaction → PROCESSING (loop)
             └──→ (stays PENDING if waiting callback → webhook project could move to SUCCEEDED/FAILED)
```

- Source: `server/data/transactions.ts:seed` + `eventsFor(tx)` + `retryTransaction()` + `refundTransaction()`.
- UI sync: detail page disables Refund for FAILED/PENDING; Retry only for FAILED. No double refund: `refundable = amount - refundedAmount` guard.
- **Missing transition:** PENDING → FAILED directly via webhook rejection is implemented in `server/webhooks/project.ts` (canonical projection), but UI tidak polling — user must manual refresh or receive via `revalidate` after webhook POST (P2 inconsistency).

**Payout Batch (`PAYOUT_STATUSES` via `deriveStatus` & `summarise`):**

```
DRAFT ──→ SCHEDULED ──→ PROCESSING ──→ PAID
              │              ├──→ PARTIAL (some PAID, some FAILED)
              │              └──→ FAILED (all FAILED)
              └──→ cancelBatch → (removed/ CANCELLED)  // isCancellable true only for DRAFT/SCHEDULED
FAILED/PARTIAL/RETURNED ──→ retryBatchFailures → PROCESSING → PAID
```

- Guards: `isApprovable`, `isCancellable`, `isRetryable` (`lib/payout-status.ts`). UI disables buttons accordingly. Attempt to approve PAID batch surfaces `toast.error` (Server Action throws "Batch not approvable").
- **Missing:** `RETURNED` state jarang ter-trigger (only seeded `R-12-4` Beneficiary closed); no dedicated UI path to view why returned beyond recipients table.

**Payment Link (`LINK_STATUS` via `deriveLinkStatus`):**

```
OPEN ──→ PAID       (paidAt set OR ledger SUCCEEDED with referenceId==linkId)
     ──→ CANCELLED  (cancelledAt set, precedence wins)
     ──→ EXPIRED    (expiresAt ≤ now, derived by clock)
OPEN ──→ remains OPEN jika none triggers.
```

- No stored status field — pure derive. Expired check lazy on each `listLinks` call → user may see OPEN then after expiry reload jadi EXPIRED (no auto-transition toast) (P3).

**Onboarding Progress:** `trackedComplete/trackedTotal` hanya counts sections the app owns; compliance (KYC review) displayed but excluded from denominator.

---

## 10. UX / Functional Gaps (Non-Broken but Gappy)

| # | Page/Journey | Problem (as implemented) | Evidence | Severity |
|---|--------------|--------------------------|----------|----------|
| UX-1 | Sidebar | **30 flat items tanpa grouping/collapsing** — scan time tinggi, expert vs novice tidak dipisah. | `components/layout/sidebar.tsx:6-30` array `navItems` tanpa section header, `aside` no scroll group. | P2 |
| UX-2 | Settings | **Deep navigation duplication** — "Payout Settings" ada di sidebar `/payouts/settings` dan di `settings` hub related links; user bingung mana source of truth. | `sidebar.tsx:8` + `settings/page.tsx` related links. | P2 |
| UX-3 | Balance | **Dua entry "Payout settings" di balance card** + breadcrumb `/balance → /payouts` meng-round-trip. | `balance/page.tsx` BalanceCard + `payouts/page.tsx` breadcrumb. | P2 |
| UX-4 | Customers | **Create dialog hanya via button, tidak ada bulk import** padahal payouts punya CSV bulk — inconsistency. | `customers/page.tsx` Export but no Import; `payouts/bulk` has drag zone. | P2 |
| UX-5 | Transactions | **No bulk actions** (bulk refund, bulk export selected) padahal ledger 46 rows; customer table punya bulk copy/archive. | `transactions-table.tsx` no selection state vs `customers-table.tsx` has selection. | P2 |
| UX-6 | Webhooks | **Endpoint URL uses `headers().get("host")` with `https://` hardcoded** — breaks http preview (`https://localhost:3000`), dan tidak copyable via button feedback. | `webhooks/page.tsx:42-44` `endpointUrl = https://${host}/api/webhooks/xendit`. | P2 |
| UX-7 | Risk | **Right column `RiskProfilePanel` reads ledger but page comment says "no Xendit source" — disclaimer missing in UI beyond comment**; user may think risk thresholds sync with processor. | `risk/page.tsx` comment `INTEGRATION.md:117/:320` but UI `VolumeLimitsCard` no note. | P2 |
| UX-8 | Subscriptions | **Interval hanya monthly/yearly, no weekly/quarterly** — parity dengan payout cadences tidak konsisten. | `server/data/subscriptions.ts` interval enum. | P3 |
| UX-9 | Sign-in/up | **No password reset / forgot flow, no OAuth button** padahal AI Journal pakai Firebase Google — inconsistency. | `sign-in/page.tsx` only email+password; no `forgot password` link. | P2 |
| UX-10 | All lists | **Filter chip persistence not visible as chips** — filters are URLSearchParams but no "Active filters" row with ✕; reset requires knowing URL. | `transaction-filters.tsx`, `customer-filters.tsx` — controls but no chip summary. | P2 |
| UX-11 | AI Journal | **Firebase auth terpisah dari Better Auth** — user yang login via Better Auth tetap harus login ulang via Firebase di journal; no SSO. | `ai-journal/page.tsx` GeminiJournalAgent uses Firebase `signIn()` independent of `lib/auth-client`. | P2 |

---

## 11. Dead Ends & Broken Flows

> Severity: **P0** = journey utama tidak dapat diselesaikan | **P1** = major UX/business issue | **P2** = confusing/inefficient | **P3** = cosmetic/minor . `Recommendation` di §14, tetap grounded.

| Severity | Journey | Page | Problem | Evidence (file:line) | Recommendation |
|----------|---------|------|---------|----------------------|----------------|
| **P1** | Auth enforcement | Semua app routes | **Proxy tidak enforce auth bila `AUTH_ENFORCED` unset** — setiap `/dashboard`, `/transactions`, `/balance`, `/team`, `/settings/api-keys` dapat di-render tanpa session di preview/dev. Jika env terlupa di production, semua credential & data terbuka. | `src/proxy.ts:84-105` `const enforceAuth = process.env.AUTH_ENFORCED==="1"`; E2E `routing.spec.ts` `OK_PATHS` includes `/dashboard` tanpa login lolos `<400`. | Set `AUTH_ENFORCED=1` wajib di prod; fail-closed: default enforce, opt-out via `AUTH_BYPASS_IN_DEV` explicit. |
| **P1** | RBAC per-route | Payouts, Team, Settings, Risk | **Tidak ada role guard di proxy maupun Sidebar** — SUPPORT/ANALYST bisa klik "Payout Settings" atau "Release batch" walau `ROLE_PERMISSIONS` lacks `payout.release`. Server Action `approveBatchAction` tidak memanggil `requireOrgContext`, hanya `payouts.ts` data. | `domain/organization/roles.ts:88` `hasPermission("SUPPORT","payout.release")==false` tapi `server/actions/payouts.ts:52` tidak ada `requireOrgContext`. | Tambah `requireOrgContext("payout.release")` di semua payout actions + proxy role check. |
| **P1** | Refund dual-control | Transactions detail | **Refund `approverId` bisa self-approve** — form field `approverId` optional string, tidak ada validasi `approverId !== requesterId`. Komentar domain says "does not let a single assignee render as two approvers" tapi implement tidak enforce. | `transactions.ts:67-71` `role.test.ts:58` test expects SUPPORT cannot execute, tapi `refundTransactionAction` `providerResult` path only checks via `tryProviderRefund` internal. | Enforce `approverId !== ctx.userId` server-side reject. |
| **P1** | Exports CSV auth | `/api/exports/*` | **Export endpoints tidak cek session** — `GET /api/exports/transactions` dapat dipanggil anonymous walau proxy pass-through `/api` (line 20). Data pelanggan & ledger leak. | `src/app/api/exports/transactions/route.ts` (check: no auth import). | Guard semua `/api/exports/*` dengan `requireOrgContext("report.export")` atau `audit.read`. |
| **P2** | Navigation | Mobile BottomNav | **BottomNav hanya 5 dari 30 halaman** — pengguna mobile tidak bisa reach Payouts, Billing, Risk, Frauds, Webhooks, Team tanpa lewat dashboard quick actions (yang limited). | `components/layout/bottom-nav.tsx:6-13` `items` length 5 vs sidebar 30. | Expand atau add "More" sheet grouping. |
| **P2** | Navigation | Payments Platform | **Orphan page `/payments/platform` tidak ada link masuk** — Connected accounts / split rules / transfers tidak reachable dari sidebar maupun hub. | `app/[locale]/payments/platform/page.tsx` exists; `sidebar.tsx` tidak ada entry `/payments/platform`. | Tambah sidebar item atau link dari `settings` / `payouts`. |
| **P2** | Reports | `/reports` vs `/reports/builder` | **Parent `/reports` tidak ada page** — `/reports` render in-shell 404 walaupun sidebar menunjuk `/reports/builder`. Direct `/reports` is dead end. | `sidebar.tsx:14` `href:"/reports/builder"` tapi `next.config.ts` rewrites includes both; `app/[locale]/reports/builder/page.tsx` only child. | Add redirect `/reports → /reports/builder` atau index page. |
| **P2** | Journey stuck | PENDING transaction | **Pending payment stuck tanpa auto-refresh** — `PROCESSING/PENDING` timeline "Awaiting channel callback" tapi halaman tidak poll / subscribe; user harus manual refresh untuk melihat transisi ke SUCCEEDED via webhook. | `transactions/[id]/page.tsx:58` `refundDisabled = ... PENDING`; no `router.refresh()` interval. | Add SWR poll or Realtime via server-sent event, plus manual "Check status" button. |
| **P2** | Journey | Bulk payouts CSV | **Server re-parse silently drops invalid rows tanpa per-row feedback detail** — toast hanya bilang "skipped N rows" tapi tidak tampil which rows/why di UI after submit (only preview). | `server/actions/payouts.ts:58` `recipients.invalid.length` message, `payout-csv.ts:parseRecipientsCsv` has `invalid` array but not returned to client beyond count. | Return invalid rows list to dialog for correction. |
| **P2** | UX | Transaction create → list | **Success toast "View" button navigates to detail, tapi list tidak deep-highlight new row** — kembali ke list, new row tidak focused. | `create-transaction-dialog.tsx:58-62` toast action `router.push(detail)`. | After toast auto-navigate atau highlight row. |
| **P2** | Error | `forbidden` state | **Tidak ada 403 page** — role mismatch hanya surfaces sebagai `toast.error` dari Server Action, bukan UI forbidden. User melihat form tetap enabled lalu kecewa. | All pages: no `forbidden.tsx` atau role-gated empty state; `settings/page.tsx` no guard. | Render disabled sections with lock icon + "Contact admin" CTA when `hasPermission` false. |
| **P3** | Navigation | Sidebar active | **BottomNav active state still bug** — `activeHref===item.href` exact match only, prefix not matched → `/transactions/[id]` tidak highlight "Transact" di mobile. | `components/layout/bottom-nav.tsx:17` `active = activeHref === item.href` vs sidebar `startsWith`. | Copy sidebar logic. |
| **P3** | Loading | Some pages no skeleton | **Audit, Frauds, Reports, System pages tidak punya `loading.tsx`** — navigasi TERASA lebih lambat karena shell tanpa streaming skeleton. | `ls apps/web/src/app/[locale]/audit/` no `loading.tsx`; compare `transactions/loading.tsx` exists. | Add `loading.tsx` di semua list pages. |
| **P3** | API | `/api/health` DB error | **Health returns 200 even when DB `error`** — k8s probe tidak akan restart faulty pod. | `api/health/route.ts:18-28` `return NextResponse.json({status:"ok", db:"error"}, {status:200})`. | Return `503` when `db==="error"` and `DATABASE_URL` set. |
| **P3** | Dead CTA | Support live chat | **Support page comment says "no-op Live Chat / Ticket History" buttons are gone** — confirmed fixed, no dead buttons remain (audit pas). | `support/page.tsx:32-44` — no button inert found. | ✅ Fixed, no action. |
| **P3** | Duplicate flow | Customer creation | **Dua entry create customer** — Dakar via `/customers` toolbar dan `/subscriptions` `directoryCustomers` prop di `create-subscription-dialog`. | `subscriptions/page.tsx: clients = listCustomers` passed to dialog. | Unify atau label provenance. |

---

## 12. Security / Authorization Observations

| Area | Implemented? | Detail & Evidence | Risk |
|------|--------------|-------------------|------|
| **Session transport** | ✅ | `better-auth.session_token` HttpOnly cookie, `__Secure-` prefix bila HTTPS, 7d expiry, cookieCache maxAge 7d (`lib/auth.ts:24-32`). | Low — standard |
| **CSRF** | ✅ Partial | Better Auth handles origin check + trustedOrigins (`lib/auth.ts:52` `baseURL ?? trustedOrigins`). `X-CSRF` not explicit but Server Actions have Next.js CSRF protection. | Low |
| **XSS** | ✅ | `next.config.ts headers` CSP `default-src 'self'`, `frame-ancestors 'none'`, `X-Frame-Options DENY`, sanitized via React. Raw payload `pre` escaped via `JSON.stringify` (no `dangerouslySetInnerHTML`). | Low |
| **Auth guard** | ⚠️ Partial | `proxy.ts:84-105` opt-in only. `NEXTJS #7 proxy` concept. | **P1** — fail-open default |
| **Role guard** | ❌ Not found (infrastructure ada tapi belum dipakai) | `domain/organization/roles.ts` matrix intact, `requireOrgContext` exists (`server/services/session-org-context.ts`) tapi hanya dipakai di `customers.ts:29` dan partial di transactions refund provider path. Payouts, team, settings, risk tidak ada. | **P1** |
| **API export auth** | ❌ Not found | `src/app/api/exports/*/route.ts` tidak import `auth`/`requireOrgContext`. Proxy pass-through `/api` (`proxy.ts:20`). | **P1** |
| **Webhook verification** | ✅ | Constant-time compare via `verifyXenditCallbackToken` (`server/webhooks/verify.ts`), rejects on invalid token 401, invalid JSON 400, unconfigured token in prod 500 (`api/webhooks/xendit/route.ts:18-42`). | Good |
| **Webhook dedupe** | ✅ | `recordWebhookDelivery` dedupe on `provider:eventId` scope (`server/webhooks/store-delivery.ts:15-40`), idempotent projection `projectWebhookEvent`. | Good |
| **Secrets** | ✅ | API key `SecretReveal` one-time (`components/settings/secret-reveal.tsx` with copy + warning "will not be shown again"), `createApiKey` generates maskedSecret + plain secret returned once (`server/data/settings.ts:256`). Secrets via `env` (`lib/env.ts` validated via `@t3-oss/env-nextjs`). Not logged. | Good |
| **PII** | ⚠️ Partial | Ledger seed uses fake names/emails (`transactions.ts:CUSTOMERS` array) ; real provider customers normalized email (`CanonicalCustomer emailNormalized`). No masking of emails in UI except `maskedSecret`. | Medium — mask emails if required by compliance |
| **Rate limit** | ✅ | `server/ai-journal/rate-limit.ts` for Gemini paths; `/api/mcp` has handler rate limit. Xendit webhook tidak rate-limited (could DoS log). | P2 |

---

## 13. Journey Complexity Metrics

Dihitung untuk flow yang "selesai pekerjaan utama" (first meaningful success), tanpa branching kecuali dihitung.

| Journey | Pages traversed (incl. list+detail) | Clicks min (dari landing) | Forms (diisi) | Server Actions / API calls | Decisions / branches | Modals/dialogs | Redirects | Status |
|---------|-------------------------------------|---------------------------|---------------|----------------------------|----------------------|----------------|-----------|--------|
| **A. Create→Refund** (merchant) | 5 (`sign-up→dashboard→transactions→detail→balance/support`) | 11 (sign-up 4 fields + submit + dashboard metric/CTA + create 6 fields + submit + row click + refund 2 fields + submit + balance check) | 2 (create, refund) | 2 actions + 2 reads (`listTransactions`, `getTransaction`) + 1 derive (`getBalanceOverview`) | 2 (refund vs retry, provider vs local) | 2 (create, refund) | 1–2 (sign-up→dashboard, toast view→detail) | ✅ Shortest core |
| **B. Balance TopUp→Withdraw→Payout Release** | 5 (`balance→balance (topup) → payouts → bulk → payout detail`) | 12–14 (topup 2 fields + bulk CSV upload 1 file + batch name 1 + release confirm checkbox + submit) | 3 (topup, withdraw, create batch, schedule) | 4 actions + 3 reads | 3 (schedule vs manual, release vs cancel, retry whole vs single) | 4 | 1–2 | ⚠️ Panjang |
| **C. Customer lifecycle** | 4 (`customers→detail→onboarding→kyc`) | 8 (create 4 fields + edit 2 + kyc file 1) | 2 | 2 | 1 (archive vs active) | 2 | 1 | OK |
| **D. Payment Link Paid** | 3 (`links→detail→transactions/detail`) | 9 (create 3 items + simulate) | 1 | 2 (createLink, recordLinkPayment→createTransaction) | 2 (expire vs simulate) | 1 | 1 (simulate→tx) | OK |
| **E. Fraud/Risk loop** | 4 (`fraud→blocklist→risk→audit`) | 6 (add blocklist 2 fields, deploy ruleset) | 2 | 2 | 1 (deploy vs discard) | 1 | 0 | OK |
| **F. Webhook inbound** | 3 (`external POST → webhooks → system`) | 2 (simulate dialog) bila manual | 1 (simulate) | 1 ingress + 1 projection + 1 read | 2 (RECEIVED vs DUPLICATED vs REJECTED) | 1 | 0 | OK |
| **G. Team/Settings** | 6 (`team→settings hub→merchant/notifications/api-keys/developer`) | 14+ jika isi semua form | 6 | 6 | 2 | 4 | 0 | ⚠️ Terlalu panjang saat ini untuk "setup account" |
| **H. Auth** | 2 (`sign-in/up → dashboard`) | 3–4 | 1 | 1 | 1 (sign-in vs sign-up) | 0 | 1 | OK |

**Highlight:**

- **Journey G terlalu panjang (14+ clicks, 6 forms)** — perlu wizard atau progressive disclosure. Rekomendasi: satu `onboarding` checklist sudah ada tapi tidak memanggil settings forms inline; jadikan onboarding actionable (embed merchant form) bukan cuma deep-link.
- **Journey B** memiliki 2 moda membuat payout (Withdraw single + Bulk CSV) yang functionally identik tapi UI terpisah — merge atau label provenance.

---

## 14. Recommendations

### 14.1 Urgent (Fix before production money-movement)

1. **Aktifkan fail-closed auth.** Ubah `proxy.ts:88` `AUTH_ENFORCED=1` default true, atau set di semua prod deploy; audit CI menggagalkan build bila unset. (`Effort S`)
2. **Enforce API export auth.** Tambah `await requireOrgContext("report.export")` / `audit.read` guard di setiap `src/app/api/exports/*/route.ts` sebelum `*_toCsv`. (`S`)
3. **Enforce payout actions RBAC.** Tambah `requireOrgContext("payout.release" | "payout.create" | "payout.retry")` di `server/actions/payouts.ts:52,71,105,132`. (`S`)
4. **Dual-control refund self-approve block.** Di `refundTransactionAction`, compare `ctx.userId !== approverId` reject `400` `"Approver must be a different user"`. (`S`)

### 14.2 Major (Greatly improve journey completion)

5. **Sidebar grouping + collapse.** Kelompokkan 30 item jadi 5 sections (Money, Risk, Operations, Developer, AI) dengan collapsible `Accordion`; active group auto-expand via `usePathname` prefix. Simpan collapsed state di `localStorage`. (`M`)
6. **Expand BottomNav atau "More" sheet.** 5 → 8 items atau sheet pattern (dashboard_home:315 spec ada 5, tapi spec lama; audit rekomendasikan sheet). (`S`)
7. **Orphan platform page reachable.** Tambah sidebar "Platform" (permissions `transfer.execute`) atau hub card di `settings` + breadcrumb dari `payouts`. (`S`)
8. **Add 403 Forbidden UI.** Buat `app/[locale]/forbidden.tsx` dan render di page level ketika `authorizeRoles(...)==false` — disable buttons with lock + "You need FINANCE_ADMIN — contact Owner" CTA, bukan toast after click. (`M`)
9. **Transaction PENDING polling.** Di `transactions/[id]` untuk `PENDING/PROCESSING`, poll `GET /api/transactions/[id]` tiap 5s (SWR) atau tombol "Check status" manual + SSE via `api/webhooks` projection notification. (`M`)
10. **Bulk payout invalid rows detail.** Return `invalid: {row, reason}[]` dari `createBatchAction` ke `BatchUploadDropzone` table (red rows). (`S`)

### 14.3 Quality & Polish

11. **Add `loading.tsx` di audit/fraud/system/reports** — copy `transactions/loading.tsx` pattern (Card skeleton). (`S`)
12. **Fix BottomNav active prefix match** — copy sidebar `startsWith` logic (`bottom-nav.tsx:17`). (`S`)
13. **Reports parent redirect** — `src/app/[locale]/reports/page.tsx` redirect → `./builder`. (`S`)
14. **Endpoint URL copy + protocol-aware** — `webhooks/page.tsx` `endpointUrl` derive protocol from `x-forwarded-proto` header + `CopyButton` with toast. (`S`)
15. **Unify Firebase & Better Auth SSO** — after Better Auth sign-in, `signInWithCustomToken` Firebase via `/api/auth/firebase-custom-token` (optional) so AI Journal tidak double login. (`L`)
16. **Mask PII / add row masking toggle** — customers email masking behind eye button for SUPPORT role. (`S`)

---

## 15. Prioritized Backlog

| Priority | Problem | Page / Journey | Proposed Fix | Effort | Impact |
|----------|---------|----------------|--------------|--------|--------|
| **P0** | Payout approve tanpa permission check | `payouts/[id]` — Journey B | `requireOrgContext("payout.release")` di `approveBatch/cancel/ retry` actions; test `payouts.route.test` unauthorized | **S** | **Critical** — money movement |
| **P0** | Export CSV tanpa auth | `/api/exports/*` — Journey H | Guard semua exports dengan `requireOrgContext("report.export"/"audit.read")`; 401 JSON jika no session | **S** | **Critical** — data leak |
| **P0** | Auth fail-open (proxy) | All App Routes | Default `AUTH_ENFORCED=1`, env check di `instrumentation.ts` warning jika prod unset | **S** | **Critical** |
| **P1** | No role guard UI — SUPPORT sees Payout Release button | Sidebar + payout detail | Sidebar conditional `hasPermission`; detail buttons `disabled` + lock tooltip when lacking permission; add `forbidden.tsx` | **M** | **High** — prevents confusion & mistaken attempt |
| **P1** | Refund self-approve bypass | `transactions/[id]` — Journey A | Enforce `approverId !== actorId` di `refundTransactionAction`; E2E test dual-control | **S** | **High** — compliance |
| **P1** | Health probe 200 on DB error | `/api/health` | Return `503` when `db==="error"` and `DATABASE_URL` set; add k8s liveness check docs | **S** | **High** — ops |
| **P1** | Webhook export not rate-limited | `/api/webhooks/xendit` | Add `server/webhooks/rate-limit.ts` IP + eventId window; 429 on burst | **S** | **Medium** — DoS durability |
| **P1** | Mobile BottomNav 5/30 pages | `bottom-nav.tsx` — Journey B/G | Expand to grouped "More" sheet or 8 items; ensure `payouts`, `billing`, `team` reachable | **S** | **High** — mobile journey blocked |
| **P2** | Orphan `/payments/platform` | Platform — Journey G | Add sidebar entry `href:/payments/platform` gated `transfer.execute`; link dari `payouts` "Platform" card | **S** | **Medium** — hidden feature |
| **P2** | `/reports` dead-end (no index) | Reports | Add `app/[locale]/reports/page.tsx` redirect to `builder` | **S** | **Medium** |
| **P2** | PENDING payments require manual refresh | `transactions/[id]` — Journey A | Poll 5s or "Check status" button → `router.refresh()` + SWR fetch; toast on transition | **M** | **Medium** — user stuck perception |
| **P2** | Bulk CSV invalid rows not shown | `payouts/bulk` — Journey B | Return `invalid` array to dialog, render red table with reason col + download corrected CSV | **M** | **Medium** |
| **P2** | Sidebar 30 flat items | `sidebar.tsx` | Group into 5 accordions (Money/Risk/Ops/Dev/AI), `localStorage` collapse | **M** | **Medium** — scan time |
| **P2** | Missing loading skeletons | `audit`, `fraud`, `system`, `kyc` | Add `loading.tsx` per route using `TableSkeleton`/`Skeleton` | **S** | **Medium** — perceived perf |
| **P2** | No forgot password | `sign-in` — Journey H | Add Better Auth `forgetPassword` flow + `/sign-in/forgot` page (email reset) | **M** | **Medium** — auth completeness |
| **P2** | Firebase + Better Auth double login | `ai-journal` | SSO: issue Firebase custom token after Better Auth login; auto sign-in journal | **L** | **Medium** |
| **P3** | BottomNav active state bug | `bottom-nav.tsx` | Change `===` to `startsWith` (match sidebar) | **S** | **Low** |
| **P3** | Link EXPIRED not live | `payments/links` — Journey D | Add cron revalidation or client clock check with toast on expiry transition | **S** | **Low** |
| **P3** | Health `https://localhost` webhook URL | `webhooks/page.tsx` | Protocol from `x-forwarded-proto` header; copy button toast "Copied" | **S** | **Low** |
| **P3** | No bulk customer import | `customers` | Add CSV import dialog mirroring `payouts/bulk` dropzone | **M** | **Low** — parity |
| **P3** | No 404 `reports` builder only | `reports/builder` | Already indexed — no new backlog beyond redirect above | **S** | **Low** |

---

## Appendix A — Konvensi Laporan

| Label | Arti |
|-------|------|
| **Implemented** | Handler + UI response ditemukan di kode (file & line dikutip) |
| **Partially Implemented** | Handler ada tapi feedback/state tidak lengkap (mis. validation hanya HTML required) |
| **Not Found** | Tidak ada implementasi untuk state tersebut di codebase |
| **Inferred** | Disimpulkan dari perilaku related code, ditandai eksplisit per baris |

Semua tabel **Page → Action → Frontend Function → API → Backend Handler → Mutation** di §8 hanya mencantumkan endpoint/handler yang **ditemukan** — tidak ada tebakan.

## Appendix B — File Map (Single Source of Truth per domain)

| Domain | Data store | Server Actions | Page | Tests |
|--------|------------|----------------|------|-------|
| Transactions | `server/data/transactions.ts` | `actions/transactions.ts` | `app/[locale]/transactions/**` | `server/data/transactions.test.ts`, `e2e/transactions.spec.ts` |
| Balance | `server/data/balance.ts` | `actions/balance.ts` | `app/[locale]/balance/page.tsx` | `balance.test.ts`, `e2e/balance.spec.ts` |
| Payouts | `server/data/payouts.ts` | `actions/payouts.ts` | `app/[locale]/payouts/**` | `payouts.test.ts`, `e2e/payouts.spec.ts` |
| Customers | `server/data/customers.ts` | `actions/customers.ts` | `app/[locale]/customers/**` | `customers.test.ts`, `e2e/customers.spec.ts` |
| Invoices | `server/data/invoices.ts` | `actions/invoices.ts` | `app/[locale]/billing/**` | `invoices.test.ts`, `e2e/billing.spec.ts` |
| Payment Links | `server/data/links.ts` | `actions/links.ts` | `app/[locale]/payments/links/**` | `links.test.ts`, `e2e/links.spec.ts` |
| Settings | `server/data/settings.ts` | `actions/settings.ts` | `app/[locale]/settings/**` | `settings.test.ts`, `e2e/settings.spec.ts` |
| Blocklist | `server/data/blocklist.ts` | `actions/blocklist.ts` | `app/[locale]/fraud/**` | `blocklist.test.ts`, `e2e/blocklist.spec.ts` |
| Webhooks | `server/data/webhooks.ts` + `server/webhooks/*` | `actions/webhooks.ts` | `app/[locale]/webhooks/**` | `webhooks.test.ts`, `e2e/webhooks.spec.ts` |
| Audit | `server/data/audit.ts` | — (read-only) | `app/[locale]/audit/page.tsx` | `audit.test.ts`, `e2e/audit.spec.ts` |
| Team | `server/data/team.ts` | `actions/team.ts` | `app/[locale]/team/page.tsx` | `team.test.ts` |
| Risk | `server/data/risk.ts` | `actions/risk.ts` | `app/[locale]/risk/page.tsx` | `risk.test.ts`, `e2e/risk.spec.ts` |
| Subscriptions | `server/data/subscriptions.ts` | `actions/subscriptions.ts` | `app/[locale]/subscriptions/page.tsx` | `subscriptions.test.ts` |
| Onboarding | `server/data/onboarding.ts` | — | `app/[locale]/onboarding/page.tsx` | `onboarding.test.ts` |
| KYC | `server/data/kyc.ts` | `actions/kyc.ts` | `app/[locale]/kyc/page.tsx` | `kyc.test.ts`, `e2e/kyc.spec.ts` |
| Auth | `lib/auth.ts` + Prisma `User/Session/Account` | — | `app/[locale]/sign-in|up` | `e2e/onboarding.spec.ts` |
| RBAC | `domain/organization/roles.ts` + `server/services/session-org-context.ts` | — | Sidebar (should gate) | `domain/organization/roles.test.ts` |

## Appendix C — Cara Membaca Jawaban End-to-End

> _"Jika saya menjadi setiap jenis user di sistem ini, dari pertama membuka aplikasi sampai menyelesaikan pekerjaan utama saya, page apa saja yang saya lalui, tindakan apa yang saya lakukan, apa yang dilakukan sistem, dan di titik mana journey tersebut bermasalah?"_

| Persona | Pekerjaan Utama | Lalui (canonical) | Tindakan Kunci | Di mana bermasalah? |
|---------|-----------------|-------------------|-----------------|----------------------|
| **Merchant Owner** (OWNER) | Day-1 setup → terima pembayaran → cairkan dana | `/sign-up → /dashboard → /settings/merchant → /kyc → /payouts/settings → /transactions (create) → /transactions/[id] → /balance → /payouts/bulk → /payouts/[id] (approve) → /audit` | Setup checklist, top-up, create payment, release payout, review audit | Owner flow fully works. Hanya hambatan minor: 14 clicks setup, sidebar panjang, mobile payouts tidak di bottom-nav. |
| **Finance Ops** (FINANCE_OPERATOR) | Buat pembayaran, upload batch, handle refund prepare | `/dashboard → /transactions (create) → /payouts/bulk (create batch) → /transactions/[id] (refund prepare only)` | Create tx/batch, prepare refund (execute butuh FINANCE_ADMIN, jadi prepare-only). | Prepare succeed, execute diverge — dialog akan error "requires different approver" (P1 self-approve gap). Payout release disabled (no permission) tanpa penjelasan 403 (P2 forbidden UI gap). |
| **Finance Admin** (FINANCE_ADMIN) | Approve payout, execute refund, manage split | `/payouts/[id] (approve) → /transactions/[id] (refund execute) → /payments/platform (split)` | Approve batch (confirm checkbox → PAID), refund dengan approverId, activate split. | Approve bekerja (P0 guard missing adalah celah keamanan, bukan block). Platform page orphan (P2) — harus ingat URL. |
| **Support** (SUPPORT) | Lihat transaksi pelanggan, prepare refund, eskalasi | `/customers → /customers/[id] → /transactions/[id] → /support?ref=` | View, copy, filter `?q=email`, prepare refund (prepare true, execute false), mailto. | Can call refund prepare, but will be confused seeing active refund button that fails on execute (no UI disable for execute-not-allowed). |
| **Risk Analyst** (RISK_ANALYST) | Monitor fraud & velocity, manage blocklist | `/dashboard → /transactions (filter FAILED) → /fraud → /fraud/blocklist → /risk (draft/deploy) → /audit` | Derive alerts, add IP/domain/card, deploy volume ruleset, audit review. | Fully works. Gap: risk draft deploy ada, namun no audit trail linking deploy actor. |
| **Developer** (DEVELOPER) | Manage sandbox, API keys TEST, webhooks TEST | `/settings/developer (sandbox toggle + IP) → /settings/api-keys (TEST keys) → /webhooks (simulate) → /api/mcp` | Toggle sandbox optimistic, add IP, create TEST key, simulate callback, call MCP tools. | LIVE env/keys blocked correctly (least-privilege). Gap: no LIVE toggle attempt feedback (403 toast missing). |
| **Analyst** (ANALYST) | Export data, review ledger | `/transactions → /customers → /audit → /reports/builder → Export CSV` | Filter, paginate, export. | Exports currently unauthenticated — Analyst exports succeed even when shouldn't be blocked, not a block but leak (P1). |
| **Guest** | Sign up / Sign in | `/sign-in ↔ /sign-up → /dashboard` | Email/password form | No password reset, no OAuth — P2 gap, but sign-up succeeds. |
