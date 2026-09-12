# PR Review Guide — PayDash UX Redesign (Wave 0–4 code)

> **For:** code reviewers (eng, security, QA lead).
> **Goal:** a reviewer can verify — in one pass — that a change touching navigation, data tables, money actions, freshness, or analytics does not break a **safety invariant**, and knows exactly what to look for in the high-risk files.
> **Companion:** `PR_REVIEW_GUIDE.md` sits next to `UX_REDESIGN_FINAL_IMPLEMENTATION_REPORT.md` (what shipped) and `PRODUCTION_UX_RUNBOOK.md` (what to do when it misbehaves).

**Review posture for this codebase:** the UI is *secondary*. If a permission, dual-control, idempotency, or version check exists only in the UI, the PR is wrong by design — the server action is the enforcement point and must be reviewed as the primary artifact.

---

## 1. Critical invariants (break any of these = stop the review)

1. **Authorization comes from the authenticated session only.** No `role`, `permission`, or `actorId` is ever read from the browser, form data, or a client-set cookie in `strict` mode. The persona cookie (`paydash_persona`) is read only when `AUTH_ENFORCED` is `off`/`preview`.
2. **Money moves only through server actions** that: resolve the actor from the session → check the permission → (where required) apply dual-control → check idempotency/version → mutate. The order matters.
3. **A list view is fully described by its URL.** Any new filter/sort/search param must go through `lib/table-url-state.ts` (parse + serialize), survive refresh/back/share, and be normalized server-side (case, fallback, invalid values) — never stored only in React state.
4. **No mutation is applied on a stale version without explicit human review** of the latest state. No "auto-apply latest" paths.
5. **No PII leaves the client via analytics.** New events must be added to `ANALYTICS_EVENTS` with a declared prop allowlist; raw user text (queries, names, emails, account numbers) is never an allowed prop.
6. **Every cross-role handoff exposes a next step** — an action the actor can take, or a named escalation with a deep link. No dead ends.
7. **Stale data is always labeled; refresh failures are always surfaced.** A failed poll must not advance `lastUpdated` and must not be silently swallowed.
8. **`overdue` never double-counts** into `totals.exceptions` (it is a cross-cut lane; use `COUNTED_EXCEPTION_LANES`).
9. **Alias safety:** no legacy route may 404 or change meaning; the 30-item alias map and rewrites are load-bearing for bookmarks/shared URLs.
10. **Band semantics are single-sourced:** anything that says "overdue/approaching/critical" must derive from `lib/sla.ts` over a *backend* timestamp with an injected `now` — never `Date.now()` at render, never a second copy of the thresholds.

---

## 2. Files that matter (and what to look for in each)

### Security-sensitive (read top-to-bottom on any PR that touches them)

| File | What it does | Red flags |
|---|---|---|
| `apps/web/src/proxy.ts` (+ `src/middleware.ts` re-export) | Edge auth gate: `AUTH_ENFORCED` strict/preview/off, 302/401, public API prefixes, alias rewrites | default no longer `strict`; public prefix added without a guard reason; preview bypass reachable in strict; alias removed/changed without the resolver test suite passing |
| `src/server/services/session-org-context.ts` | `requireStrictOrgContext(perm)` — the workhorse | a code path that resolves the org context but skips the permission check; demo-fallback treated as authenticated in strict |
| `src/server/services/export-guard.ts` + `src/app/api/exports/*/route.ts` (11 routes) | per-resource export authorization | a route that streams before the guard; permission changed without the least-privilege rationale in the PR |
| `src/domain/organization/roles.ts` | 8 roles × 25 permissions, least privilege | permission added to a role beyond its minimum; role removed (check every `hasPermission` call site); `hasPermission` bypassed by a role-list check |
| `src/domain/security/step-up.ts` | dual-control policy + step-up challenge binding | threshold change (document business reason); binding fields removed from the digest (weakens proof); `used`/expiry checks relaxed |
| `src/server/services/test-persona.ts` + `e2e/test-utils.ts` | E2E persona harness | persona read path no longer gated on off/preview; persona granted a role outside spec §3; strict-mode assertion (`test-persona.test.ts`) deleted |

