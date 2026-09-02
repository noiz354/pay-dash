# Risk & Velocity Limits — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at
`http://localhost:3000/en/risk`. The risk store is in-memory: seeded with a
four-rule ruleset, IDR caps (daily Rp 2.000.000.000 / monthly
Rp 60.000.000.000) and "deployed 12 days ago", no draft. A restart returns
the page to this state. Alerting, cap usage and the risk profile are
**derived from the ledger** (46 seeded transactions) on every read.

## A. The page is the data

1. Heading **Risk & Velocity Limits**; badge **Active Ruleset** (green dot);
   **Discard Draft** and **Deploy Changes** both **disabled** (no draft).
2. **High-risk alerts** card: count = ledger transactions with
   `riskScore >= 60` (11 in the seeded world), subline "score >= 60 · 46
   transactions scanned". No "14", no "12% vs yesterday".
3. **Critical Triggers**: newest 5 of the high-risk transactions —
   "N of 11" on the right, severity dot (red ≥ 70, amber 60–69), real
   customer name, `Rp …` detail, relative time. Each row links to
   `/en/transactions/txn_…` (the detail page shows the same score). No
   "Card ending 4492", no "Merchant A", no "View All".
4. **Global Volume Limits**: IDR labels and `Rp`-prefixed inputs (daily
   2000000000 / monthly 60000000000), enable switch on; under each field a
   **derived usage line** ("currently N% used (Rp …)"). No "(USD)", no "$".
5. **Velocity rules table**: the four seeded rules with scope chip (Global /
   Per card / Per customer), threshold (`Rp 50.000.000 per day`,
   "25 transactions per hour", …), Alert/Block chip, enable switch
   (`rule_high_value` off — row dimmed). The page's title finally has a
   referent.
6. Right column (the prototype's empty `<div>`): **Ledger Risk Profile** —
   three distribution bands (0–39 / 40–59 / ≥ 60) whose counts sum to 46,
   plus "46 transactions scanned · ruleset deployed 12d ago".

## B. Draft → deploy → discard

1. Change the daily cap to `2500000000` → **Save to draft** → toast
   "Draft updated — deploy to make it live."; badge flips to
   **Draft pending** (amber dot); both header buttons enable.
2. **Deploy Changes** → toast "Ruleset deployed — 4 rules live."; badge
   back to **Active Ruleset**; the right panel's "deployed …" now reads
   "just now"; a refresh keeps the new cap.
3. Toggle the **High-value transaction** row switch → toast "High-value
   transaction drafted as enabled." → Draft pending. Deploy → the row is no
   longer dimmed and the switch stays on.
4. Toggle it back off → Draft pending → **Discard Draft** → toast
   "Draft discarded." → Active Ruleset → the row is dimmed again (the
   draft reverted, the deployed ruleset untouched).

## C. Validation

1. Daily cap `0` → **Save to draft** → inline error "Enter a daily volume
   limit greater than zero." (no draft is created — the button stays
   disabled).
2. Monthly below daily (`1000000000`) → "The monthly cap must be at least
   the daily cap."
3. The volume switch and every rule switch are no-op-safe: toggling to the
   state the draft already holds returns "Already in that state."

## D. Derived alerting branches

- A volume alert ("Daily volume at N% of cap", red) appears only when
  24h settled usage reaches 75% of the **deployed** daily cap — not in the
  seeded world (single digits of a %); with volume limits disabled it
  cannot appear at all. (Covered by `risk.test.ts`.)
- Every alert row with a transaction id resolves: open one — the detail
  page's "Risk score … / 100" matches the alert's number.

## E. Regression guards (what must be gone)

"14" card, "12% vs yesterday", "Card ending 4492", "Merchant A",
"10:42 AM"/"09:15 AM", "(USD)", "$1,500,000", "$45,000,000", "View All",
the empty right column, the static green badge.
