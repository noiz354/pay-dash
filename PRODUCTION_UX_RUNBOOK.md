# Production UX Runbook — PayDash Kinetic Ledger (post Wave 0–4)

> **Audience:** on-call engineer, SRE, tech support lead.
> **Companion docs:** `PRODUCTION_UX_RUNBOOK.md` answers "what do I do when…" — for "what shipped and why" see `UX_REDESIGN_FINAL_IMPLEMENTATION_REPORT.md`; for "what to verify in code" see `PR_REVIEW_GUIDE.md`.
> **Signal sources:** analytics catalog (`lib/analytics-events.ts`) — `permission_denied`, `error_shown`, `stale_seen`, `stale_refreshed`, `conflict_recovered`, `sla_breached`, `mutation_failed`, `journey_started/completed`, `command_center_action` — plus app logs (pino), provider webhooks, and user reports.
> **Environment facts that shape every case:** auth is fail-closed (`AUTH_ENFORCED=strict` default) · data stores are in-memory in TEST mode (dev/preview) with Prisma on the MCP/audit paths · polling is 20 s with a 60 s stale threshold · the E2E persona cookie is **never** a production signal (it is not read in strict mode).

**General first three moves (every case):**
1. Timestamp the first signal (correlate with deploys: `git log` on the release tag).
2. Check whether it is one org/user or global (the events carry `role`/`scr`/`surface` — never PII).
3. Decide: degrade loudly (keep the app usable, label the problem) or block the risky path (money movement). **Never** silently accept stale or conflicting money state.

---

## Case 1 — Auth failure (users locked out / sign-in loops)

**Signal:** spike of `auth_started` without `auth_completed` (or 401s on `/api/*`); user reports "keeps redirecting to sign-in"; 302 loops in access logs.
**Impact:** P0 — nobody can operate; if partial (one role), money journeys stall while others continue.
**How to verify:**
- `curl -i http://host/en/dashboard` with no session → expect **302 → /sign-in** (correct fail-closed behavior — not itself an incident).
- With a valid session cookie → expect 200. If 401 with a valid session: Better Auth token issue (expiry, secret rotation, clock skew) or `AUTH_ENFORCED` mode mismatch between edge and app.
- Check `AUTH_ENFORCED` in the deployment env: must be `strict` in production. If someone set it to `off` "to fix it" — that is a security incident, not a fix.
- Check the proxy matcher coverage: a newly added protected prefix not in `PROTECTED_PREFIXES`/matcher would fail *open* — compare `proxy.ts` against the route list.
**Immediate action:**
- One user/org: verify their role/membership exists in the org (a demoted user is a *permission* problem → Case 2, not this one).
- Global: roll the app back to the last known-good release; verify `AUTH_ENFORCED=strict` is restored on re-deploy; check Better Auth secret/env unchanged.
- Do **not** open `AUTH_ENFORCED=off` in production. `preview` + `x-preview-bypass` is for demo environments only.
**Rollback:** revert to previous release image (auth logic lives in `proxy.ts` + server actions; no data migration involved). If the trigger is an env change, restore the env.
**Escalation:** security lead + platform owner. Any confirmed open-fail state (protected route serving data to an unauthenticated request) is a **security incident**: isolate, preserve logs, notify per policy.

---

## Case 2 — Permission denial spike

