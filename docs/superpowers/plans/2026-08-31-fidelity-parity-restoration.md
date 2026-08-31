# Fidelity Parity Restoration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore 33 prototype screens to 24 Next.js routes from placeholder 12-18% parity to ≥95% structural/content parity, removing surplus and wiring shared app-shell, per `docs/audit/fidelity-audit-2026-08-31-full.md`.

**Architecture:** Addy Osmani App Shell + incremental vertical slices — global `Shell` (Sidebar/TopBar/BottomNav + TEST MODE) as shell, each route as content with progressive enhancement (SSR shell + client islands for charts/interactions), performance budgets preserved via Tailwind tokens and shadcn primitives, a11y per audit gaps.

**Tech Stack:** Next.js 15 App Router + `next-intl` `en/id` + Tailwind 4 (`globals.css:8-62` tokens, `label-caps`/`data-mono`/`headline-xl`) + shadcn `src/components/ui/*` 94 primitives + `src/components/layout/*` 6 kept + `cn()` + `next/link` + `codegraph` 141 wal

**Spec:** `docs/audit/fidelity-audit-2026-08-31-full.md` (source of truth), `SCREENS.md:9-48`, `design-system/*/DESIGN.md`, prototypes `screens/**/code.html`

## Global Constraints

- `node>=20.9.0` + `pnpm@9.12.0` (via `package.json:engines`) — `pnpm install` required
- Tokens exact: `--primary:#003fb1`, `--test-mode-amber:#d97706` alias `--warning`, `--surface-canvas:#f8fafc`, `--border-subtle:#e2e8f0`, `--success-status:#10b981`, `--failed-status:#ef4444`, `--pending-status:#f59e0b` (`globals.css:25/56-62`) — do not invent tokens, extend `DESIGN.md` first
- Every screen persistent `TEST MODE` amber banner `#d97706` unless live-mode (`AGENTS.md:18` + `src/app/layout.tsx:22` + `test-mode-banner.tsx:14`)
- shadcn 100+ must be used: `npx shadcn@latest add <name>` or `@diceui/@tailark` — never rewrite; keep 6 `layout/*` as-is (`AGENTS.md:20`)
- Numerics/currency: `data-mono` right-aligned; table headers: `label-caps sticky` via `cn()` not fork (`AGENTS.md:15`)
- Standalone `code.html` skeleton: sidebar (desktop) / bottom nav (mobile), top app bar, main grid — keep
- `pnpm typecheck` (`tsc --noEmit`) + `pnpm build` must pass per task; `~/.npm-global/bin/codegraph sync` after
- ADR statuses: Proposed→Accepted→Superseded — don't re-litigate Accepted in code
- `PROGRESS.md:21-55` flip 1 row per PR that touches `apps/web` + cite ADR
- Addy Osmani constraints: App Shell first (shell cached, content streamed), PRPL, performance budgets (no extra client JS unless `dynamic(ssr:false)` for `Hero3D`), progressive enhancement, a11y

---

## File Structure

