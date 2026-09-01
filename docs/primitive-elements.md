# Primitive Elements — shadcn/ui Audit (100+)

> Source of truth for `AGENTS.md:Component rules`. Generated 2026-08-31 11:48 — Build Mode active. **Existing kept as-is** (`apps/web/src/components/layout/*` 6 files + pre-shadcn `ui/button,card`). New routes must use `src/components/ui/*` 94 files.

Workspace: `/home/norman2/31-8-26-xendit-projects/apps/web` | `codegraph` 141 files wal, `ui.shadcn.com/docs/components:60` + `registry.directory` 82 registries 2093 components

---

## 1) Inventory — 94 Files in `src/components/ui/*.tsx`

`wsl -d ubuntu-surfsense bash -c "ls -1 src/components/ui | wc -l"` → **94** (62 official `add -a` + 32 `@diceui/@tailark`).

| # | File |
|---|---|
|1| `accordion.tsx` |
|2| `action-bar.tsx` |
|3| `alert.tsx` |
|4| `alert-dialog.tsx` |
|5| `angle-slider.tsx` |
|6| `aspect-ratio.tsx` |
|7| `attachment.tsx` |
|8| `avatar.tsx` |
|9| `avatar-group.tsx` |
|10| `badge.tsx` |
|11| `banner.tsx` |
|12| `breadcrumb.tsx` |
|13| `bubble.tsx` |
|14| `button.tsx` |
|15| `button-group.tsx` |
|16| `calendar.tsx` |
|17| `card.tsx` |
|18| `carousel.tsx` |
|19| `chart.tsx` |
|20| `checkbox.tsx` |
|21| `circular-progress.tsx` |
|22| `collapsible.tsx` |
|23| `color-picker.tsx` |
|24| `color-swatch.tsx` |
|25| `combobox.tsx` |
|26| `command.tsx` |
|27| `compare-slider.tsx` |
|28| `context-menu.tsx` |
|29| `cropper.tsx` |
|30| `dialog.tsx` |
|31| `direction.tsx` |
|32| `drawer.tsx` |
|33| `dropdown-menu.tsx` |
|34| `editable.tsx` |
|35| `empty.tsx` |
|36| `field.tsx` |
|37| `file-upload.tsx` |
|38| `gantt.tsx` |
|39| `gauge.tsx` |
|40| `hover-card.tsx` |
|41| `input.tsx` |
|42| `input-group.tsx` |
|43| `input-otp.tsx` |
|44| `item.tsx` |
|45| `kbd.tsx` |
|46| `key-value.tsx` |
|47| `label.tsx` |
|48| `marker.tsx` |
|49| `marquee.tsx` |
|50| `masonry.tsx` |
|51| `media-player.tsx` |
|52| `menubar.tsx` |
|53| `message.tsx` |
|54| `message-scroller.tsx` |
|55| `native-select.tsx` |
|56| `navigation-menu.tsx` |
|57| `pagination.tsx` |
|58| `phone-input.tsx` |
|59| `popover.tsx` |
|60| `progress.tsx` |
|61| `qr-code.tsx` |
|62| `questionnaire.tsx` |
|63| `radio-group.tsx` |
|64| `rating.tsx` |
|65| `relative-time-card.tsx` |
|66| `resizable.tsx` |
|67| `scroll-area.tsx` |
|68| `scroll-spy.tsx` |
|69| `segmented-input.tsx` |
|70| `select.tsx` |
|71| `selection-toolbar.tsx` |
|72| `separator.tsx` |
|73| `sheet.tsx` |
|74| `sidebar.tsx` *(shadcn, collides with layout/sidebar.tsx)* |
|75| `skeleton.tsx` |
|76| `slider.tsx` |
|77| `sonner.tsx` |
|78| `speed-dial.tsx` |
|79| `spinner.tsx` |
|80| `stack.tsx` |
|81| `stat.tsx` |
|82| `status.tsx` |
|83| `stepper.tsx` |
|84| `switch.tsx` |
|85| `table.tsx` |
|86| `tabs.tsx` |
|87| `textarea.tsx` |
|88| `time-picker.tsx` |
|89| `timeline.tsx` |
|90| `toast.tsx` |
|91| `toggle.tsx` |
|92| `toggle-group.tsx` |
|93| `tooltip.tsx` |
|94| `tour.tsx` |

Also `components.json:15` `"ui": "@/components/ui"` and hooks `use-mobile.ts`, `use-isomorphic-layout-effect.ts`, `lib/compose-refs.ts`.

