# Wave 3 Implementation Plan

## Objective
Close Wave 2 E2E gaps and implement Governance workflows, real freshness/polling, 409 conflict recovery, backend idempotency, Needs Attention, Command Palette, canonical timeline, design-system convergence, and accessibility hardening.

## Execution Order (11 items)

### 1. Automate Wave 2 Critical Playwright Flows
- [ ] E2E-022: search/filter/sort flow
- [ ] E2E-023: detail→back restore
- [ ] E2E-009: bulk partial failure
- [ ] E2E-010: CSV failed.csv download
- [ ] E2E-011: permission denial
- [ ] E2E-024: mobile flows

### 2. Migrate Customers to CanonicalDataTable
- [ ] Create canonical-customers-table.tsx
- [ ] Migrate to table-url-state
- [ ] Add canonical search/filter/bulk
- [ ] Verify q=email cross-link

### 3. Wire Real StaleBanner
- [ ] Poll 20s for ledger/payout data
- [ ] Show stale >60s banner
- [ ] Background refresh without blanking
- [ ] Manual refresh button

### 4. Implement 409 Conflict Recovery
- [ ] Add version field to batch model
- [ ] Return 409 on version mismatch
- [ ] ConflictDialog with fetch latest + review + retry
- [ ] Test stale-write flow

### 5. Backend Idempotency for Money Movement
- [ ] Generate idempotencyKey: hash(orgId+batchId+recipientId+amount)
- [ ] Same key+payload → single logical mutation
- [ ] Same key+different payload → conflict 409
- [ ] Test dedupe

### 6. Dashboard Needs Attention
- [ ] 6 exception cards from real data
- [ ] Permission-aware visibility
- [ ] Positive empty state (celebrate)
- [ ] Poll 20s with stale banner

### 7. Blocklist Governance
- [ ] Inline add with chip + reason
- [ ] CSV ramp for ≥5 entries
- [ ] Duplicate detection
- [ ] Actor + timestamp audit

### 8. Webhooks Improvements
- [ ] Protocol-aware copy
- [ ] Replay permission check
- [ ] Original/retry/replay provenance
- [ ] Audit trail for deliveries

### 9. Canonical Timeline
- [ ] Single-event model
- [ ] Actor, action, state change, timestamp, reason
- [ ] Deterministic dedupe
- [ ] No duplicate "Refund issued" entries

### 10. Command Palette (⌘K)
- [ ] Role-aware navigation/entity search
- [ ] Fuzzy matching
- [ ] Recent 5 items
- [ ] NO destructive financial actions
- [ ] Permission filtering

### 11. Design System Convergence + A11y
- [ ] Converge tokens on touched screens
- [ ] Add skip link
- [ ] Focus trap verification
- [ ] aria-* attributes
- [ ] Reduced motion support
- [ ] Contrast AA verification

## Gates (Block Release If)
- Duplicate money mutation
- Unauthorized palette result
- Replay bypass permission
- Dashboard data leak
- Silent 409 overwrite
- Focus trap issues

## Files to Create/Modify
- WAVE_3_IMPLEMENTATION_REPORT.md (this report)
- e2e/*.spec.ts (automated tests)
- src/components/customers/canonical-customers-table.tsx
- src/app/[locale]/customers/page.tsx (migrate)
- src/components/data-table/stale-banner.tsx (wire real polling)
- src/server/data/payouts.ts (version + idempotency)
- src/server/data/transactions.ts (idempotency)
- src/app/[locale]/dashboard/page.tsx (Needs Attention)
- src/components/fraud/blocklist-table.tsx (governance)
- src/components/webhooks/webhook-card.tsx (improvements)
- src/components/timeline/timeline.tsx (canonical)
- src/components/command-palette.tsx (⌘K)
- Design system tokens convergence

## Success Criteria
- Wave0/1/2 regression PASS (113+ tests)
- All Wave3 automated flows PASS
- Customers migration verified
- Idempotency prevents duplicates
- Real freshness works
- 409 recovery proven
- Governance server-authorized
- Needs Attention uses real data
- Palette permission-aware
- A11y keyboard/focus PASS