```
apps/web/src/app/[locale]/layout.tsx          # MODIFY — add Sidebar/TopBar/BottomNav shell (Task 0)
apps/web/src/app/layout.tsx                    # READ — already has TestModeBanner
apps/web/src/components/layout/sidebar.tsx:14  # MODIFY — extend navItems to all 24 routes, activeHref wiring
apps/web/src/components/layout/top-bar.tsx:4   # MODIFY — ensure search Cmd+K + TestModeBanner pill
apps/web/src/components/layout/bottom-nav.tsx:12 # MODIFY — extend to 5 items matching prototypes
apps/web/src/components/layout/metric-card.tsx:4  # VERIFY — already label-caps + data-mono
apps/web/src/components/layout/data-table.tsx:6   # VERIFY — sticky label-caps + data-mono right
apps/web/src/components/ui/table.tsx:68       # MODIFY — add scope="col" to TableHead
apps/web/src/components/ui/badge.tsx:12       # VERIFY — variants for success/pending/failed
apps/web/src/app/[locale]/dashboard/page.tsx  # MODIFY — Task 1 (bento restore)
apps/web/src/app/[locale]/balance/page.tsx    # MODIFY — Task 2
apps/web/src/app/[locale]/billing/page.tsx    # MODIFY — Task 3
apps/web/src/app/[locale]/customers/page.tsx  # MODIFY — Task 4
apps/web/src/app/[locale]/transactions/page.tsx # MODIFY — Task 5
apps/web/src/app/[locale]/audit/page.tsx      # MODIFY — Task 6
apps/web/src/app/[locale]/settings/api-keys/page.tsx # MODIFY — Task 7
apps/web/src/app/[locale]/settings/developer/page.tsx # MODIFY — Task 8
apps/web/src/app/[locale]/reports/builder/page.tsx # MODIFY — Task 9
apps/web/src/app/[locale]/payments/links/page.tsx # MODIFY — Task 10
apps/web/src/app/[locale]/payouts/bulk/page.tsx  # MODIFY — Task 11
apps/web/src/app/[locale]/payouts/settings/page.tsx # MODIFY — Task 12
apps/web/src/app/[locale]/subscriptions/page.tsx # MODIFY — Task 13
apps/web/src/app/[locale]/team/page.tsx      # MODIFY — Task 14
apps/web/src/app/[locale]/fraud/blocklist/page.tsx # MODIFY — Task 15
apps/web/src/app/[locale]/fraud/page.tsx     # MODIFY — Task 16
apps/web/src/app/[locale]/kyc/page.tsx       # MODIFY — Task 17
apps/web/src/app/[locale]/webhooks/page.tsx  # MODIFY — Task 18
apps/web/src/app/[locale]/settings/merchant/page.tsx # MODIFY — Task 19
apps/web/src/app/[locale]/settings/notifications/page.tsx # MODIFY — Task 20
apps/web/src/app/[locale]/risk/page.tsx      # MODIFY — Task 21
apps/web/src/app/[locale]/onboarding/page.tsx # MODIFY — Task 22
apps/web/src/app/[locale]/support/page.tsx   # MODIFY — Task 23
apps/web/src/app/[locale]/system/page.tsx    # MODIFY — Task 24
docs/audit/fidelity-audit-2026-08-31-full.md  # CREATED — spec for plan
tests/* (Vitest + RTL + Playwright per PROGRESS M6) # TOUCH — smoke per route
```

---

### Task 0: App Shell — Global Layout + Sidebar/TopBar/BottomNav Wiring

**Files:**
- Modify: `apps/web/src/app/[locale]/layout.tsx:1-17`
- Modify: `apps/web/src/components/layout/sidebar.tsx:5-42`
- Modify: `apps/web/src/components/layout/top-bar.tsx:1-19`
- Modify: `apps/web/src/components/layout/bottom-nav.tsx:1-32`
- Modify: `apps/web/src/components/ui/table.tsx:68-79` (scope)

**Interfaces:**
- Consumes: `TestModeBanner` (`src/app/layout.tsx:22`), `routing.locales` (`src/i18n/routing.ts:5`)
- Produces: `LocaleLayout` shell with `Sidebar activeHref + TopBar title + BottomNav` available to all 24 routes; `TableHead` now `scope="col"` for a11y

- [ ] **Step 1: Write failing test — shell renders nav**

```tsx
// tests/layout-shell.test.tsx
import { render, screen } from "@testing-library/react";
import LocaleLayout from "@/app/[locale]/layout";
test("locale layout renders Sidebar and TopBar chrome", async () => {
  // mock next-intl server getMessages
  const { container } = render(await LocaleLayout({ children: <div>content</div>, params: Promise.resolve({ locale: "id" }) }));
  expect(document.querySelector("aside")).toBeInTheDocument(); // sidebar w-sidebar-width
  expect(screen.getByRole("banner")).toBeInTheDocument(); // TEST MODE from root layout, but also TopBar pill
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/layout-shell.test.tsx -v`
Expected: FAIL — `aside` not found (current `[locale]/layout.tsx:16` only returns `NextIntlClientProvider`)

- [ ] **Step 3: Implement shell**

