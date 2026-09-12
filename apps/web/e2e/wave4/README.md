# Wave 4 critical gates (Playwright)

Six browser-level gates for the Wave 4 behavior contracts. They run against
`next dev` with `AUTH_ENFORCED=off` and the persona cookie harness
(`e2e/test-utils.ts`, spec §3 personas) so a test can *become* two different
actors — the pre-requisite for the cross-role handoff gate at all.

| Spec | Gate |
|---|---|
| `refund-handoff.spec.ts` | Role A (agus/SUPPORT) requests → dual-control queue → Role B (hendri/FINANCE_ADMIN) approves → dual-actor timeline |
| `sla-filter-back-restore.spec.ts` | `?sla=OVERDUE` → detail → **back** restores the filtered view (chip + rows) |
| `permissions.spec.ts` | restricted persona (nadia/ANALYST): server denies retry through the real UI; refund trigger disabled with the reason |
| `freshness-stale.spec.ts` | freshness ticks without a fetch; manual refresh resets age; >60s → stale banner → refresh clears it |
| `conflict-recovery.spec.ts` | two-tab race → 409 → ConflictDialog shows the **latest** server state (never auto-applies) → retry-after-review succeeds |
| `mobile-journey.spec.ts` | 390px: cards with SLA badges → filter sheet → chip → detail → back restores state |

## Running

```bash
# normal environments (browsers installed via npx playwright install)
pnpm test:e2e -- e2e/wave4 --project=chromium

# sandbox / CDN-blocked environments (one-time per session)
node ../../scripts/ensure-e2e-browser.mjs   # extracts Chromium from the npm tarball
pnpm test:e2e -- e2e/wave4                  # projects auto-narrow to chromium
```

The gates mutate the dev server's shared in-memory ledger (refund requests,
retries), so they run `workers: 1` and pick their fixtures dynamically — see
`helpers.ts`. The server stays usable afterwards; rows it consumed are simply
no longer eligible fixtures for a re-run.
