# Fidelity Audit — Prototype vs Implementation (Full) — 2026-08-31

> **Read-only autonomous audit** · 33 prototypes (14 mobile + 19 desktop) vs 26 `[locale]` routes + 2 surplus auth routes · Locales `en, id` (default `id`) · Tokens via `apps/web/src/app/globals.css:8-62` + `241-248`

**Sources:** `SCREENS.md:9-48` manifest (confirmed), `PROGRESS.md:21-55` (claims all ✅), `apps/web/next.config.ts:7-38`, `src/i18n/routing.ts:4-8`, `src/components/layout/*` (6 files), `src/components/ui/*` (94 files), `src/app/layout.tsx:22` + `[locale]/layout.tsx:16`, per-screen `screens/**/code.html` + `apps/web/src/app/[locale]/**/page.tsx` (all readable), batched deep audits (6 batches × 5-7 screens).

**Method:** Phase 0 Discovery → Phase 1 Mapping (CONFIRMED/INFERRED/UNMAPPED) → Phase 2 Deep Fidelity (Structural / Visual-Token / Copy / Interaction / A11y / Component Resolution) → Phase 3 Matrix + Executive Summary + Fix List. Severity rubric: HIGH = missing entire sections/core flows/broken nav/critical a11y; MEDIUM = missing modals/dropdowns/tabs/grid/surplus debug UI; LOW = spacing/token/copy/decorative.

---

## 1. Discovery Summary

| Dimension | Finding |
|---|---|
| **Prototypes** | 33 `code.html` + `screen.png` — `screens/mobile/*` 14 + `screens/desktop/*_desktop` 19; pattern `screens/<platform>/<name>/code.html` (standalone `<!DOCTYPE html>` + Tailwind CDN + inline `tailwind.config` + Material Symbols + Inter/JetBrains Mono). Verified via `screens/**/*.html` glob: 33. |
| **Next.js app** | `apps/web/src/app/[locale]/**/page.tsx` — 26 locale routes + `src/app/page.tsx` (root). Config `apps/web/next.config.ts:7-38` `output: "standalone"` + `withNextIntl` + `withSentryConfig` + security headers (CSP/HSTS). No rewrites. |
| **i18n** | `src/i18n/routing.ts:4-8` `locales ["en","id"] defaultLocale "id" localePrefix "as-needed"`; `src/app/[locale]/layout.tsx:16` `NextIntlClientProvider`. |
| **Components** | `src/components/layout/*` 6 (`test-mode-banner.tsx:5`, `sidebar.tsx:14` `w-sidebar-width`, `top-bar.tsx:4` `h-14`, `bottom-nav.tsx:12` `h-16 md:hidden`, `metric-card.tsx:4`, `data-table.tsx:6` sticky `label-caps` + `data-mono`). `src/components/ui/*` 94 files (62 `add -a` + 32 `@diceui/@tailark`). |
| **Layout delegation** | `src/app/layout.tsx:22` renders `<TestModeBanner />` globally (`test-mode-banner.tsx:14` `bg-[var(--test-mode-amber)] #d97706` `role="banner"` + pill variant). `sidebar/top-bar/bottom-nav` **exist but never imported** — `[locale]/layout.tsx:16` does NOT inject them; all 26 `page.tsx` omit chrome. So amber banner ✅, side/top/bottom nav ✗. |
| **Design system** | `src/app/globals.css:8-62` merged Kinetic tokens (`--primary:#003fb1` `25`, `--surface-canvas:#f8fafc`, `--border-subtle:#e2e8f0`, `--success-status:#10b981`, `--failed-status:#ef4444`, `--test-mode-amber:#d97706` alias `--warning`, `--sidebar-width:260px`, `--gutter:1.5rem`) + utilities `.headline-xl 30px 700` `241`, `.label-caps 11px 700 0.05em uppercase` `248`, `.data-mono 13px 500 JetBrains Mono` `247`. Tailwind 4 via `@import "tailwindcss"` `1` + `@theme inline` `112-174`. No `tailwind.config.*`. |
| **Manifests** | `SCREENS.md:9-48` 14 mobile + 19 desktop → 24 unique routes (9 shared). `PROGRESS.md:21-55` claims all ✅ but fidelity shows placeholders. |

0 unreadable files.

---

## 2. Mapping Table

All 33 prototypes CONFIRMED via `SCREENS.md` folder-name + title + href alignment. 2 surplus routes have no prototype.