### Money movement

| File | What it does | Red flags |
|---|---|---|
| `src/server/actions/transactions.ts` | create / retry / **two-phase refund** (`requestRefundAction`, `approveRefundAction`, `rejectRefundAction`) + single-step `refundTransactionAction` | actor taken from form (`approverId` as the *approver's identity*); `isApproverDistinct` skipped for any branch; provider path returning success when the provider failed; refund exceeding `amount - refundedAmount`; revalidate list missing after a state change |
| `src/server/actions/payouts.ts` | batch create/approve/cancel/retry (9 guarded actions) | a new payout mutation without `requireStrictOrgContext`; bulk loop that silently drops per-row failures (must return per-row results) |
| `src/server/data/transactions.ts`, `src/server/data/payouts.ts` | ledger/batch stores: idempotency + version checks + `normalizeSlaFilter`/`normalizeRefundStateFilter` | version check removed or made optional; idempotency key input changed (collision/loss risk); filter normalization that accepts a malformed band as data |
| `src/server/data/idempotency.ts` | key = hash(orgId+type+entityId+payloadHash); same+same→replay, same+different→409 | payload hash over non-canonical fields; a code path that mutates on a key collision instead of 409 |
| `src/server/payment-flows/*` (provider writes) | provider refund/create with durable op + step-up + audit | "connected-but-failing provider" being swallowed (must propagate — never mock); audit fields dropped |

### Cross-role / aggregation (can misreport, not just misauthorize)

| File | What it does | Red flags |
|---|---|---|
| `src/server/data/handoff-store.ts` | handoff engine (no store imports) | store import added (cycle); `nextStepFor` gaining a third return case; `toRoles` becoming individual users; entity labels carrying customer names |
| `src/server/data/handoff.ts` | derived view over real stores | derived counts that can disagree with the stores (must re-derive, not cache stale); SLA anchor not a backend timestamp |
| `src/server/data/command-center.ts` | 6-lane aggregation, server `canAct` | `canAct` computed client-side; `overdue` summed into `exceptions`; sample labels with PII; a lane whose `href` doesn't carry the filter that reproduces its count |
| `src/lib/command-center.ts` | client-safe lane vocabulary (shared seam) | lane list diverging from the server aggregator (both must import this file) |
| `src/lib/sla.ts` | bands, policies, evaluation, formatter | `Date.now()` default leaking into a server aggregate; locale formatter reintroduced (hydration drift); policy change without test + doc update |
| `src/lib/analytics-events.ts` | typed catalog + PII allowlist | an event added by calling `track()` directly (bypasses the catalog); allowlist widened to raw text; DENY_KEYS trimmed |

### UX state & freshness

| File | What it does | Red flags |
|---|---|---|
| `src/lib/table-url-state.ts` | URL parser/serializer (incl. `sla`, `refundState`, legacy aliases) | new param added to one screen only (must be in parse+serialize+normalization+chips+export mirror); malformed input crashing; page param not reset on filter change |
| `src/components/data-table/canonical-data-table.tsx` | the one table | selection scope drifting from "page scope"; `aria-sort` desync; card renderer dropping the status; a second table implementation appearing (extend canonical instead) |
| `src/hooks/use-polling.ts` | 20 s poll / 60 s stale / 1 s tick | polling gated on reduced-motion again; `lastUpdated` advanced on failure; double `start()` race reintroduced; fetch on every tick |
| `src/components/data-table/stale-banner.tsx`, `conflict-dialog.tsx` | stale + 409 UX | conflict dialog auto-applying; banner hiding the age |
| `src/components/transactions/canonical-transactions-table.tsx` (+ `.sla.test.tsx`, `.refund.test.tsx`, `refund-workflow.tsx`, `retry-button.tsx`) | ledger wiring: SLA badge/filter/sort, refund UI, versioned retry | `expectedUpdatedAt` not sent; refund trigger reachable for a permissionless viewer (the exact bug `0592154` caught); SLA band rendered from a non-`sla.ts` source |
| `src/components/command-center/*`, `src/components/command-palette.tsx` | dashboard + ⌘K | palette exposing a destructive/money action (safe-only rule); card CTA shown when `canAct` is false |
| `src/app/[locale]/dashboard/page.tsx` + `src/app/api/dashboard/command-center/route.ts` | dashboard SSR + polling endpoint | endpoint losing `no-store` / per-poll session check; roles not from the session |
| `src/components/navigation/*` (`nav-config`, `route-resolver`, `permission-adapter`) | grouped IA | item added without `requiresPermission` review; resolver alias dropped; visibility gating by role-name instead of permission |

---

## 3. Money-movement rules (the checklist that prevents the bad incidents)

For any PR touching refund/payout/retry/create paths, verify **all** of:

1. The action resolves the actor via `requireStrictOrgContext(perm)` (or equivalent) — the actor is `ctx.userId`, not a form field.
2. The permission matches the spec's split: `refund.prepare` ≠ `refund.execute`; payout `create` ≠ `release` ≠ `retry` ≠ `cancel`; `money_in.create` for payment create/retry.
3. Dual-control where required: refund ≥ IDR 10 M or ≥ 50 % of original → distinct approver (`isApproverDistinct`), approver identity from *their* session; payout ≥ 25 M/recipient or 100 M/batch.
4. Amount bounds: refund ≤ `amount - refundedAmount`; amount > 0; 5 B per-transaction cap.
5. Idempotency: the mutation key is stable across retries of the *same* logical action; a different payload with the same key yields 409, not a second mutation.
6. Concurrency: the mutation checks the version/`updatedAt` the client sent; mismatch → conflict payload (never a blind write).
7. State machine: request → (awaiting) → approve/reject is the only path for dual-control refunds; no money on request; FAILED payments cannot be refunded (retry instead).
8. Provider path: a connected provider is authoritative; a failing connected provider surfaces the error (never falls back to the in-memory ledger); no provider → in-memory fallback is acceptable in TEST mode.
9. Audit/timeline: the terminal state records actor(s), action, from→to, timestamp, reason; dual-control events name both actors.
10. `revalidatePath` covers every screen that displays the changed state (list, detail, dashboard).
11. Tests: the PR includes the suite for its path (refund-lifecycle / idempotency / conflict-resolution / org-context) and does not weaken an existing assertion.

---

## 4. Permission model quick reference

- 8 org roles: OWNER, FINANCE_ADMIN, FINANCE_OPERATOR, DEVELOPER, ANALYST, COMPLIANCE_ANALYST, RISK_ANALYST, SUPPORT. 25 permissions, least privilege (`roles.ts` is the single source).
- Money-out split: FINANCE_OPERATOR creates/prepares; FINANCE_ADMIN/OWNER release/execute. SUPPORT can `refund.prepare` (requests), cannot `refund.execute`.
- UI rule: show locked controls with a **reason** (and who can help) instead of removing them, unless the spec says hide (nav items are hidden by permission; row actions are disabled+explained).
- Server rule: every mutation re-checks regardless of UI. A test that only asserts "button is hidden" is insufficient — the Wave 4 permission gate drives the *visible* control through the server.
- The Command Center computes `canAct` server-side per viewer; `null` permission lanes are informational (per-item authority resolved on the target screen).

## 5. Conflict handling & polling (what "correct" looks like)

- **409:** client sends `expectedUpdatedAt` → server mismatch → `ActionState.conflict { description, currentState, detectedAt }` → dialog shows **latest** state → explicit *Retry with Latest* (versioned) or dismiss (sync) → `conflict_recovered` with `version_delta`. Anything that skips the review step is a defect.
- **Polling:** 20 s interval, visible-tab only, one in-flight refresh at a time, age ticks 1 s without fetch, >60 s → stale banner, failed refresh → error state + age keeps growing (honesty), endpoint `no-store` + per-poll auth re-check.

## 6. Expected E2E behavior (what the six Wave 4 gates assert — `apps/web/e2e/wave4/`)

1. **refund-handoff:** Role A (SUPPORT) request → toast → `AWAITING_APPROVAL` + queue row with chip → Role B (FINANCE_ADMIN) approve → success toast → APPROVED pill → timeline: "requested by persona_agus … approved by persona_hendri · dual control satisfied".
2. **sla-filter-back-restore:** `?sla=OVERDUE` → chip + overdue rows → open detail → **back** → same URL + chip + rows; hard reload same slice.
3. **permissions:** ANALYST clicks a *visible* retry control → server denial toast (backend is the enforcement point); refund trigger `aria-disabled` with "Requires refund permission" and no reachable dialog.
4. **freshness-stale:** "Updated Ns ago" ticks without fetch; Refresh resets to ~0; waiting past 60 s raises the banner; banner Refresh clears it.
5. **conflict-recovery:** two tabs, same FAILED payment; A retries (success, `updatedAt` moves); B retries → refused → ConflictDialog shows PROCESSING (the latest, not the stale FAILED); B clicks *Retry with Latest* → succeeds; exactly one refused call; `conflict_recovered` emitted.
6. **mobile-journey (390×844):** cards with SLA badges → filter sheet → SLA select → chip on URL → detail → back restores the filtered view.

**Environment contract:** personas via cookie (off/preview only); dynamic fixture selection (`helpers.ts::findTransaction`); toasts are the action feedback (`[data-sonner-toast]`); `workers: 1` because the gates mutate the shared in-memory ledger; warm the routes first on cold machines (procedure in `WAVE_4_E2E_TEST_PLAN.md`).

## 7. Review checklist (use per PR)

**Scope & discipline**
- [ ] Change is minimum-scope; no drive-by refactors, no new frameworks/vendors, no new components outside the spec.
- [ ] Legacy routes/aliases untouched or intentionally updated (resolver tests pass).
- [ ] No `console.log` of sensitive data; no secrets in logs.

**Security (if any touched file is in §2 "security-sensitive")**
- [ ] Invariants 1–10 checked above; enforcement is server-side.
- [ ] No new client-trusted input reaching authorization, amounts, or actor identity.
- [ ] Export/mutation endpoints still guard before any data leaves.
- [ ] Persona harness gating intact (strict never reads it).

**Money (if money path touched)**
- [ ] §3 money-movement rules 1–11 all checked.
- [ ] Tests for the touched path green and not weakened.

**Data/UX state**
- [ ] New/changed list params: parse + serialize + server normalization + chip + export mirror + test (`table-url-state`).
- [ ] Empty/error/loading states distinct and present (no-data vs no-results vs filtered-empty).
- [ ] Mobile card variant updated if a column/priority changed.
- [ ] SLA/band vocabulary only via `lib/sla.ts`.

**Freshness/aggregation**
- [ ] Polling contract intact (interval/tick/pause/failure).
- [ ] Aggregations re-derive from the same stores as the lists; `overdue` not double-counted.
- [ ] No PII in lane samples/events.

**Accessibility**
- [ ] New interactive elements: focus-visible, labelled, 44 px, live region where state changes, dialog semantics where modal.
- [ ] Status conveyed with text (never colour-only).
- [ ] Reduced-motion respected for animation (never for data).

**Tests & evidence**
- [ ] Unit/component tests for the change (name the file in the PR).
- [ ] If behavior is browser-observable: an e2e spec exists or is explicitly listed as PENDING with the procedure.
- [ ] `tsc --noEmit` clean; `eslint` clean (no new warnings); full `vitest run` green.

**Documentation**
- [ ] If a contract changed: `DEVELOPER_HANDOFF_WAVE_5.md` / `IMPLEMENTATION_PROGRESS.md` / runbook updated in the same PR.
- [ ] If a known limitation changed: `KNOWN_DEBT_REGISTER.md` updated.

---

*Keep this guide current: when an invariant is broken (and fixed), add the incident to its section — the guide is the reviewer's map, not a museum.*