**Signal:** `permission_denied` rate above baseline (props: `permission`, `role`, `surface`, `scr`); support tickets "I used to be able to do X".
**Impact:** P1 — a workflow is blocked for a role; low urgency only if it's one confused user.
**How to verify:**
- Group the event by `(permission, role, surface)`. A single pair = targeted (role mismatch, new screen, or an attempt); a broad spike = regression (permission matrix or context resolution changed).
- Open the same screen as the affected role: the UI must show the locked control **with its reason** (this is by design — denials through the real UI are expected behavior for permissionless actors).
- Check `roles.ts` for a recent matrix change; check `requireStrictOrgContext` call sites for a new permission on an existing action (the action is correct; the role grant is what's missing).
**Immediate action:**
- Single user: confirm their role; if the role changed, that is the intended behavior — explain who can act (the UI copy already says).
- Role-wide regression: revert the last permission-related commit/release (matrix or action change); grants are data, not code — fix by correcting the membership, not by weakening the check.
**Rollback:** revert the matrix/action change (file-scoped). Never "fix" by granting the permission broadly — least privilege is the invariant.
**Escalation:** if the denial pattern looks like probing (many permissions, many users, same source) → security lead. If a money journey (payout release, refund approve) is blocked for the whole approver role → finance lead, because payroll/refunds age into SLA breach (watch Case 10).

---

## Case 3 — Stale dashboard (users operating on old data)

**Signal:** `stale_seen` (age_sec) rising; `stale_refreshed` flat (nobody is clicking); user reports "numbers don't update"; dashboard shows an age > 60 s banner to many users.
**Impact:** P1 — decisions on old financial data; the banner means the *UI is honest*, the problem is upstream (polling or server).
**How to verify:**
- Is it all users or one network/edge? The polling endpoint is `GET /api/dashboard/command-center` (`no-store`, per-poll auth re-check). Check its 5xx rate and latency.
- Check the app server: memory pressure (in-memory stores), CPU, and whether `next-server` restarts are happening (a restart resets the in-memory ledger — a *different* data-loss shape, see Case 13 in `KNOWN_DEBT_REGISTER.md` notes).
- Check the browser side is plausible: polling pauses on hidden tabs — a "stale dashboard" on a backgrounded tab is correct behavior, not an incident.
**Immediate action:**
- If the endpoint is unhealthy: restart/scale the app server; the next 20 s poll self-heals — verify the banner clears via the age readout.
- If one user's network: advise the manual Refresh (banner button); no client reset needed.
- While degraded, remind (via comms channel) that the ledger detail pages are the authoritative view; do not let anyone approve from a screen showing a stale banner — the UI allows it, the *policy* should not.
**Rollback:** if a deploy introduced the stall, revert the release. No data rollback (nothing is mutated by polling).
**Escalation:** platform owner if the endpoint stays degraded > 30 min; finance lead if a dual-control queue is invisible to the approver role during the window (they may be sitting on time-sensitive approvals).

---

## Case 4 — Polling failure (refresh errors, silent drift)

**Signal:** `error_shown` with the polling surface; `usePolling` exposes the error state (the UI shows it — if the UI is *not* showing any error while data is not updating, that is a regression: failures must surface).
**Impact:** P2 alone; P1 if combined with Case 3 (users lose the staleness cue).
**How to verify:**
- Reproduce: open the dashboard as an affected role; watch the freshness line. A failed refresh must keep the age growing and show the error — `lastUpdated` must NOT advance.
- Check the endpoint auth re-check: a token expiring mid-session produces a 401 on the next tick → the user sees an error, not a silent stale card (by design).
- Verify the failure is not a client loop (in-flight guard): network tab shows at most one poll in flight, ~20 s cadence, no accumulation.
**Immediate action:**
- Auth-expiry shape: the user signs in again; nothing to fix server-side.
- 5xx shape: treat as Case 3 upstream.
- Client-loop shape (if ever observed): roll back the `use-polling` change (single file, file-scoped revert).
**Rollback:** revert `src/hooks/use-polling.ts` to the previous version (banner simply stops updating; no data corruption).
**Escalation:** platform owner for endpoint health; eng lead if the "failure must surface" invariant is broken (a hidden failure changes the honesty contract of the whole freshness system).

---

## Case 5 — Payout/refund conflict (two actors, one row)

**Signal:** `conflict_recovered` events (props: `entity_type`, `resolution`, `version_delta`); user reports "it said the data changed"; repeated 409s on the same batch/transaction.
**Impact:** P2 normally (the system is doing its job — refusing the blind write). P1 if conflicts cluster: someone/something is editing in a loop, or a version field is stuck.
**How to verify:**
- Read the ConflictDialog payload in the report: it shows the *latest* state (e.g. status now PROCESSING). Confirm the latest state is legitimate (the other actor's action) — the audit/timeline names them.
- Check `version_delta`: small deltas = normal two-actor activity; large or repeated deltas on one row = a loop (an automation retrying, or two tabs both "winning").
- For refunds specifically: confirm the dual-control state — an "approve" conflict usually means the refund already moved (approve already happened) or was rejected.
**Immediate action:**
- Nothing to "fix" for a normal conflict: the operator reviews the latest state and either retries the versioned action or dismisses (sync). That is the designed recovery.
- For a loop: identify the actor/tab and stop it; the idempotency key means a genuine duplicate request is a no-op replay, so stopping it is safe.
- Verify the money state directly (ledger detail + audit) before anyone re-submits: **the row's current state is the truth, the dialog is its evidence.**
**Rollback:** none for the data (no mutation was applied on conflict). If the conflict machinery itself regressed (blind writes appearing), revert the version-check change in the data layer — but that is a P0 security regression, escalate immediately.
**Escalation:** finance lead for any refund/payout where the "latest state" is surprising (money in an unexpected place); security lead if the latest-state evidence is missing from the audit trail.

---

## Case 6 — Idempotency conflict (same key, different payload → 409)

**Signal:** 409s with the idempotency-conflict shape (not a version conflict); `mutation_failed` with `reason` indicating key mismatch; user "retried" and got an error.
**Impact:** P2 — a mutation was *not* applied; the question is whether the first request did apply.
**How to verify:**
- Find the idempotency key's first use (orgId + type + entityId + payload hash): was it accepted (same payload)? If yes → this is a *replay*, not a conflict — tell the user the action already happened; nothing to redo.
- If the key was accepted with a *different* payload → the 409 is correct: two different logical actions reused one key (a client bug or a hand-edited request).
- Never "clear" an idempotency key to make the mutation go through — that is how a double mutation is born.
**Immediate action:**
- Replay shape: confirm the original result is visible (status/audit); close the ticket.
- Mismatch shape: identify the second action's intent; the user re-sends it as a fresh action (new logical action → new key).
- Client bug shape (same UI flow generating different payloads under one key): eng fix; until then, the 409 is the safety net working.
**Rollback:** none (no mutation applied on conflict). If the key scheme changed in a release and mismatches spiked, revert that release.
**Escalation:** eng lead (client bug); security lead if the mismatch pattern looks deliberate (someone retrying with altered amounts under a captured key).

---

## Case 7 — Webhook replay (duplicate inbound deliveries)

**Signal:** DUP badges on the webhook detail; `DUPLICATED` deliveries; user reports "the event ran twice" or a derived ledger row that looks duplicated.
**Impact:** P2 — the dedupe is by design the absorber; the incident is only if a *derived* effect (ledger row, balance) double-applied.
**How to verify:**
- On the webhook detail: each duplicate links the original (provenance: original vs retry vs replay). Confirm the duplicate was *rejected* (status DUPLICATED/REJECTED), not processed.
- Replay (manual, from the UI) requires `webhook.replay` + `provider.connect.test` — check the audit: who replayed, from where, when. A replay without the permission recorded is a P0.
- Check the downstream: the payment-flow operation store is idempotent per provider event — a truly duplicated *effect* would require the idempotency layer to have been bypassed.
**Immediate action:**
- Dedupe working: no action beyond monitoring; the badge is the expected UI.
- Dedupe bypassed / double effect: stop further deliveries to the affected endpoint (disable or rotate), reconstruct the correct state from the provider's authoritative record, and reconcile the ledger.
- Unexplained replay: rotate the endpoint secret and re-scan the audit for the actor.
**Rollback:** re-enable/rotate the endpoint to restore flow. Data fix-forward (reconcile) — never delete audit entries.
**Escalation:** security lead for unauthorized replay; provider support for a malformed delivery burst (rate-limit the endpoint rather than disabling it if the source is provider-side).

---

## Case 8 — Failed bulk operation (payout batch partial failure)

**Signal:** batch status PARTIAL/FAILED; `mutation_failed` (bulk); the bulk bar's partial-failure toast ("7 approved, 3 failed: reasons"); `sla_breached` starting to fire for `failed_payout` (2 h commitment).
**Impact:** P1 if payroll-sized; the partial results are *already correct* — the incident is the unprocessed remainder and the clock.
**How to verify:**
- Batch detail: per-recipient status + reason (FAILED/RETURNED rows). The failed set is the retry set — no re-upload needed.
- Check the reasons' shape: bank-side (closed account, wrong account number) = data problem, retry after correction; provider-side (timeout, 5xx) = provider health, retry as-is after provider recovers.
- Confirm the reserved funds accounting: reserved → settled moved only for the paid recipients.
**Immediate action:**
- Retry the failed recipients (per-recipient retry exists — no batch re-approval of paid rows; the action is idempotent per recipient).
- Data-shape failures: fix the source data (correct account numbers) and retry; do not force-retry bank rejections.
- Provider-shape: check provider status page; hold retry loops to the 2 h SLA window with a human between attempts.
**Rollback:** none for paid rows (irreversible by nature — which is why dual control gates the release). For a batch released in error (wrong recipients), the recovery is the *return/refund* journey, not a rollback — escalate to finance immediately.
**Escalation:** finance lead for any batch where "paid" rows look wrong; provider support for provider-side failure clusters; risk lead if the failures correlate with new fraud signals (check the blocklist lane).

---

## Case 9 — Failed CSV import (bulk payout / blocklist ramp)

**Signal:** `csv_import_*` events with failed counts; the `failed.csv` download is the user's artifact; user reports "my upload broke".
**Impact:** P2 — by design nothing invalid reaches the backend (client validation + server re-parse is authoritative).
**How to verify:**
- The UI keeps the invalid rows visible with line number + raw + reason *before* submit; after submit, the summary shows Total/Succeeded/Failed and offers `failed.csv` (header `line,raw,reason`).
- Open the `failed.csv` with the user: every row must have a human-actionable reason (bad amount syntax, duplicate account in file, missing field, size/header violations).
- If a row *looks valid* but was rejected: that is a validator bug (or the server re-parse found what the client missed — the server is authoritative). Reproduce with the exact row.
**Immediate action:**
- Guide the user: fix the failed rows, re-upload only the failed set ("Retry failed rows" path) — valid rows are not reprocessed.
- Validator bug: ship the fix; until then, manual per-row check for that file.
- Blocklist CSV: duplicates against the *existing* blocklist are rejected with reason — that is governance, not failure; the audit records actor + reason.
**Rollback:** none — an import that validated partially is already applied row-by-row with per-row results; undo is per-row removal (blocklist) or a new corrective batch (payouts).
**Escalation:** eng lead for validator regressions (the failed.csv reasons are the test corpus); risk lead for blocklist files that look like data exfiltration attempts (mass reads of the blocklist are an export-guarded surface).

---

## Case 10 — SLA overdue spike

**Signal:** `sla_breached` rate up (props: `entity_type`, `band`, `age_sec`); Command Center `overdue`/`critical` lanes filling; a page banner showing CRITICAL as the worst band.
**Impact:** P1 — this is the business telling you money or compliance is aging. The dashboard is *working* (it's now loud instead of quiet); the incident is the work behind the signal.
**How to verify:**
- Split by `entity_type`: `payout_batch` (4 h), `refund` (8 h), `failed_payout` (2 h), `failed_payment` (4 h), `blocked_payment` (4 h), `kyc_submission` (24 h), `webhook_delivery` (24 h), `team_invite` (5 d), `transaction_settlement` (4 h).
- Split by lane: is it `pending_approval` (a *person* is absent — the second actor hasn't acted) or `failed` (a *process* is stuck — retry needed)?
- Cross-check with `journey_completed` rate: is completion also down (capacity) or just the breaches up (backlog arriving in a batch)?
**Immediate action:**
- `pending_approval` shape: find the absent approver role (FINANCE_ADMIN/OWNER for refunds; FINANCE_ADMIN for payout release) — page them; the deep link into their queue is on the card (`/en/transactions?refundState=AWAITING_APPROVAL`, `/payouts?status=…`).
- `failed` shape: work the retry queue (Case 8/5); failed-payout's 2 h window is the tightest — it goes CRITICAL at 10 h.
- Batch-arrival shape (a big import/CSV just landed): this is expected queueing — triage by severity (urgent-first sort is built in); do not "fix" the SLA clock.
**Rollback:** none — SLA state is derived from real timestamps; there is nothing to roll back. If the *policy* was mis-deployed (e.g. a 4 h commitment that should be 4 d), revert the one-line `SLA_POLICIES` change and re-derive (bands recompute; no data change).
**Escalation:** finance lead for money-out aging; compliance lead for KYC aging; if the spike correlates with a Case 2 permission spike, the two are one incident (approvers can't act).

---

## Appendix — signal → case map

| Signal (event / log) | First suspect |
|---|---|
| `auth_started` ≫ `auth_completed`; 302 loops; 401 with valid session | Case 1 |
| `permission_denied` spike (group by permission × role × surface) | Case 2 |
| `stale_seen` age ↑, `stale_refreshed` flat | Case 3 |
| polling `error_shown`; age growing with error visible | Case 4 |
| `conflict_recovered` (version_delta) | Case 5 |
| idempotency 409 (key mismatch) | Case 6 |
| webhook DUP/REJECTED; unexplained replay | Case 7 |
| batch PARTIAL/FAILED; `mutation_failed` bulk | Case 8 |
| `csv_import_*` failed counts; failed.csv questions | Case 9 |
| `sla_breached` rate; CRITICAL banner | Case 10 |
| `journey_started` ≫ `journey_completed` (a journey stuck mid-handoff) | Case 10 (pending_approval shape) |
| `command_center_action` flat while lanes are full | usability/access issue → QA + eng (not an incident by itself) |

**Reminder:** the E2E persona cookie (`paydash_persona`) is read **only** when `AUTH_ENFORCED` is off/preview. Its appearance in any production signal means the deployment is not strict — that is Case 1 territory and a security incident, not a test artifact.