| # | Prototype Path | Next.js Route | Confidence |
|---|---|---|---|
| 1 | `screens/mobile/dashboard_home/code.html` | `src/app/[locale]/dashboard/page.tsx` | CONFIRMED |
| 2 | `screens/desktop/dashboard_home_desktop/code.html` | `src/app/[locale]/dashboard/page.tsx` (shared) | CONFIRMED |
| 3 | `screens/mobile/balance_history/code.html` | `src/app/[locale]/balance/page.tsx` | CONFIRMED |
| 4 | `screens/desktop/balance_history_desktop/code.html` | `src/app/[locale]/balance/page.tsx` (shared) | CONFIRMED |
| 5 | `screens/mobile/customer_directory/code.html` | `src/app/[locale]/customers/page.tsx` | CONFIRMED |
| 6 | `screens/desktop/customer_directory_desktop/code.html` | `src/app/[locale]/customers/page.tsx` (shared) | CONFIRMED |
| 7 | `screens/mobile/transaction_ledger/code.html` | `src/app/[locale]/transactions/page.tsx` | CONFIRMED |
| 8 | `screens/desktop/transaction_ledger_desktop/code.html` | `src/app/[locale]/transactions/page.tsx` (shared) | CONFIRMED |
| 9 | `screens/desktop/billing_invoices_desktop/code.html` | `src/app/[locale]/billing/page.tsx` | CONFIRMED |
| 10 | `screens/desktop/detailed_audit_log_desktop/code.html` | `src/app/[locale]/audit/page.tsx` | CONFIRMED |
| 11 | `screens/mobile/api_key_management/code.html` | `src/app/[locale]/settings/api-keys/page.tsx` | CONFIRMED |
| 12 | `screens/desktop/developer_settings_desktop/code.html` | `src/app/[locale]/settings/developer/page.tsx` | CONFIRMED |
| 13 | `screens/mobile/developer_settings/code.html` | `src/app/[locale]/settings/developer/page.tsx` (shared) | CONFIRMED |
| 14 | `screens/mobile/custom_reports_builder/code.html` | `src/app/[locale]/reports/builder/page.tsx` | CONFIRMED |
| 15 | `screens/desktop/custom_reports_builder_desktop/code.html` | `src/app/[locale]/reports/builder/page.tsx` (shared) | CONFIRMED |
| 16 | `screens/mobile/payment_links_invoices/code.html` | `src/app/[locale]/payments/links/page.tsx` | CONFIRMED |
| 17 | `screens/desktop/bulk_payouts_desktop/code.html` | `src/app/[locale]/payouts/bulk/page.tsx` | CONFIRMED |
| 18 | `screens/mobile/payout_settings/code.html` | `src/app/[locale]/payouts/settings/page.tsx` | CONFIRMED |
| 19 | `screens/mobile/subscription_management/code.html` | `src/app/[locale]/subscriptions/page.tsx` | CONFIRMED |
| 20 | `screens/desktop/subscription_management_desktop/code.html` | `src/app/[locale]/subscriptions/page.tsx` (shared) | CONFIRMED |
| 21 | `screens/mobile/team_permissions/code.html` | `src/app/[locale]/team/page.tsx` | CONFIRMED |
| 22 | `screens/desktop/team_permissions_desktop/code.html` | `src/app/[locale]/team/page.tsx` (shared) | CONFIRMED |
| 23 | `screens/mobile/fraud_prevention_blocklist/code.html` | `src/app/[locale]/fraud/blocklist/page.tsx` | CONFIRMED |
| 24 | `screens/desktop/fraud_prevention_desktop/code.html` | `src/app/[locale]/fraud/page.tsx` | CONFIRMED |
| 25 | `screens/mobile/identity_verification_kyc/code.html` | `src/app/[locale]/kyc/page.tsx` | CONFIRMED |
| 26 | `screens/desktop/identity_verification_kyc_desktop/code.html` | `src/app/[locale]/kyc/page.tsx` (shared) | CONFIRMED |
| 27 | `screens/mobile/webhook_logs/code.html` | `src/app/[locale]/webhooks/page.tsx` | CONFIRMED |
| 28 | `screens/desktop/merchant_profile_settings_desktop/code.html` | `src/app/[locale]/settings/merchant/page.tsx` | CONFIRMED |
| 29 | `screens/desktop/notification_preferences_desktop/code.html` | `src/app/[locale]/settings/notifications/page.tsx` | CONFIRMED |
| 30 | `screens/desktop/risk_velocity_limits_desktop/code.html` | `src/app/[locale]/risk/page.tsx` | CONFIRMED |
| 31 | `screens/desktop/sub_merchant_onboarding_checklist_desktop/code.html` | `src/app/[locale]/onboarding/page.tsx` | CONFIRMED |
| 32 | `screens/desktop/support_documentation_hub_desktop/code.html` | `src/app/[locale]/support/page.tsx` | CONFIRMED |
| 33 | `screens/desktop/system_health_monitoring_desktop/code.html` | `src/app/[locale]/system/page.tsx` | CONFIRMED |

**Surplus (implementation without prototype):**

| Route | Status |
|---|---|
| `src/app/[locale]/sign-in/page.tsx` | UNMAPPED — auth (Better Auth ADR-0004), no screen |
| `src/app/[locale]/sign-up/page.tsx` | UNMAPPED — auth, no screen |

No UNMAPPED prototype. `PROGRESS.md:21-55` ✅ marks are premature.

---

## 3. Gap Matrix (abridged — full per-batch reports retained in task logs)

*Component resolution: `Sidebar/TopBar/BottomNav` flagged truly missing because `layout.tsx:22` + `[locale]/layout.tsx:16` do not render them; `Table/Badge/etc.` verified via `src/components/ui/*` before flagging.*

