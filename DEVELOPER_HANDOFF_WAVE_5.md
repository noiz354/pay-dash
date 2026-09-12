# Developer Handoff — Wave 5 (Maintaining & Extending the Redesign)

> **For:** the engineer picking this codebase up.
> **Rule of the codebase:** minimum safe change + maximum traceability. Every behavior below has a named module, a named test file, and a spec section. When you extend, you keep all three.
> **Read first:** `UX_REDESIGN_FINAL_IMPLEMENTATION_REPORT.md` §4 (invariants), `PR_REVIEW_GUIDE.md` §1–3, `KNOWN_DEBT_REGISTER.md`.

---

## 1. Architecture map

```
apps/web
├── src/
│   ├── middleware.ts            # ONLY entry Next loads (src/ exists → root middleware is ignored).
│   │                            # Re-exports ./proxy — do not duplicate logic here.
│   ├── proxy.ts                 # Edge gate: AUTH_ENFORCED strict|preview|off (default strict),
│   │                            # 302/401, public API prefixes, alias rewrites. Tests: proxy.test.ts, proxy.alias.test.ts
│   ├── app/
│   │   ├── layout.tsx           # root (fonts — the network-sensitive part; see §9 debt D-14)
│   │   └── [locale]/*           # all app routes (locale param; en + id parity)
│   │       ├── dashboard/       # Command Center SSR + lane focus (?lane=…)
│   │       ├── transactions/    # canonical ledger (URL-driven) + [id] detail (timeline, refund workflow, retry)
│   │       ├── payouts/         # hub (bulk + settings folded) + [id]
│   │       └── api/
│   │           ├── dashboard/command-center/   # guarded polling endpoint (no-store, per-poll session check)
│   │           └── exports/* (11 routes)       # each guardExport(request, permission) before streaming
│   ├── components/
│   │   ├── navigation/          # nav-config.ts, route-resolver.ts, permission-adapter.ts,
│   │   │                        # breadcrumb.tsx, page-header.tsx
│   │   ├── layout/              # sidebar.tsx, bottom-nav.tsx, mobile-more-sheet.tsx, app-chrome.tsx
│   │   ├── data-table/          # canonical-data-table.tsx, search-input.tsx, filter-bar.tsx,
│   │   │                        # bulk-bar.tsx, csv-import.tsx, stale-banner.tsx, conflict-dialog.tsx
│   │   ├── transactions/        # canonical-transactions-table.tsx (+ .sla.test.tsx, .refund.test.tsx),
│   │   │                        # refund-workflow.tsx, retry-button.tsx, create-transaction-dialog.tsx
│   │   ├── command-center/      # command-center.tsx, command-center-card.tsx, sla-badge.tsx
│   │   ├── command-palette.tsx  # cmdk-based, next/dynamic(ssr:false) at the mount
│   │   ├── timeline/            # canonical timeline renderer
│   │   └── ui/                  # shadcn/base-ui primitives
│   ├── hooks/
│   │   ├── use-polling.ts       # freshness backbone (20s/60s, 1s tick, hidden-tab pause)
│   │   └── use-conflict-resolution.ts
│   ├── lib/
│   │   ├── sla.ts               # SLA vocabulary (bands, policies, clock-injected evaluation, locale-safe fmt)
│   │   ├── command-center.ts    # CLIENT-SAFE lane vocabulary (shared seam — server imports it too)
│   │   ├── table-url-state.ts   # URL parser/serializer (all list params incl. sla, refundState)
│   │   ├── analytics-events.ts  # typed event catalog + PII allowlist/redaction (ONLY emittable surface)
│   │   ├── analytics.ts         # transport (no-op without key)
│   │   └── payout-status.ts     # client-safe payout status seam (pattern: server/data ↔ client)
│   ├── server/
│   │   ├── actions/             # "use server" mutations; ActionState<T> contract; every action
│   │   │                        # requireStrictOrgContext(perm) first
│   │   ├── data/                # stores + derivation: transactions, payouts, blocklist, webhooks,
│   │   │                        # kyc, timeline, handoff-store (ENGINE — no store imports),
│   │   │                        # handoff (derived view), command-center (aggregation), idempotency
│   │   ├── services/            # session-org-context (requireStrictOrgContext), org-context,
│   │   │                        # export-guard, test-persona (off/preview only)
│   │   ├── payment-flows/       # provider writes (durable op, step-up, audit; never mocked when connected)
│   │   └── mcp/                 # MCP surface (Prisma-backed; has its own debt — see register)
│   └── domain/
│       ├── organization/roles.ts    # 8 roles × 25 perms — single source of RBAC
│       └── security/step-up.ts      # dual-control policy + challenge binding
├── e2e/                         # ~224 tests / 30 specs; e2e/wave4/ = the six release gates
│   └── test-utils.ts            # loginAs(page, persona) — cookie harness
└── playwright.config.ts         # webServer = pnpm dev (AUTH_ENFORCED=off), workers:1, sandbox browser wiring
scripts/ensure-e2e-browser.mjs   # Chromium bootstrap for CDN-blocked sandboxes
.github/workflows/ci.yml         # typecheck → lint → test → build → prisma generate → playwright
```

