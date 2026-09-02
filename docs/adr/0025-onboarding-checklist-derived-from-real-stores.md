# 0025 — Onboarding: a checklist the app can actually track

Date: 2026-09-02
Status: Accepted

## Context

`/onboarding` ("Sub-Merchant Onboarding") was a pure mockup whose numbers the
app's own world contradicted:

1. **Hard-coded progress** — "3 of 4 sections completed · **75%**" with a
   progress bar that derived from nothing and could never change.
2. **A self-contradictory Technical card** — "API Keys Generated" and
   "Webhook Endpoints Configured" rendered with green check circles **and**
   `line-through` (done items struck through), while "First Test Transaction"
   sat unchecked — even though the ledger holds **33 SUCCEEDED transactions**
   and the app has 3 API keys and a live webhook callback log (ADR-0014).
3. **Invented bank facts** — "Operating Account ****4592 / Micro-deposits
   verified on Oct 24"; the world's real accounts are `**** 1234`, `**** 8891`,
   `**** 4420` (two verified), and "4592" appears nowhere.
4. **Document claims the app cannot own** — "Articles of Incorporation —
   Verified by system", "W-9 — Signed & uploaded". INTEGRATION.md:330–339:
   account creation & document onboarding is the Xendit **Platform API**,
   which `xendit-node` v7 does not expose — so the app can never hold a
   document *status*, only what the merchant *submitted* through it
   (ADR-0019's ruling, which deliberately left the KYC store unseeded).
5. **Dead affordances** — the "Accounts" breadcrumb was link-styled but not a
   link; all four card CTAs (Review Details / View Documents / Manage
   Accounts / Go to Developer Dashboard) had no handler, even though a real
   destination exists for each; no `metadata`; a raw
   `rgba(0,63,177,0.1)` glow on the "IN PROGRESS" card.

But most of the checklist maps 1:1 onto stores the app already owns: the
merchant profile (settings), the payout bank accounts, the API keys, the
webhook callback log, the ledger, and the KYC submission.

## Decision

The checklist is **derived, not seeded** — `server/data/onboarding.ts` owns
no facts (the ADR-0011 balance pattern applied to a checklist). One
`getOnboardingStatus()` resolves every section against its owner:

| Section | Derived from | Seeded-world result |
|---|---|---|
| Business Profile | `settings.merchant` (legal name/DBA, address, tax ID) | COMPLETED |
| Compliance | `profileKycCompleteness()` + `getKycSubmission()` | ACTION REQUIRED (KYC deliberately unseeded) |
| Bank Setup | `listBankAccounts()` + `getDestinationAccount()` | COMPLETED — "Bank Central Asia · **** 1234 (default)", "2 of 3 accounts verified" |
| Technical Setup | `listApiKeys()` + `listWebhooks()` + SUCCEEDED ledger rows | COMPLETED — "3 keys on file · 2 live, 1 sandbox", "7 callback events received", "33 successful transactions settled" |

**The compliance ruling.** The compliance section is *shown* but **never
counted and never COMPLETED**: the app can hold "submitted" (its own fact,
ADR-0019) but not "approved" — the review outcome is the compliance team's
side of the table (INTEGRATION.md §7 / :93/:323). Its badge is
`ACTION REQUIRED` until the merchant submits a document, then
`REVIEW PENDING` — and the progress bar tracks the three app-owned sections
only (seeded world: **3 of 3 · 100%**, which is the honest state of a
merchant with 33 succeeded payments). A unit test guards the invariant: the
compliance section's badge can never be `COMPLETED` and its `counts` flag is
`false`.

**The page** (`app/[locale]/onboarding/page.tsx`, server component + shared
`OnboardingCard`): `metadata`; the real merchant name in the subtitle (the
"Acme Corp Setup" breadcrumb label is gone); the progress bar and "N of M
sections completed" derived, with a plain footnote that the compliance review
is shown but not counted; each check row shows its derived detail (no
`line-through` on completed items — that visual is dropped); the attention
styling (primary border) moves to whichever section actually needs action —
in the seeded world, the compliance card; every CTA is a real locale-aware
`Link` to the page that owns the facts:

| CTA | Destination |
|---|---|
| Accounts (breadcrumb) · Review Details | `/settings/merchant` |
| View Documents | `/kyc` |
| Manage Accounts | `/payouts/settings` |
| Go to Developer Dashboard | `/settings/developer` |

The compliance card carries the compliance-team note ("the review itself is
conducted by the compliance team and its outcome is not visible in this
app"). Tokens only — the raw `rgba` glow is gone.

**Dropped:** hard-coded 75% / "3 of 4", "Acme Corp Setup", `****4592`,
"Oct 24", "Verified by system", "Signed & uploaded",
`line-through`-on-complete, the raw rgba shadow, all four dead buttons.

## Consequences

- The checklist can never disagree with the world it renders next to: add an
  API key and the Technical detail re-derives on the next render; verify the
  destination account and the Bank section follows; submit the KYC document
  and the badge moves `ACTION REQUIRED → REVIEW PENDING` (unit-tested).
- Progress can only be overstated by a bug, never by a seed — and the one
  half the app cannot complete is structurally excluded from it, which is
  why "100%" on this page is a true statement rather than a lie by
  omission.
- What remains honestly out of reach (the document *review outcome*) is
  labelled as such on the page, per the ADR-0019 precedent: the app never
  claims identity facts it cannot hold.
- Tests: `onboarding.test.ts` (7), `e2e/onboarding.spec.ts` (5 serial),
  UAT F8 + J4 rewritten (both were red — written against iterations of the
  page that no longer exist).