| Route | Prototype(s) | Missing UI (HIGH) | Surplus UI | Missing Handlers/Links | Copy Drift | A11y Gaps | Severity |
|---|---|---|---|---|---|---|---|
| `/dashboard` (mobile) | `mobile/dashboard_home:200-310` | Welcome `Imanino 1/3` + Volume `42,050/8,420` + 3 Quick Actions + BETA Spotlight | `Hero3DWrapper` + `DataTable txn_001` (mobile has no table) | `Verify Identity Start` + 3 Quick Actions + bottom nav `href="#"` | `Welcome/12.5%` → `Pending 540k/98.2% IDR` | `alt Logo` lost; `scope` missing | HIGH |
| `/dashboard` (desktop) | `desktop/dashboard_home:139-348` | Setup `60%` 4 tasks + metrics `1.24M/8,402/0.8%` + welcome `Download/New Txn` + 4 Quick Actions + SideNav `w-260 border-l-4` + TopAppBar `h-16 search ⌘K pill` | same | `Download/New Txn/search` | `Acme/Sarah 1.24M` → `12,340,000` | same | HIGH |
| `/balance` (mobile) | `mobile/balance:235-355` | `Top Up`/`Withdraw` + `Auto-Withdrawal Setup arrow_forward` + `View all/Export CSV` + `Type pills` | `ID/Balance` cols not in spec | `Top Up/Withdraw/Export/View all` inert | `Settlement #9822 +45.5M` → `BAL-001 -500k` | toggle `aria-label` lost | HIGH |
| `/balance` (desktop) | `desktop/balance:257-444` | `Pending Clearance Rp45.2M + Last Payout + toggle aria-label + Schedule Daily / BCA ****4910 + Configure + Status pills line-through Failed` + filters | same | `toggle/Configure/filter` | `Rp 1,240,500,000` → `IDR 1,005,870,599` | toggle semantics lost | HIGH |
| `/billing` | `billing_invoices:201-337` | Breadcrumbs `Enterprise > Billing` + table `Billing Period range + 5 cols` + rows `INV-2023-08-4421 14.2M Paid / Pending / Overdue` + `PDF title` + `Filter + Export Statement` | `Select All/Paid/Due` + `Calendar` + `Tabs` + `Customer` col | `Invoice hover:underline/PDF/Filter/Export` | `14,200,500 Paid` → `1,200,000 Paid/Due` + `Budi` | `picture_as_pdf` span no `role` | HIGH |
| `/customers` (mobile) | `mobile/customer:165-273` | `Add Customer h-[36px]` + `Reference ID REF-10042` + `chevron_right` + `1 to 3 of 45` | `Badge {len}` + note + `LTV` col mobile | `Filter` inert; `more_horiz` span | `Acme/REF-100xx 45` → `Budi/IDR 12M 14,263` | `Checkbox` no `aria-label` | HIGH |
| `/customers` (desktop) | `desktop/customer:220-389` | `Export + Add Customer + Filter + 2,104 Total + Search` + cols `Reference ID + Added` | same | same | `Sarah $4,520` → `Budi IDR` | same | HIGH |
| `/transactions` (mobile) | `mobile/transaction:172-270` | `Incoming 1,245,000 / Outgoing 342k` + `Search + date + Filters` | `MetricCard 3× mock` + `14,263` pagination | `Status/Date/Channel` inert; search is `<span>` not `<input>`; `group-hover` broken (`tr:74` no `group`) | `Transactions` vs `Ledger` | `Checkbox` no `aria-label` | HIGH |
| `/transactions` (desktop) | `desktop/transaction:209-384` | `Export CSV + Create Payment` + `Total Volume 2,450,892 +12.4% / Successful 14,239 / Failed 24` + `Status:All Date:Last 7 Channel:All More filters` | same | same | same | same | HIGH |
| `/audit` | `audit:206-393` | `Search resources + Last 24h + All Actions + Success/Failure checkboxes + Export CSV` + cols `Timestamp w-32 mono / User avatar / Action chip key_prod / IP mono / Status` + 5 rows `IP 192.168` + `1-5 of 12,042` | `Tabs Main/Footer` + `Select Action/User + Calendar + Kbd` + `ID/Target` cols | `Tabs` inert; `Select/Calendar` no handlers | `12,042 events` → 2 rows `e.klein` | `Select` no `aria-label`; `scope` missing | HIGH |
| `/settings/api-keys` | `api_key:269-431` | `Generate New Key + Live 2 rows sk_live•••• + Test 1 row sk_test + API Status 2/10 20% + Security 3 check` + `lg:grid-cols-3` | single row `key_prod` | `Generate/Copy/more_vert/Read Docs` | 2+1 keys → 1 row `31 Aug` | `title Copy Key` lost | HIGH |
| `/settings/developer` (desktop) | `developer_desktop:216-338` | `API Keys Generate + table 2 rows + Webhook Add Endpoint + table payment.*/failing` + `IP Whitelist + Docs surface-tint` | `Tabs Webhooks/API` + single `example.com` row | `Generate/Add/more_vert/close/View Docs` | `api.acme.com` → `example.com` | `more_vert` no `aria` | HIGH |
| `/settings/developer` (mobile) | `developer_mobile:160-278` | `LIVE MODE pill` + `menu_book View Docs` + `Receiving 12 events chevron` + `IP security toggle chip` | same Tabs | same | same | same | HIGH |
| `/reports/builder` (mobile) | `reports_mobile:196-367` | Radios `Transactions/Payouts/Customers` + `Date 2023-10-01→10-31 + 7D/30D/YTD` + `Output CSV/XLSX/PDF` + `Reset+Generate play_arrow` + `Recent 3 + View All` + `Notice >90 days` | `Select Status + Checkbox QRIS/VA + Calendar + Preview txn_001` | radios→checkbox swap; `Generate/Reset/download` missing | `All clearing` → `QRIS/VA` | `RadioGroup` missing | HIGH |
| `/reports/builder` (desktop) | `reports_desktop:303-602` | `w-80 Config Panel Data Source/ Dates + presets 30D + Filters Status/Amount + Columns 7 checks + Reset/Apply` + `Live Preview 1,248 pulse + Schedule + Export CSV + table 5 rows pills + pagination 1-50` | same | `Add/close/Reset/Apply/Schedule/Export/sort/pagination` lost | `1,248 rows` → 1 row `IDR` | `aria-sort` missing | HIGH |
| `/payments/links` | `payment_links:196-304` | `Create Link + Tabs Single/Multiple aria-current + Search + filter_list + External ID/Status/Payer Email/Amount 4 rows inv_8x9a… $4,250 + pagination 1-5 of 24` | `QRCard QRCode + Input readOnly + Copy` + `Title/Amount/Status` redefined | `Create/Tabs/Search/Filter/row cursor` lost | `$4,250 Settled` → `IDR 500k Active` | `aria-current` lost | HIGH |
| `/payouts/bulk` | `bulk_payouts:221-302` | Breadcrumbs + `Batch Disbursements Across 3 / Pending $4,250,890 + Completed $18,405,200 trending` + `Quick Upload drag CSV or JSON + Download Template` + search `⌘K` | `Progress 45%` + `Stepper 1/2/3` + `Badge Pending + idempotent` + `Table Budi 800012` (proto 0 tables) | `Export/New Batch/Download Template` | `Batch 14,205 recipients` → `Max 1,000` | file input no `aria` | HIGH |
| `/payouts/settings` | `payout_settings:205-323` | `Settlement tune + Automated toggle checked + Schedule Daily/Weekly/More + Minimum 50,000 mono + Destination BCA ****1234 Verified + Change + Email 2 checkboxes + Discard/Save` | `Channels Select BCA/BNI + Daily limit 100M` | `Toggle/radios/Change/checkboxes/Discard/Save` → inert | `Minimum 50,000` → `Daily 100M` | `label for` 5→2 | HIGH |
| `/subscriptions` (mobile) | `subscriptions_mobile:170-274` | `Create Subscription + metrics 1,248/34/12 + Search + Filter + Export + table Customer/Plan ID/Amount/Interval/Status 3 rows Acme SUB-88291 4.5M` | `Tabs/Sub/CAL + Calendar` + 1 row `Budi Pro 500k/mo` | `Create/Search/Filter/Download/more_vert` | `1,248/34/12` → 1 row | Tabs surplus | HIGH |
| `/subscriptions` (desktop) | `subscriptions_desktop:213-404` | `Export + Create + metrics vs last month + search + Filter + table Customer avatar sub_1Mvw8K + Status pills + Amount 15M + Interval/Created Date + Actions group-hover + pagination 1-10 of 1,290` | same | same + avatars/pagination lost | `TechFlow sub_1Mvw8K 15M` → `Budi 500k/mo` | `scope` missing | HIGH |
| `/team` (mobile) | `team_mobile:181-342` | `Add Member + Search + Role/Status filters + Member/Role/Status/Last Active text-right 4 rows Elena Admin/ Marcus Developer Pending … chevron + 1-4 of 24` | `Tabs Members/Roles + Select All/Admin + Invite + 2FA Switch` | search→select; `chevron`→`⋯` inert | `Administrator/Developer` → `Admin/Member` | `Checkbox/⋯` no `aria` | HIGH |
| `/team` (desktop) | `team_desktop:306-501` | `Export + Add Member + Members/Roles/Pending Invites + Filter + bulk 0 selected Change Role Deactivate disabled + checkbox/Member/Role shield/code + Last Active/more_vert + pagination 1-3 of 24` | same `2FA` | `Export/more_vert/bulk` | `Invited pending amber` → `Active` | `scope` missing | HIGH |
| `/fraud/blocklist` | `blocklist_mobile:242-364` | `Tabs IP/Card/Email + Search IP + Value mono + Reason pill + Added On/Actions delete + 4 IPs + 1-4 of 124` | `Status Blocked Badge` + `4111… + user@fraud` | `Tabs/delete/pagination` | `192.168.1.1 Known Malicious` → `4111 Fraud` | `delete` no `aria` | HIGH |
| `/fraud` | `fraud_desktop:294-442` | `Metrics 14,209/8,432/3,194 + Add to Blocklist + Tabs IP router/Cards/Email + Filter IPs + Export + Value/Reason/Added On/Actions 4 IPs + more_vert` | `Tabs Rules/Blocklist + Rules table Block high-risk/Velocity + Switch` | `Add/more_vert/Export/Filter` → `Switch` | `14,209` → `Block country` hallucinated | `more_vert` no `aria` | HIGH |
| `/kyc` (mobile) | `kyc_mobile:165-221` | `Secure shield encrypted + steps 1 Business Info bg-primary/2 Document/3 Review + Start arrow_forward + Contact Support` | `Progress 66 + Step 2/3 + Accordion Personal NIK + Upload KTP dashed + Submit` | `Start/Contact` → `Accordion/Submit` inert | `Business Info` → `Personal Info + NIK` | `Progress` no `valuenow` | HIGH |
| `/kyc` (desktop) | `kyc_desktop:199-328` | `Steps 4 sidebar Basic Info ✓/Business Docs active/Beneficial/Final + Secure info bg-primary/5 + Upload Accepted PDF Max10MB + Action Required + Document Type select + Issuing Delaware + Drag cloud_upload aria-label + Attached acme.pdf 2.4MB + delete + Save Draft/Submit` | same | `Select/Jurisdiction/Drag/delete/Save Draft` | `Certificate` → `KTP` | `aria-label Upload` lost | HIGH |
| `/webhooks` | `webhook_logs:172-313` | `Search + 2 selects All Statuses/Events + Refresh + Status 200/500 + Event payment… + Target URL + latency 24ms + evt_3NzQ + chevron + 4 rows + 1-4 of 1,024` | `ScrollArea + Timeline` + `ID/Event/Time/Status` simplified | search/select/chevron/Prev/Next | `200/500` → `delivered/failed`; 4 events →2 | `Search` no `aria` | HIGH |
| `/settings/merchant` | `merchant:278-344` | `Business Info 2-col Legal Acme LLC/DBA + 3-col Address + Tax 12-3456789 mono + Branding logo alt + Upload New + Color #1a56db` + footer `Cancel/Save` | `Tabs General/KYC + Avatar MC + Industry Select + Description` | `Upload/Save` lost | `Acme LLC` → `Imanino Corps` + `Industry` | `label for` not linked | HIGH |
| `/settings/notifications` | `notifications:282-468` | `Global 3 toggles Email admin@acme/SMS/Dashboard + Payments 3 ACTIVE EVENT/EMAIL/DASHBOARD/SMS Successful Daily / Failed CRITICAL Instant + Security New Device Forced disabled lock + Reset/Save` | `Tabs email/webhook + single Email alerts Switch payout + daily + Immediate/Daily` | toggles/selects per channel/Save | 3 channels + matrix → single `Payout` | disabled `opacity-50` not `aria-disabled` | HIGH |
| `/risk` | `risk:182-272` | `Active Ruleset + Discard/Deploy + Alerts 24h 14 +12% + Critical Velocity Max Card 4492 10:42 + Global Volume toggle checked + Max Daily 1,500,000 + Monthly 45,000,000 mono right` | `Slider 5/min + Switch Block + Select Country + Threshold IDR + Alert` | `Toggle/number Deploy` → `Slider/Select` | `$1,500,000 daily` → `5/min` | inputs no `for` | HIGH |
| `/onboarding` | `onboarding:252-414` | `Progress 3 of 4 75% w-75% + 4 cards Business COMPLETED/Compliance/Bank ****4592 Verified Oct24/Technical IN PROGRESS primary + API line-through + First Test unchecked + Go to Dev Dashboard ->` | `Progress 66 2/3 + Checkbox Business + Collapsible + Checkbox Documents` | `Review/View/Manage/Go to Dev` → `Collapsible` | `3 of 4 75% Acme Corp` → `2 of 3 66%` | icons no `aria` | HIGH |
| `/support` | `support:127-247` | `Search 'Settlement limits' + Cmd+K + Popular 4 cards API/Settlement/KYC/Reporting secondary-container + System Status API Gateway/Settlement/Webhooks ping + View status + Contact Live Chat/Email/Ticket` | `Breadcrumb + NavigationMenu + Input Search docs + Accordion + xendit-node#31` | 4 cards/View status/Live Chat | `Settlement limits` → `Search docs` | search no `aria` | HIGH |
| `/system` | `system:275-540` | `All Systems Operational pulse + Core API 99.99% 42ms + Ledger DB 15% bar w-[15%] + Webhook Queue 142 <1s + Traffic Last 24h Y1k/500/0 bars success/failed + table 5 cols 4 rows evt_9k2m payment 200 OK + Search + View Full Log + Settings sliders Failure >5%/Queue >500 + Email/Slack/SMS + Save/Test + Pro Tip` | `Gauge 98% + Progress 92 + ChartContainer placeholder + Timeline` | `Search/Inspect/sliders/Save/Test` → static | `99.99% 42ms 15% 142` → `98% 92` | `Gauge` no `valuenow` | HIGH |