---

## 2) Usage in `src/app` + `src/components/layout` — Only 4/94 Used

`grep -R @/components/ui/ src/app src/components` (75 matches). **Business usage (app+layout) only 4:**

| Component | File:Line | Import |
|---|---|---|
| `card` | `src/app/[locale]/balance/page.tsx:1` | `import { Card } from "@/components/ui/card"` |
| `card` | `src/app/[locale]/sign-in/page.tsx:8` | `Card` |
| `card` | `src/app/[locale]/sign-up/page.tsx:8` | `Card` |
| `card` | `src/app/page.tsx:2` | `Card` |
| `card` | `src/components/layout/metric-card.tsx:1` | `Card` |
| `button` | `src/app/page.tsx:3` | `Button` |
| `input` | `src/app/[locale]/sign-in/page.tsx:6` | `Input` |
| `label` | `src/app/[locale]/sign-in/page.tsx:7` | `Label` |

> `dashboard:1-3` only `MetricCard`+`DataTable` (layout, not `table` shadcn). `transactions:1-3` hand-rolls `<table>` + raw checkbox/pagination.

**Internal ui→ui imports (19 touched, not business):** `button:22`, `direction:12`, `input:8`, `card:6`, `separator:5` etc. (e.g. `calendar:12`→`Button`, `color-picker:18`→`Popover/Select`). Only 19/94 ever imported anywhere.

---

## 3) Custom `layout/*` 6 Files — Overlap & Replacement Path (Kept As-Is)

| File | Purpose | Overlap shadcn | Keep/Replace |
|---|---|---|---|
| `test-mode-banner.tsx:21` variant `banner\|pill` `#d97706` | Sticky banner + pill | Dup `banner.tsx` + `alert/badge` | **Keep** as-is; new code use `banner` (amber variant) |
| `sidebar.tsx:42` `w-sidebar-width fixed bg-inverse-surface` 6 nav | Fixed sidebar | Dup `ui/sidebar.tsx:10` (`SidebarProvider+Sheet+Tooltip`) | **Keep**; new use `ui/sidebar` |
| `metric-card.tsx:24` `Card` wrapper `label-caps headline-xl data-mono` | Metric | Dup `stat.tsx`+`skeleton` | **Keep**; new use `card+stat` |
| `data-table.tsx:25` 5 exports `label-caps sticky data-mono right` | Table chrome | Dup `table.tsx` + missing `checkbox/pagination/badge` | **Keep**; new use `table+checkbox+pagination` (preserve `cell-x/y` via `cn()`) |
| `top-bar.tsx:19` `h-14 sticky bg-surface` + `⌘K` | Top bar | `navigation-menu+breadcrumb+input-group+kbd+command` | **Keep** |
| `bottom-nav.tsx:32` `fixed h-16 md:hidden` | Mobile nav | `tabs/toggle-group` | **Keep** |

**Rule:** All 6 kept as-is per `AGENTS.md:Component rules`. New migrations wire 75 unused primitives directly.

---

## 4) Unused 75/94 = 80% — Not Bloat, Reserved for 27 `⬜` Screens

**Unused list (alphabetical):** `accordion, action-bar, alert, alert-dialog, angle-slider, aspect-ratio, attachment, avatar, avatar-group, banner, breadcrumb, bubble, button-group, calendar, carousel, chart, checkbox, circular-progress, collapsible, color-picker, color-swatch, combobox, compare-slider, context-menu, cropper, drawer, editable, empty, field, file-upload, gantt, gauge, input-otp, item, kbd, key-value, marker, marquee, masonry, media-player, menubar, message, message-scroller, native-select, navigation-menu, pagination, phone-input, progress, qr-code, questionnaire, radio-group, rating, relative-time-card, resizable, scroll-area, scroll-spy, segmented-input, selection-toolbar, sidebar*(shadcn)*, slider, sonner, speed-dial, spinner, stack, stat, status, stepper, switch, table, tabs, time-picker, timeline, toast, toggle-group, tour`

Business-only 90/94 unused — only `button,card,input,label` used.