**Data flow, one paragraph:** a page (server component) reads its state from URL search params via `table-url-state` + the data layer (`server/data/*`), server-renders it, and streams behind a same-dimension skeleton. Mutations are server actions: session → permission → (dual-control) → idempotency/version → mutate → `revalidatePath` every displaying screen → `ActionState` back to the client (success toast / field errors / conflict payload). The dashboard is special: it's a *poll* of the same derivation (`/api/dashboard/command-center`) so the age/banners are real.

**Client/server seam pattern:** `server/data/X.ts` is `server-only`; anything a client component needs at runtime (vocabulary, types, labels) lives in a `lib/` twin that **both sides import** (`lib/command-center.ts`, `lib/payout-status.ts`, `lib/sla.ts`). If you find yourself adding types to a server file that a client imports, you have the seam wrong.

## 2. Canonical components (use these; don't fork them)

| Need | Component | Notes |
|---|---|---|
| Any list | `CanonicalDataTable` (`data-table/canonical-data-table.tsx`) | controlled `sort/direction/page/pageSize/total/pageSize`, `selectedKeys`, `bulkActions`, `loading/error/empty/isFiltered`, `cardRenderer` for mobile. Legacy `transactions-table`/`batches-table`/`customers-table` are retained for routes not yet migrated — **do not add new consumers**. |
| List state in URL | `table-url-state.ts` | parse + serialize + `normalizeParams` (legacy aliases). New param ⇒ all five places: parse, serialize, server normalization, chip/FilterSheet, export mirror (+ test in `table-url-state.test.ts`). |
| Search | `SearchInput` (250 ms debounce, Esc clears, `q` in URL) | never raw-keystroke fetches. |
| Bulk | `BulkBar` + `CsvImport` | page-scoped selection; partial-failure summary; failed.csv. |
| Freshness | `usePolling` + `StaleBanner` | contract in `use-polling.test.tsx`; do not gate polling on motion preference. |
| 409 | `ConflictDialog` + `useConflictResolution` | never auto-apply; latest state is data, not copy. |
| SLA display | `SlaBadge` (from `lib/sla.ts` only) | text + icon + countdown; colour never the sole channel. |
| Dashboard cards | `CommandCenter`/`CommandCenterCard` | `canAct` comes from the server; render "waiting on …" when false. |
| Timeline | `components/timeline/*` over `server/data/timeline.ts` | single-event model; dedupe key includes `entityType`. |
| Empty/error/forbidden | `state-views.tsx` | three distinct empties + forbidden-with-next-step. |
| Dialogs | `ui/dialog` + focus trap | `role=dialog aria-modal`, Esc returns focus. |

## 3. Route resolver & navigation