---

## 4. Executive Summary

| Total Screens | Fully Parity | Partial | Not Started | Unreadable |
|---|---|---|---|---|
| 33 (14 mobile + 19 desktop; 24 unique routes + 9 shared variants) | 0 (0%) | 33 (every `page.tsx` exists as 31-116 line placeholder) | 0 (0 files missing, but 0 reach parity) | 0 |

| Routes (implementation) | Have Prototype | Surplus (no prototype) |
|---|---|---|
| 27 (26 `[locale]/*` + root `/`) | 24 | 2 (`sign-in`, `sign-up` — Better Auth, ADR-0004) |

**Overall completion: 12-18%** — Token/system groundwork ~80% (`globals.css:8-62` + `241-248`, `layout.tsx:22` amber banner, 94 `ui/*.tsx`, `next-intl en/id`, headers) vs structural/content ~5% (all `page.tsx` 31-116 lines vs prototypes 243-605 lines, mock `IDR` rows vs USD/IDR mixes, bento grids missing), interaction ~3% (`href="#"`, `hover:*`, `select/date/file/more_vert/pagination` inert or absent), responsive not achieved (shared routes collapse divergent mobile/desktop densities).

`PROGRESS.md:21-55` ✅ marks are premature — every mapping is HIGH per rubric.

