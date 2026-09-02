# 0023 — Risk: limits and rules the dashboard can enforce

Date: 2026-09-02
Status: Accepted

## Context

`/risk` (Risk & Velocity Limits) was a pure mockup whose title it could not
back up:

1. **Invented alerting** — "Alerts (24h): **14**, **12% vs yesterday**" with
   no alert model and no comparison data; "Critical Triggers" listed two
   hard-coded rows — "Velocity Max: **Card ending 4492**" (the ledger has
   **no card last4 field** — channels are CARD/ACH/VA/QRIS/EWALLET with a
   `methodLabel`) and "Txn Limit Approaching: **Merchant A**" (not a
   merchant), stamped with static "10:42 AM / 09:15 AM".
2. **A title with no referent** — "Risk & *Velocity* Limits" and a
   "Velocity Max" alert, yet no velocity rules existed anywhere: no rules
   list, no rule model.
3. **USD in an IDR app** — "Max Daily Volume (**USD**) $1,500,000" /
   "Max Monthly Volume (USD) $45,000,000", uncontrolled inputs; the rest of
   the app renders `Rp`.
4. **Promised but absent draft model** — "Discard Draft" and
   "Deploy Changes" buttons with no handlers and no draft state; the
   "Active Ruleset" badge was static.
5. **Prototype debris** — the right column was an empty
   `<div class="lg:col-span-4">` (faithfully migrated from the prototype,
   which shipped it empty), an uncontrolled enable switch, "View All" with
   no destination, no `metadata`.
6. **No model anywhere** — `server/data/` had no risk store.
   INTEGRATION.md:117/:320 documents the screen with **no Xendit source**:
   "Velocity/risk thresholds are Dashboard-only."

## Decision

The ruleset, the volume limits and the draft/deploy workflow are
**app-owned** (the class the team/webhooks/links pages use — business
records the app manages, not identity claims). What the prototype invented
is replaced by **derivation** from the real ledger (46 seeded transactions,
each carrying a `riskScore` the app already stores):

**1. `server/data/risk.ts` — deliberately seeded, honestly derived.**
Seeded: a four-rule ruleset (`rule_card_velocity` CARD/COUNT/25/hourly/
ALERT, `rule_card_daily` CARD/VOLUME/Rp 50.000.000/daily/BLOCK,
`rule_customer_burst` CUSTOMER/COUNT/10/hourly/ALERT,
`rule_high_value` GLOBAL/VOLUME/Rp 100.000.000/per-transaction/ALERT,
**disabled** by default) plus **IDR** volume caps (daily Rp 2.000.000.000 /
monthly Rp 60.000.000.000, sized plausibly against the world: available
balance Rp 2.2B, ~Rp 1.1B settled across the 46 transactions) and a
deployed-at of 12 days ago. Derived, never stored: **alerts** (every
transaction with `riskScore >= 60` — `HIGH_RISK_SCORE` in client-safe
`lib/risk-options.ts` — plus a daily-cap breach alert at ≥ 75% usage, which
the real 24h volume does not reach, so the store proves both branches in
tests), **cap usage** (24h/30d settled volume ÷ deployed caps), and the
**risk-score distribution** (0–39 / 40–59 / ≥ 60 bands).

**2. A real draft/deploy workflow** — `patchDraft` (one patch: caps, the
volume switch, or a rule's enabled flag) lands a **draft**;
`deployRiskSettings` makes it live (stamps `deployedAt`) and clears the
draft; `discardDraft` reverts. The badge is then derived — **Active
Ruleset** vs **Draft pending** — and the header buttons are enabled exactly
when a draft exists. Deploying with no draft is a no-op.

**3. The page runs on the derived overview** — the alert bento's count is
the high-risk transaction count ("11 · 46 transactions scanned", top 5
newest shown as "N of M"); every transaction alert **deep-links to
`/transactions/[id]`** (which already displays the risk score) — the dead
"View All" is dropped in favour of per-alert links. Volume card: the enable
switch drafts immediately (the app's optimistic-switch convention from
`/settings/notifications`), the IDR inputs (`Rp` prefix, `parseAmount`
server-validated: > 0, monthly ≥ daily) save to the draft via
"Save to draft", and each field shows **derived usage** ("8% used
(Rp …)"). The rules table renders the real ruleset (scope, threshold in
`Rp`/counts + window, Alert/Block chips, per-row enable switch that drafts).
The empty right column becomes the **Ledger Risk Profile** (distribution
bands + "ruleset deployed 12d ago"). `metadata` added; tokens only.

**4. Dropped** — "14 / 12% vs yesterday", the two ghost triggers, "Card
ending 4492", "Merchant A", the USD framing, "View All", the empty spacer
column, the static badge.

## Consequences

- Alerting is a projection of the ledger: a transaction's risk score is set
  at creation (seeded 0–78, manual 8) and never changes, so the alert
  queue is stable per ledger state; new/refunded transactions change it.
- Drafts live in the in-memory store like every sibling (restart = seeded
  state: no draft, deployed 12 days ago, daily Rp 2B).
- Client components import thresholds from `@/lib/risk-options` and types
  from `@/server/data/risk` (type-only) — the `server-only` store must not
  leak into the client bundle (the standing rule).
- The "High-value transaction" rule ships **disabled** so the enable
  switch has a visible effect out of the box; enabling it is a draft, not
  a live change, until deployed.
- INTEGRATION.md:320 says Xendit-dashboard risk is managed separately;
  nothing here claims otherwise.

## Alternatives considered

- *Keep the "24h" framing and derive only 24h alerts.* Rejected: the
  ledger spans ~6.4 days, so a 24h window would hide most high-risk
  transactions and the card would often read 0; "High-risk alerts … 46
  transactions scanned" is the honest scope.
- *Map velocity rules to the `/fraud` rule console.* Rejected: the fraud
  screen owns fraud rules/blocklist; INTEGRATION.md documents *this*
  screen as Dashboard-only velocity/volume thresholds — merging the two
  would re-create the world's page overlap.
- *USD kept, converted at display.* Rejected: the merchant settles in IDR;
  a USD cap is a claim the app's world doesn't support.