- `nav-config.ts` — the IA: 5 grouped sections, per-item `requiresPermission`, icons, badges. Adding a nav item: config entry + permission decision + (if new route) resolver entry + e2e smoke.
- `route-resolver.ts` — canonical path ⇄ aliases ⇄ breadcrumb chain. **All 30 legacy routes resolve** (alias map is load-bearing; `proxy.alias.test.ts` + `route-resolver.test.ts` protect it). A new route must register here (breadcrumb + resolver) or it will 404 in-shell without suggestions.
- `permission-adapter.ts` — visibility gating by `hasPermission(role, perm)` (never by role name).
- Active state: `pathname.startsWith(href)` with the dashboard exact-match special case (the FE-015 fix — don't revert to `===`).
- The proxy rewrites keep old URLs alive at the edge (308-safe). Test both layers when touching routing.

## 4. Permission adapter & enforcement layers

1. **Edge:** `proxy.ts` — route protection (302/401), public API prefix list.
2. **Action:** `requireStrictOrgContext(perm)` in every server action — the real enforcement.
3. **Data:** per-resource guards (exports: `export-guard.ts`).
4. **UI:** `hasPermission` for visibility; disabled+reasoned controls for in-scope locked actions; `canAct` on Command Center cards.

The UI layer is *ergonomics*; layers 1–3 are *security*. A change that only adjusts layer 4 cannot claim a security property. Role matrix edits go through `roles.ts` + `roles.test.ts` (7/7) and need a business rationale in the PR.

## 5. URL-state utilities (the contract)

- **Parser** (`parseTableUrlState`): `page`, `pageSize` (10/25/50 whitelist), `q` (trim, ≤ 200), `sort`, `direction`, per-screen filters (`status`, `channel`, `range`, `batchStatus`, `batchSort`, **`sla`** (4 bands + ALL, case-insensitive), **`refundState`** (case-insensitive, fallback ALL)); legacy aliases normalized first (`search→q`, `page_size→pageSize`, `sortBy→sort`, `order→direction`); duplicate keys last-wins; malformed values fall back deterministically; **never throws**.
- **Serializer** (`serializeTableUrlState`): emits only non-defaults → URLs stay short and shareable.
- **Behavioral rules:** filter/search change ⇒ `page` deleted (resets to 1); `router.replace` with `scroll:false` for in-place updates; detail push ⇒ back restores (the URL is the state, not React).
- **Server mirror:** every param the client serializes must be normalized server-side (`normalizeSlaFilter`, `normalizeRefundStateFilter`, …) because URLs are also *inputs* (shared links, hand-typed). A param that only the client understands is a bug.

## 6. DataTable contract

```ts
type Column<T> = { id, header, accessor, sortable?, sortKey?, priority?, className? }
priority: 0 = always (mobile card must show) · 1 = tablet+ · 2 = desktop-only
```

- Controlled from the page: `rows`, `total`, `sort/direction`, `page/pageSize`, `selectedKeys` + `onSelectionChange`, `bulkActions`, `loading/error/empty/isFiltered`, `cardRenderer`.
- `isFiltered` flips the empty state from "no data" to "no rows match" (with Clear filters) — getting this wrong is a UX regression, not a style nit.
- Selection is **page-scoped** and the label says so; do not add "select all matching" without a spec change (the contract deliberately avoids the ambiguity).
- `aria-sort` on sortable `th`; `<caption sr-only>`; row key stable (`rowKey`); sticky header.
- Sorting/pagination hit the **server** (data layer sorts/filters before pagination) — the client never sorts the full dataset.

## 7. Analytics conventions

- **Only** `trackEvent(key, props)` from `lib/analytics-events.ts`. The key is typed (`AnalyticsEventKey`); unknown keys are a type error.
- Every event declares its **allowed props** (`EventSpec.props`). Unlisted props are stripped. On top of that: `DENY_KEYS` (email, names, phones, accounts, PAN, session, **raw query keys** `query`/`q`/`search`/`raw`/`body`/`payload`) are always dropped, value-shape redaction (email/PAN/ID-mobile/16-digit runs) applies to whatever survives, and strings > 120 chars are dropped.
- **Metric convention:** emit *measurable shapes*, not raw text — `query_length` + `result_count`, never the query (this is the documented deviation from spec ANA-010's raw `query` prop; the success metric is still measurable).
- Wave 4 operational events are the **runbook's signal layer** — their prop shapes are part of the ops contract (`permission_denied`, `sla_breached`, `conflict_recovered`, `stale_seen`, `journey_*`, `mutation_failed`, `command_center_action`). Changing a prop = updating `PRODUCTION_UX_RUNBOOK.md` in the same PR.
- The transport (`lib/analytics.ts`) is a no-op without a key — adding an event is safe in dev; adding a *vendor* is not (scope rule).

## 8. Test conventions

- **Unit/component:** vitest, co-located (`x.test.ts(x)` next to the module). Naming tells the behavior: `refund-lifecycle.test.ts`, `use-polling.test.tsx`, `command-center.test.ts` (server derivation) vs `.test.tsx` (component). The full suite must stay green (`pnpm --filter web test`); the one environment-blocked suite (`server/mcp/server.integration.test.ts`) is expected to be skipped in sandboxes (Prisma binary) and green in CI.
- **Determinism:** clock-injection everywhere (`evaluateSla(entity, anchor, { now })`, `openHandoff(input, now)`); stores have `__reset*` helpers; no `Date.now()` in tested paths without injection.
- **Security tests assert the server, not the UI:** a permission test must show the *action* refusing (the Wave 4 e2e gate drives a visible control through the server for exactly this reason).
- **E2E:** Playwright, personas via `loginAs` (off/preview only — `test-persona.test.ts` proves strict never reads the cookie), dynamic fixtures (`findTransaction` — the ledger is seeded but mutated), toasts as feedback (`expectToast`), `workers: 1` (shared in-memory ledger), 120 s budgets for cold compiles. The six `e2e/wave4/` specs are **release gates** — treat a change to them as a contract change (review + rationale).
- **When you change X, you run:** the co-located suite + the integration suites X touches (`table-url-state` for any URL param; `idempotency`/`conflict-resolution`/`refund-lifecycle` for money paths; `proxy`/`proxy.alias` for routing/auth) + `tsc --noEmit` + `eslint`.

## 9. Known debt (register: `KNOWN_DEBT_REGISTER.md`)

The ones that shape daily work:
- **D-01…D-04 verification debt** — Playwright gates, full E2E, performance budgets, full-route axe sweep: PENDING/NOT_RUN with procedures (QA handoff).
- **D-05…D-07 MCP security** — rate limiting (R1), call audit (R2), `timingSafeEqual` (R3): pre-existing, outside the UX scope, but they live in `src/server/mcp/` you may touch.
- **D-08 in-memory stores** — the seam for persistence; Prisma is only wired on MCP/audit paths. Server restarts reset state (dev/preview only).
- **D-09 SLA policies hardcoded** — `SLA_POLICIES` in `lib/sla.ts` is the one place; no admin UI.
- **D-10 analytics dashboards absent** — events exist; dashboards don't.
- **D-11 QuickPay drawer (SCR-038) unbuilt** — creation works via the existing dialog.
- **D-12 BE-006 invite-expiry cron unbuilt** — SLA nudge exists.
- **D-13 legacy tables retained** — intentional coexistence; migrate a screen only by pointing the page at `CanonicalDataTable` (customers is the reference migration, FE-012).
- **D-14 font network dependency** — `next/font/google` in `app/layout.tsx` is the network-sensitive build step (blocked in the sandboxes; CI is fine). A self-hosted/static font is the durable fix.
- **D-15 40 lint warnings** — pre-existing; new warnings are a review blocker.
- **D-16 root/`src` middleware indirection** — Next loads root `middleware.ts` only because `src/` exists… actually the opposite: with `src/` present, Next loads `src/middleware.ts`; the repo keeps **both** and the root file re-exports `./proxy`. Don't add logic to either — logic lives in `proxy.ts`.

## 10. Extension points (where growth is safe)

| Want to… | Do this (and this test) |
|---|---|
| Add a list screen to the canonical table | page + `CanonicalDataTable` + params in `table-url-state` (+ test) + resolver entry + e2e smoke |
| Add an SLA-eligible entity type | `SLA_POLICIES` entry + `SLA_ENTITY_TYPES` + anchor wiring + `sla.test.ts` case + (if user-visible) badge usage |
| Add a Command Center lane | `COMMAND_CENTER_LANES`/`LANE_META` in `lib/command-center.ts` (shared seam) + aggregation in `server/data/command-center.ts` (+ test, incl. the double-count rule) + card rendering |
| Add a handoff journey | `HANDOFF_JOURNEYS` + the store's `openHandoff` call site in the owning store + `deriveHandoffs` source (+ tests: `nextStepFor` never nothing; visibility vs authority) |
| Add an analytics event | `ANALYTICS_EVENTS` entry with allowlisted props (+ redaction test if the shape is new); update runbook signal map if ops-relevant |
| Add a permission | `PermissionSchema` + matrix entries (least privilege) + `roles.test.ts` + every new `requireStrictOrgContext` site + nav `requiresPermission` decision |
| Add a two-phase money action | follow `requestRefundAction`/`approveRefundAction` exactly: session actor, split permissions, distinct-approver check, handoff open/close, timeline event naming both actors, revalidate list, lifecycle test |
| Add a conflict-prone mutation | send `expectedUpdatedAt`, return `ActionState.conflict`, wire `ConflictDialog`, emit `conflict_recovered` |
| Add a nav item | `nav-config.ts` + resolver + permission + e2e |
| Add an export | new `api/exports/<resource>/route.ts` with `guardExport(request, <least-privilege perm>)` first line of data work (+ guard test) |

**Scope discipline (hard rules from the Wave 5 charter):** no new redesigns, no new components beyond what an extension point requires, no large refactors, no new frameworks, no new telemetry vendors. Documentation/evidence/test-helper changes are always in scope.

---

*If this document and the code disagree, the code + its tests win — then fix this document in the same PR (rule 8 of the Wave 5 charter: every safety invariant documented; every known debt visible).*