---

## 5. Actionable Fix List — Grouped by Severity

> **Global prerequisite (do first):** Wire shared chrome in `src/app/[locale]/layout.tsx:6-16` — currently only `NextIntlClientProvider`. Add `<Sidebar activeHref>` (`layout/sidebar.tsx:14` `w-sidebar-width fixed`) + `<TopBar title>` (`layout/top-bar.tsx:4` `h-14 sticky`) + `<BottomNav />` (`layout/bottom-nav.tsx:12` `h-16 md:hidden`) so per-route audits stop re-flagging nav. Keep `TestModeBanner` (`src/app/layout.tsx:22` sticky amber + pill) per `TEST MODE #d97706` rule.

### HIGH — Missing entire sections / broken nav / non-functional forms

For each route below: **file(s) to modify → what to add/change/remove → prototype anchor.**

1. `/dashboard` → `src/app/[locale]/dashboard/page.tsx:5-35` + `components/layout/metric-card.tsx:4` + `data-table.tsx:6` : Add welcome `Imanino/Sarah` bento + Setup `60%`/`1/3` bar + Today's Volume + Quick Actions grid (`Create Payment Link/Send Payout/QR / Invoice/Customer/Payouts/API`) + correct `MetricCard` values (`1.24M +12.5% vs last month`) + trends; wire `Start → /kyc`, `Payment Link → /payments/links` via `next/link`; keep `Hero3DWrapper` but not displace bento. Anchors `mobile/dashboard_home:200-310` + `desktop/dashboard_home:228-348`.
2. `/balance` → `src/app/[locale]/balance/page.tsx:13-70` : Add `Top Up add_circle + Withdraw wallet` CTAs + `Auto-Withdrawal` toggle `aria-label` + `Schedule Daily / BCA ****4910 + Configure / Setup arrow_forward` + `Export CSV download` header + table `Description icons + Status pills Pending/Succeeded/Failed + line-through Failed` + filter `All Types + View All`; remove surplus `ID/Balance` cols. `mobile/balance:235-355` + `desktop/balance:257-444`.
3. `/billing` → `src/app/[locale]/billing/page.tsx:14-98` : Add breadcrumbs `Enterprise > Billing`, table `Invoice ID / Billing Period range / Amount IDR mono right / Status pills Paid/Pending/Overdue + dot border + check/schedule/warning + Action picture_as_pdf title="Download PDF"`, toolbar `Filter + Export Statement bg-primary`, header `Next Invoice Oct 01 event / Accrued 12,450,000 trending_down`; remove `Select All/Paid/Due + Calendar + Tabs + Customer` col unless spec adds Customer. `billing_invoices:201-337`.
4. `/customers` → `src/app/[locale]/customers/page.tsx:1-107` : Add `Add Customer h-[36px] bg-primary add + Export + Filter + 2,104 Total + Search by name` + cols `Reference ID REF-10042 mono + Added Oct 24` + `chevron_right` + `1 to 3 of 2,104` + pagination; fix `more_horiz span:80` → `button aria-label`; wire `Input + Dropdown Export/Invite`. `mobile/customer:165-273` + `desktop/customer:220-389`.
5. `/transactions` → `src/app/[locale]/transactions/page.tsx:1-116` : Add `Export CSV + Create Payment` + metrics `Total Volume 2,450,892 +12.4% / Successful 14,239 / Failed 24` + toolbar `Status:All Date:Last 7 Channel:All More filters + Filter this view input type=text + date`; fix headline mobile `Transactions` vs desktop `Ledger` + `more_horiz group-hover` add `group` to `TableRow:74` + turn `div span:51` into `<Input>` + wire `Select`. `mobile/transaction:172-270` + `desktop/transaction:209-384`.
6. `/audit` → `src/app/[locale]/audit/page.tsx:1-91` : Add `Export CSV` + `Search resources,IPs... + ⌘K + Last 24h + All Actions + Success/Failure checkboxes` + cols `Timestamp mono / User avatar / Action chip key_prod / IP mono / Status pills success/failed border + 5 rows IP + pagination 1-5 of 12,042`; remove `Tabs Main/Footer` + `Select User/Calendar/Kbd` + `ID/Target` cols. `audit:206-393`.
7. `/settings/api-keys` → `src/app/[locale]/settings/api-keys/page.tsx:1-44` : Add `Generate New Key add` + split `Live 2 rows sk_live•••• + Test 1 row sk_test Sandbox` 2 tables `grid-cols-12` + side `API Status 2/10 20% + Security 3 check + Read Docs`; remove single `key_prod` placeholder. `api_key:269-431`.
8. `/settings/developer` → `src/app/[locale]/settings/developer/page.tsx:1-47` : Add `API Keys Generate + table 2 rows + Webhook Add Endpoint + table payment.*/failing + IP Whitelist input Add + list + Docs surface-tint View Docs + LIVE MODE pill (mobile 160-163)` + `max-w-container-max` grid not Tabs; remove Tabs + single `example.com` row. `developer_desktop:216-338` + `developer_mobile:160-278`.
9. `/reports/builder` → `src/app/[locale]/reports/builder/page.tsx:1-61` : Add `w-80 Config Data Source select Transactions/Payouts/Customers/Disputes + Dates dual 2023-10-01 + presets 7D/30D/YTD + Filters Status/Amount + Columns 7 checks + Reset/Apply + Live Preview 1,248 pulse + Schedule + Export CSV + table 5 rows pills + pagination 1-50`; use `RadioGroup` not `Checkbox QRIS/VA`; dual dates not single Calendar; fix currency `USD $1,250` not `IDR 1,000,000`. `reports_mobile:196-367` + `reports_desktop:303-602`.
10. `/payments/links` → `src/app/[locale]/payments/links/page.tsx:1-58` : Add `Create Link add + Tabs Single/Multiple aria-current + Search + filter_list + External ID/Status/Payer Email/Amount 4 rows inv_8x9a $4,250 + pagination 1-5 of 24`; remove `QRCard` + `Title/Amount/Status` redefinition unless QR is spec'd. `payment_links:196-304`.
11. `/payouts/bulk` → `src/app/[locale]/payouts/bulk/page.tsx:1-76` : Add breadcrumbs `Payments > Bulk Payouts` + `Batch Disbursements Across 3 / Pending $4,250,890 + Completed $18,405,200 trending` + `Quick Upload dashed border-outline-variant bg-surface-canvas upload_file + Drag CSV or JSON + Download Template` + search `⌘K`; remove `Progress 45% + Stepper + Badge + idempotent + Table` (proto 0 tables). `bulk_payouts:221-302`.
12. `/payouts/settings` → `src/app/[locale]/payouts/settings/page.tsx:1-41` : Add `Settlement tune + Automated toggle checked + Schedule Daily/Weekly/Monthly radios + Minimum 50,000 mono + Destination BCA ****1234 Verified + Change + Email 2 checkboxes + Discard/Save`; remove `Select BCA/BNI + Daily limit 100M` rename; wire toggle/radios. `payout_settings:205-323`.
13. `/subscriptions` → `src/app/[locale]/subscriptions/page.tsx:1-53` : Add `Create Subscription + metrics 1,248/34/12 + Search + Filter + Export + table Customer/Plan ID sub_1Mvw8K mono / Status pills / Amount 15M / Interval/Created Date/Actions group-hover avatar + pagination 1-10 of 1,290`; remove `Tabs/Calendar`. `subscriptions_mobile:170-274` + `desktop:213-404`.
14. `/team` → `src/app/[locale]/team/page.tsx:1-93` : Add `Add Member person_add + Export + Members/Roles/Pending Invites + Filter + bulk 0 selected Change Role Deactivate + checkbox/Member/Role shield + Status dot + Last Active mono + more_vert group-hover + pagination 1-4 of 24`; remove `2FA Switch + Invite rename + Dashboard-only note`. `team_mobile:181-342` + `desktop:306-501`.
15. `/fraud/blocklist` → `src/app/[locale]/fraud/blocklist/page.tsx:1-49` : Add `Tabs IP/Card/Email + Search IP + Value mono + Reason pill + Added On/Actions delete + 4 IPs + pagination 1-4 of 124`; remove `Status Blocked Badge` col. `blocklist:242-364`.
16. `/fraud` → `src/app/[locale]/fraud/page.tsx:1-62` : Add `Metrics 14,209/8,432/3,194 + Add to Blocklist + Tabs IP router/Cards/Email + Filter IPs + Export + Value/Reason/Added On/Actions 4 IPs + more_vert`; remove `Tabs Rules/Blocklist` inverse + `Rules table`. `fraud_desktop:294-442`.
17. `/kyc` → `src/app/[locale]/kyc/page.tsx:1-56` : Add `Secure shield encrypted + Steps 4 sidebar Basic ✓/Business active/Beneficial/Final + Secure info + Upload Accepted PDF Max10MB + Action Required + Document Type select + Issuing Delaware + Drag cloud_upload aria-label + Attached acme.pdf 2.4MB + delete + Save Draft/Submit + Contact Support`; remove `Progress 66 + Accordion NIK + Upload KTP`. `kyc_mobile:165-221` + `desktop:199-328`.
18. `/webhooks` → `src/app/[locale]/webhooks/page.tsx:1-45` : Add `Refresh + Search + 2 selects All Statuses/Events + Status 200/500 + Event payment… + Target URL + latency 24ms + evt_3NzQ + chevron + 4 rows + pagination 1-4 of 1,024`; remove `ScrollArea + Timeline` + `ID/Event/Time/Status` simplified. `webhook_logs:172-313`.
19. `/settings/merchant` → `src/app/[locale]/settings/merchant/page.tsx:1-54` : Add `Business Info 2-col Legal Acme LLC/DBA + 3-col Address + Tax mono + Branding logo alt + Upload New + Color #1a56db + footer Cancel/Save`; remove `Tabs + Avatar + Industry + Description`. `merchant:278-344`.
20. `/settings/notifications` → `src/app/[locale]/settings/notifications/page.tsx:1-47` : Add `Global 3 toggles Email/SMS/Dashboard + Payments 3 ACTIVE EVENT/EMAIL/DASHBOARD/SMS Successful Daily / Failed CRITICAL Instant + Security New Device Forced lock + Reset/Save`; remove `Tabs email/webhook + single Email alerts`. `notifications:282-468`.
21. `/risk` → `src/app/[locale]/risk/page.tsx:1-49` : Add `Active Ruleset + Discard/Deploy + Alerts 24h 14 + Critical Velocity Max Card 4492 + Global Volume toggle checked + Max Daily 1,500,000 + Monthly 45,000,000 mono right`; remove `Slider 5/min + Switch Block + Select Country + Threshold`. `risk:182-272`.
22. `/onboarding` → `src/app/[locale]/onboarding/page.tsx:1-42` : Add `Progress 3 of 4 75% w-75% + 4 cards Business COMPLETED/Compliance/Bank ****4592 Verified/Technical IN PROGRESS primary + API line-through + First Test unchecked + Go to Dev Dashboard ->`; remove `Progress 66 + Collapsible`. `onboarding:252-414`.
23. `/support` → `src/app/[locale]/support/page.tsx:1-50` : Add `Search 'Settlement limits' + Cmd+K + Popular 4 cards API/Settlement/KYC/Reporting secondary-container + System Status ping + View status + Contact Live Chat/Email/Ticket`; remove `Breadcrumb + NavigationMenu + Search docs + Accordion + xendit-node`. `support:127-247`.
24. `/system` → `src/app/[locale]/system/page.tsx:1-51` : Add `All Systems Operational pulse + Core API 99.99% 42ms + Ledger DB 15% bar w-[15%] + Webhook Queue 142 <1s + Traffic Last 24h Y1k bars success/failed + table 5 cols 4 rows evt_9k2m payment 200 OK + Search + View Full Log + Settings sliders Failure >5%/Queue >500 + Email/Slack/SMS + Save/Test + Pro Tip`; remove `Gauge 98% + Progress 92 + Chart placeholder + Timeline`. `system:275-540`.