```tsx
// apps/web/src/app/[locale]/layout.tsx
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { BottomNav } from "@/components/layout/bottom-nav";
export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // routing check...
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={messages}>
      <div className="flex min-h-screen">
        <Sidebar activeHref={`/${locale}/dashboard`} />
        <div className="flex flex-1 flex-col pl-sidebar-width">
          <TopBar title="Kinetic Ledger" />
          <main className="flex-1 bg-[var(--surface-canvas)] p-gutter">{children}</main>
          <BottomNav />
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
```

Extend `sidebar.tsx:5` navItems to all 24 routes (dashboard, transactions, balance, customers, billing, payouts/bulk, audit, fraud, kyc, settings/*, risk, onboarding, support, system, subscriptions, payments/links, webhooks, risk). Add `scope="col"` to `table.tsx:68` `TableHead`: `<th scope="col" className={cn("label-caps sticky...", className)} />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/layout-shell.test.tsx -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/[locale]/layout.tsx apps/web/src/components/layout/sidebar.tsx apps/web/src/components/layout/top-bar.tsx apps/web/src/components/layout/bottom-nav.tsx apps/web/src/components/ui/table.tsx tests/layout-shell.test.tsx
git commit -m "feat(shell): wire App Shell Sidebar/TopBar/BottomNav + table scope — audit HIGH global prerequisite"
```

---

### Task 1: Dashboard — Bento Restoration

**Files:**
- Modify: `apps/web/src/app/[locale]/dashboard/page.tsx:1-36`

**Interfaces:**
- Consumes: `MetricCard` (`layout/metric-card.tsx:4`), `DataTable*` (`layout/data-table.tsx:6`), `Sidebar/TopBar` (Task 0)
- Produces: `DashboardPage` with welcome + progress + metrics + quick actions

- [ ] **Step 1: Failing test**

```tsx
test("dashboard has Welcome and Quick Actions", () => {
  render(<DashboardPage />);
  expect(screen.getByText(/Welcome back/)).toBeInTheDocument();
  expect(screen.getByText(/Setup Progress/)).toBeInTheDocument();
  expect(screen.getByText(/Create Payment Link/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run → FAIL (current has only 3 MetricCards + txn table)**

- [ ] **Step 3: Implement — restore from `mobile/dashboard_home:200-310` + `desktop/dashboard_home:228-348`**

```tsx
// Add: Welcome bento bg-white border-surface-variant rounded-xl p-6 with Setup Progress 1/3 COMPLETED + 3 tasks + Start button href="/kyc"
// Metrics: Total Volume $1.24M +12.5% vs last month (data-mono right + trending pill success-status/10)
// Quick Actions grid: Create Payment Link / Send Payout / Generate QR / Create Invoice etc. with next/link + chevron_right
// Keep Hero3DWrapper dynamic(ssr:false) as island but after bento, not replacing
```

Preserve `label-caps` sticky on table, `data-mono` on amounts.

- [ ] **Step 4: Pass + `pnpm typecheck && pnpm build`**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(dashboard): restore Welcome/Setup/QuickActions bento — mobile+desktop parity"
```

---

### Task 2: Balance & History

**Files:**
- Modify: `apps/web/src/app/[locale]/balance/page.tsx:13-70`

**Interfaces:**
- Consumes: `Card`, `DataTable*`
- Produces: Balance card with CTAs + Auto-Withdrawal toggle + 5-row ledger

- [ ] **Step 1: Test `Top Up` and `Withdraw` exist**

```tsx
expect(screen.getByRole("button", { name: /Top Up/ })).toBeInTheDocument();
expect(screen.getByRole("button", { name: /Withdraw/ })).toBeInTheDocument();
expect(screen.getByLabelText(/Toggle Auto-Withdrawal/)).toBeInTheDocument();
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement — anchors `mobile/balance:235-355` + `desktop/balance:257-444`**

Restore `Card lg:col-span-2` with `IDR 1.005.870.599,00` + `Top Up add + Withdraw arrow_upward` + `Auto-Withdrawal Setup schedule arrow_forward + toggle aria-label + BCA ****4910 + Configure` + `Export CSV download` header + table `Date & Time / Description icons arrow_upward/downward / Type pills Settlement/Withdrawal/Fee emerald/secondary/error + Amount mono right +/-` 5 rows + filter `All Types` + `View all`.

- [ ] **Step 4: Pass**

- [ ] **Step 5: Commit**

---

### Task 3: Billing & Invoices

**Files:**
- Modify: `apps/web/src/app/[locale]/billing/page.tsx:14-98`

- [ ] **Step 1: Test breadcrumbs and Export**

```tsx
expect(screen.getByText(/Billing & Invoices/)).toBeInTheDocument();
expect(screen.getByRole("button", { name: /Export Statement/ })).toBeInTheDocument();
expect(screen.getByTitle(/Download PDF/)).toBeInTheDocument();
```

- [ ] **Step 2: FAIL (current has Select + Calendar + Tabs)**

- [ ] **Step 3: Implement — `billing_invoices:201-337`**

Breadcrumbs `Enterprise > Billing`, header `Next Invoice Oct 01 2023 event + Accrued 12,450,000 trending_down`, table `Invoice ID / Billing Period range / Amount mono right / Status center pills Paid/Pending/Overdue success/pending/failed-status/10 + dot border + Action picture_as_pdf button title`. Remove `Select/Calendar/Tabs`, `Customer` col unless spec'd. Fix `picture_as_pdf span` → `button aria-label`.

---

### Task 4: Customers — Directory

**Files:**
- Modify: `apps/web/src/app/[locale]/customers/page.tsx:1-107`

- [ ] **Step 1: Test `Add Customer` + `Reference ID`**

```tsx
expect(screen.getByRole("button", { name: /Add Customer/ })).toBeInTheDocument();
expect(screen.getByText(/Reference ID/)).toBeInTheDocument();
```

- [ ] **Step 2: FAIL**

- [ ] **Step 3: `mobile/customer:165-273` + `desktop/customer:220-389`**

Toolbar `Export + Add Customer + Filter + 2,104 Total + Search by name…`, cols `Checkbox / Customer / Reference ID mono / Added / Status / LTV mono right / more`, 3 rows `Sarah Anderson cus_J9XkP2wL $4,520`, pagination `1 to 3 of 2,104`, fix `more_horiz` → `button aria-label`.

---

### Task 5: Transactions — Ledger

**Files:**
- Modify: `apps/web/src/app/[locale]/transactions/page.tsx:1-116`

- [ ] **Step 1: Test `Export CSV` + `Create Payment` + `More filters`**

- [ ] **Step 2: FAIL**

- [ ] **Step 3: `mobile/transaction:172-270` + `desktop/transaction:209-384`**

Add `Export CSV download + Create Payment primary`, metrics `Total Volume $2,450,892 +12.4% / Successful 14,239 / Failed 24`, toolbar `Status:All Date:Last 7 Channel:All More filters + Filter this view input + date`, 7-col table correct; fix `TableRow group` for `group-hover:opacity-100`.

---

### Task 6: Audit — Detailed Log

**Files:**
- Modify: `apps/web/src/app/[locale]/audit/page.tsx:1-91`

- [ ] **Step 1: Test `Export CSV` + `Timestamp` + `IP Address`**

- [ ] **Step 2: FAIL (has Tabs)**

- [ ] **Step 3: `audit:206-393`**

Replace Tabs with `Search resources,IPs + Last 24h + All Actions + Success/Failure checkboxes + Export CSV`, cols `Timestamp mono / User avatar / Action chip key_prod / IP mono / Status pills + pagination 1-5 of 12,042`; map `Badge secondary → success/failed` tokens.

---

### Tasks 7-24: Remaining Routes (batched per increment, one PR per task)

Each follows same TDD 5-step cycle — failing test → implement prototype-anchored UI → verify → commit. Anchors listed in audit §5 HIGH list.

- **Task 7:** `settings/api-keys` — `Generate New Key + Live/Test splits + Status 2/10 + Security` (`api_key:269-431`)
- **Task 8:** `settings/developer` — `Generate Key + Webhook Events + Whitelist + LIVE MODE pill` (`developer:216-338` + `160-278`)
- **Task 9:** `reports/builder` — `w-80 Data Source radios + dual dates + Filters + Columns + Live Preview 1,248 + Export CSV` (`reports:196-605`)
- **Task 10:** `payments/links` — `Create Link + Tabs Single/Multiple + External ID/Payer Email/Amount + pagination` (`payment_links:196-304`)
- **Task 11:** `payouts/bulk` — `Batch Disbursements + Pending/Completed bento + Quick Upload CSV or JSON + Download Template` (`bulk:221-302`) — remove Progress/Stepper/Table
- **Task 12:** `payouts/settings` — `Settlement radios + Minimum 50,000 + BCA Verified + Email checkboxes + Discard/Save` (`payout:205-323`)
- **Task 13:** `subscriptions` — `Create + metrics 1,248 + Search + table sub_1Mvw8K avatar + pagination` (`subscriptions:170-404`)
- **Task 14:** `team` — `Add Member + Members/Roles/Pending + bulk + Last Active + more_vert` (`team:181-501`)
- **Task 15:** `fraud/blocklist` — `Tabs IP/Card/Email + Value mono + delete + pagination 124` (`blocklist:242-364`)
- **Task 16:** `fraud` — `Metrics 14,209 + Tabs IP/Cards/Email + Filter IPs + Export` (`fraud:294-442`)
- **Task 17:** `kyc` — `Secure shield + 4 steps sidebar + Accepted PDF + Document Type + Drag aria-label + Attached 2.4MB + delete + Save Draft/Submit` (`kyc:165-328`)
- **Task 18:** `webhooks` — `Search + 2 selects + Status 200/500 + latency + evt_3NzQ + chevron + pagination 1,024` (`webhook_logs:172-313`)
- **Task 19:** `settings/merchant` — `Business Info Legal/DBA/Address/Tax mono + Branding logo + Upload + Color` (`merchant:278-344`)
- **Task 20:** `settings/notifications` — `Global 3 toggles + Payments 3 ACTIVE matrix + Security Forced` (`notifications:282-468`)
- **Task 21:** `risk` — `Active Ruleset + Alerts 24h + Critical Triggers + Volume Daily/Monthly mono` (`risk:182-272`)
- **Task 22:** `onboarding` — `Progress 3 of 4 75% + 4 cards Business/Compliance/Bank/Technical + Go to Dev` (`onboarding:252-414`)
- **Task 23:** `support` — `Search + Cmd+K + 4 cards API/Settlement/KYC/Reporting + System Status ping + Contact` (`support:127-247`)
- **Task 24:** `system` — `All Systems pulse + Core API 99.99% 42ms + Ledger 15% bar + Queue 142 + Traffic chart + deliveries 5 cols + Settings sliders` (`system:275-540`)

Each task's Step 3 must:
- Use exact token names (`primary`/`surface-variant`, `headline-xl`/`data-mono`, `gutter`/`stack-md`) via `cn()` not fork
- Wrap new client islands (`Chart`, `Calendar`, `QrCode`) in `dynamic(ssr:false)` where heavy
- Wire `next/link` for `href` values (prototype `href="#"` → real routes `/dashboard`, `/kyc`, etc.)
- Add `aria-*` per audit A11y Gaps (scope, alt, aria-label, aria-hidden)
- Remove surplus `Prototype: …` dev notes

---

## Verification Checklist (per task + final)

- [ ] `pnpm typecheck` — `tsc --noEmit` exit 0
- [ ] `pnpm build` — `next build` exit 0
- [ ] `pnpm lint` — `eslint .` 0 errors (if configured)
- [ ] `pnpm test` — Vitest 3 passed + new route smoke tests pass
- [ ] `~/.npm-global/bin/codegraph sync` — wal updated
- [ ] Manual: open `code.html` vs `http://localhost:3000/[locale]/<route>` side-by-side, chrome matches
- [ ] `PROGRESS.md:21-55` row flipped + ADR cited per PR

---

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-08-31-fidelity-parity-restoration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?** (Default: inline incremental — proceeding unless you specify subagent)

Base: `docs/superpowers/plans/` per `writing-plans` skill
