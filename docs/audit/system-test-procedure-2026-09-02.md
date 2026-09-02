# System status — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at
`http://localhost:3000/en/system`.

## A. The invented layer is gone

1. No "99.99%" / "42ms" / "Core API Uptime" / "Ledger DB Status" /
   "15% capacity", no "Webhook Queue Depth" card, no "Webhook Delivery
   Traffic" chart, no "Recent Webhook Deliveries" table, no
   `api.merchant.com` / `hooks.erp-system.net` / `hooks.legacy-app.io`
   anywhere, no green "All Systems Operational" badge.
2. No "Monitoring Settings" panel: no sliders, no `ops-alerts@kinetic.local`
   / `#alerts-critical` / "SMS — premium tier", no **Save Settings** and no
   **Test Alert** buttons (the old Save ran `e.preventDefault()` — nothing
   persisted).
3. The "Pro Tip" card and its "Go to Developer Portal" link are gone.
4. DevTools: the page contains **zero** `href="#"` anchors.

## B. What the page states instead

5. Header chip: **Last callback 2h ago** (the newest log row — the seed
   duplicate, 1h59m old, rounds to 2h).
6. Three "in the last 24h" cards with real counts from the log:
   **Received 1, Duplicated 1, Rejected 0** (the seeds are now-relative
   offsets, so this is deterministic at any run time).
7. **Most recent callbacks**: five rows — status pill, type, event id,
   relative time — newest first (the `evt_a1b2c3d4` retry on top).
8. The **What this page measures** card states, in words: inbound flow
   measured; uptime/latency/DB not measured (no APM — "refuses to print
   invented numbers"); queue depth zero by design (inline processing,
   QUEUES.md's next rung).

## C. Links (all real)

9. Each recent row → `/en/webhooks/<row id>` (open the first: the
   duplicate's detail page, with its "This callback was a duplicate" note
   and Replay).
10. **View full log** → `/en/webhooks`.
11. **Endpoint & token settings** → `/en/settings/developer`.
12. **Notification preferences** → `/en/settings/notifications` (the real
    ADR-0009 settings — the only notification machinery in the app).

## D. Invariants

13. `/support` → "View detailed status" lands here and its promise ("live
    from the app, not a static banner") holds: simulate a callback on
    `/webhooks?simulate=1` and return — the Received card and the recent
    list have moved.
14. No surface in the app now claims an uptime, a latency, a database
    state or a queue depth.