### MEDIUM — Token/layout/surplus debug UI

- **Tokens:** `border-border-subtle bg-white rounded-lg` → `bg-surface-container-lowest border-outline-variant rounded-xl shadow-sm` (`customer:184` etc.) + `p-table-cell-padding 12px 16px` via `data-table.tsx:20/24` not `table.tsx:73 px-2 h-10`; `hover:bg-surface-bright` rows.
- **Pills:** `Badge default bg-primary` → `bg-success-status/10 #10b981 / pending #f59e0b / failed #ef4444 / error-container/secondary/surface-variant + dot + border + label-caps 10-11px`.
- **Surplus:** Remove `Prototype: …` dev notes (all `page.tsx`); remove invented `QRCard/Timeline/Gauge` unless spec'd.
- **Spacing:** Restore `px-gutter`, `max-w-container-max`, `lg:grid-cols-12`, `w-260 collapsed 64`, `gutter/stack-md` vs `p-gutter space-y-6` only; `md:hidden BottomNav 5 icons`.
- **Currency:** Align `IDR` (`id` default) vs `USD/$/Rp` per locale `routing.ts:6` — derive from DAL not hard-coded; fix totals `2,104 vs 14,263` etc.

### LOW — A11y/decorative/comments

- Add `scope="col"` to `th` (`table.tsx:68-79`), `aria-label`/`title` to icon `more_vert/delete/filter_list/chevron/picture_as_pdf` (`billing:282 title="Download PDF"`), `aria-hidden` to `material-symbols`, `alt` to `img` (`merchant:322`, `team_desktop:206`), `aria-label` to `Input placeholder Search`.
- Shadows/radius: `card.tsx:10` `shadow ring` → spec `rounded-xl/lg border shadow-sm` via `cn()` not fork.
- `sign-in/sign-up` surplus: add rows to `SCREENS.md:9-48` + `PROGRESS.md:21-55` or ADR-gate.

---
*Saved from autonomous read-only audit — 6 batched sub-agents, all files explicitly read, no fabrication. Next: wire `docs/superpowers/plans/<date>-<feature>.md` per `writing-plans` + execute via `incremental-implementation` + verify `pnpm typecheck && pnpm build` + `codegraph sync` per task.*
