# 0026 — Audit log: the event history the app actually owns

Date: 2026-09-02
Status: Accepted

## Context

`/audit` ("Detailed Audit Log") was a pure mockup whose rows contradicted the
world the app runs in:

1. **Five hard-coded rows, all dated 2023-10-24** — October *2023*, in a
   world seeded around Sep 2026.
2. **Off-world actors and identifiers** — `alice.jones@org.com`,
   `bob.smith@org.com`, `system@ledger.io`, `e.klein@vendor.co` (the world's
   domain is `@acmecorp.com`), and `key_prod_892f...`, `batch_77x21`,
   `txn_9942a`, `wh_endpoint_2`, `session_b44` — none of which matches any
   store (the real keys are `key_live_main` / `key_live_mobile` /
   `key_test_sandbox`; the real batches are `BATCH-2026-08-0xx`).
3. **Invented scale** — "Showing 1-5 of **12,042** events / Page 1 of
   **2409**" (12,042 ÷ 5 ≠ 2,409 — the math doesn't hold).
4. **Two columns no store can fill** — **User** and **IP Address**. The
   ledger has no user or IP field (established in ADR-0024), the webhook log
   has no requester IP, and the app has no auth-session store. INTEGRATION.md:111
   grounds the screen in `getAllTransactions()` + webhook events (§7) —
   neither of which carries a user or an IP.
5. **Every control inert** — search, the date range select (with a
   "Custom Range..." that has no implementation), the category select, the
   status checkboxes (all uncontrolled), a dead **Export CSV**, and a ⌘K hint
   with no keyboard handler. No `metadata`.

## Decision

The audit log is **derived, not seeded** — `server/data/audit.ts` owns no
facts (the ADR-0025 onboarding pattern). `getAuditEvents()` unifies the
timestamped events the existing stores already hold;
`listAuditEvents({q, category, status, range, page})` filters and paginates
them (10/page, newest first, over-range pages clamp); `auditSummary()` and
`auditEventsToCsv()` back the count and the export. Client-safe vocabulary
lives in `lib/audit-options.ts`.

| Category | Derived from | Seeded count |
|---|---|---|
| PAYMENTS | the 46 ledger transactions' `events` timelines (created / authorized / captured / declined / awaiting / refunded; detail carries the amount) | 140 |
| PAYOUTS | the 5 batches' `timeline` (actor = the batch's real `source`: CSV upload / Manual / API) | 10 |
| WEBHOOKS | the 7 inbound callback-log events (received / deduplicated / rejected, with the real reason) | 7 |
| CONFIGURATION | 3 API-key creations, 10 blocklist additions, the deployed velocity ruleset, 5 team joins + 1 team invite | 20 |
| **Total** | | **177** |

**Honest columns.** Timestamp · Category · Action & Resource · Detail ·
Status. The **User and IP columns are dropped** — no store holds them, and
the page says so in its subline. Status is mapped from the stores' own
`kind`: success→Success, error→Failed, warning→Warning, info→Info; a
**rejected callback is a Warning, not a Failure** — it is the endpoint doing
its job (the idempotency/rejection paths of ADR-0014).

**Real controls.** The filter bar is URL state (`q` over action/resource/
detail, `category`, `status`, `range` 24h/7d/30d/90d/all — "Custom Range..."
dropped) with a live "N events" count, Clear-filters, and a **wired ⌘K**
(focuses search). **Export** is a real `/api/exports/audit` CSV that feeds
the URL filters into the store's single filter implementation (what you see
is what you export, paging through when a filter matches > 100). Real
`TablePagination` ("1 to 10 of 177" — the 12,042 and the 2409 are gone), a
filter-aware `EmptyState`, `metadata`, tokens only.

**Dropped:** the five 2023-10-24 rows, the off-world emails, the invented
ids, "12,042" / "2409", the User + IP columns, "Custom Range...", all
uncontrolled filters, the dead export, the unbacked ⌘K.

## Consequences

- The log can never disagree with the world: add a blocklist entry, create a
  key, or accept an invite and the next render shows the event (the
  live-read path is unit-tested). The count is the true count — 177 in the
  seeded world — not an invented 12,042.
- The columns state only what a store can prove. A declined authorization
  carries the real issuer code from the ledger ("Issuer responded 51 —
  insufficient funds"), not a tooltip invention.
- The one honest gap is said out loud on the page (no user/IP column)
  rather than papered over with `@org.com` literals.
- Tests: `audit.test.ts` (8), `e2e/audit.spec.ts` (5 serial), UAT F2
  rewritten (it was red — it asserted a "Footer"/"Main" tab and `log_001`
  the page never had).