**Critical unused with prototype evidence:**
| Shadcn | Screens Evidence |
|---|---|
| `table` | `transaction_ledger_desktop:257-268`, `billing:254`, `customer_directory:257` `label-caps sticky` + `data-mono right` |
| `pagination` | `transactions:104-112` hand-rolled `‹›` + `customer_directory_desktop` footer |
| `checkbox` | `transaction_ledger_desktop:261`, `team_permissions_desktop:364` raw `input checkbox` |
| `badge/status` | `transaction_ledger:26` `rounded-full bg-success/pending` spans |
| `dialog/sheet/drawer` | `bulk_payouts` create, `merchant_profile` |
| `tabs` | `detailed_audit_log_desktop:139-178` Main+Footer Tabs |
| `select/combobox/command` | `audit:232`, `billing:254` `<select>` + search |
| `calendar/time-picker/input-otp` | `risk_velocity_limits` calendar |
| `chart/gauge/progress` | `dashboard_home_desktop` metrics |
| `avatar/avatar-group` | `customer_directory` avatar, `team_permissions` |

---

## 5) Mapping 27 `⬜` Screens → Unused Primitives (Next Migrations Must Wire)

| Route `PROGRESS.md ⬜` | Prototype | Shadcn Needed (unused → needed) |
|---|---|---|
| `customers` | `customer_directory` + `_desktop` | `table, pagination, checkbox, avatar/avatar-group, badge/status, input, dropdown-menu, empty, breadcrumb` |
| `payouts/bulk` | `bulk_payouts_desktop` | `table, card/stat, progress/circular-progress/gauge, file-upload, stepper, button-group/selection-toolbar, dialog/sheet, alert/banner` |
| `billing` | `billing_invoices_desktop` | `table, card/stat, select/native-select, badge, tabs, calendar, empty` |
| `audit` | `detailed_audit_log_desktop` | `table, tabs, select, calendar/time-picker, checkbox, input/command, pagination, badge, kbd, breadcrumb` |
| `reports/builder` | `custom_reports_builder` | `calendar, select/combobox, checkbox/radio-group, table, card, popover, button-group` |
| `kyc` | `identity_verification_kyc` | `file-upload, stepper, progress, card, alert, accordion, input/textarea/field` |
| `risk` | `risk_velocity_limits_desktop` | `switch, slider, alert/banner, select, input, card, accordion` |
| `fraud` | `fraud_prevention` | `table, input/command, badge, switch, dialog, pagination` |
| `team` | `team_permissions` | `table, avatar/avatar-group, checkbox, tabs, select, switch, badge/status, pagination, dialog/sheet, dropdown-menu` |
| `subscriptions` | `subscription_management` | `table, card, badge, tabs, calendar, progress, empty` |
| `payments/links` | `payment_links_invoices` | `table, qr-code, badge, input/copy, card, pagination` |
| `webhooks` | `webhook_logs` | `table, timeline, scroll-area, badge/status, empty` |
| `settings/api-keys` | `api_key_management` | `table, input-otp/key-value, badge, dialog/alert-dialog, button-group` |
| `settings/developer` | `developer_settings` | `table, tabs, card, item, alert` |
| `support` | `support_documentation_hub_desktop` | `accordion, breadcrumb, navigation-menu, card, input/command` |
| `system` | `system_health_monitoring_desktop` | `chart/gauge/progress, timeline, card/stat, badge, alert` |
| `onboarding` | `sub_merchant_onboarding_checklist_desktop` | `stepper, progress, checkbox, card, collapsible` |
| `settings/merchant` | `merchant_profile_settings_desktop` | `avatar, input/textarea, select, field, card, tabs` |
| `settings/notifications` | `notification_preferences_desktop` | `switch, checkbox, select, card, tabs, alert` |

**Counts:** `button:22`, `direction:12`, `input:8` — only 19/94 ever imported. After migration, `table/pagination/badge/checkbox` will dominate.

---

## 6) Recommendation (per AGENTS.md)

- **Do not delete** 75 unused — they are ADR-0002 reserved for 27 `⬜`. Wire per migration: `customers` → `table+pagination+checkbox+avatar+badge` etc.
- **Consolidate** `layout/data-table` → `ui/table`+`scroll-area`+`checkbox`+`pagination` (keep `cell-x/y` via `cn()`), `metric-card` → `card+stat`, `test-mode-banner` → `banner` amber variant, `layout/sidebar` ↔ `ui/sidebar` avoid clash via `SidebarProvider`.
- **Verification:** After each PR, `grep -R @/components/ui/ src/app` must grow beyond 4; `pnpm typecheck && pnpm build`; flip `PROGRESS.md` row + cite ADR. This audit is source of truth — do not remove.
