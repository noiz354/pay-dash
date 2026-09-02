# Onboarding — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at
`http://localhost:3000/en/onboarding`. The page is pure derivation — it holds
no state of its own, so a restart always returns it to the seeded world.

## A. What the page states (seeded world)

1. Heading **Sub-Merchant Onboarding**; subtitle "Complete the required steps
   to activate trading capabilities for **Acme Corporation LLC**." The
   breadcrumb "Accounts" is a real link to `/en/settings/merchant`.
2. **Onboarding Progress**: "3 of 3 sections completed", **100%**,
   `aria-valuenow="100"`, and the footnote "The compliance review is owned by
   the compliance team — it is shown on this page but not counted."
3. **Business Profile — COMPLETED**: "Acme Corporation LLC · Acme",
   "123 Financial Plaza, Suite 400, New York, NY, 10004", "12-3456789".
4. **Bank Setup — COMPLETED**: "Bank Central Asia · **** 1234 (default)",
   "2 of 3 accounts verified". (The prototype's `****4592` / "Oct 24" are
   gone; `**** 8891` is also verified, `**** 4420` is not.)
5. **Technical Setup — COMPLETED**: "3 keys on file · 2 live, 1 sandbox",
   "7 callback events received", "33 successful transactions settled". No
   struck-through labels anywhere.
6. **Compliance — ACTION REQUIRED** (primary border, the one section that
   needs action): basic info complete ("Acme · 123 Financial Plaza,
   Suite 400 · 12-3456789"), "Incorporation document — Not yet submitted",
   and the note that the review "is conducted by the compliance team and its
   outcome is not visible in this app".

## B. The CTAs are real

| CTA | Lands on |
|---|---|
| Review Details | `/en/settings/merchant` |
| View Documents | `/en/kyc` |
| Manage Accounts | `/en/payouts/settings` |
| Go to Developer Dashboard | `/en/settings/developer` |

Each page should show the data the card claims (profile fields, the KYC
upload form, the three bank accounts, the developer/IP-allowlist settings).

## C. It reacts to the world (live derivation)

1. **Submit the KYC document** at `/en/kyc` (any PDF/JPEG/PNG ≤ 10 MB).
   Reload `/en/onboarding` → the compliance badge is now **REVIEW PENDING**
   and the document row reads `<file> — <type label> · submitted <date>`.
   The progress is still **3 of 3 / 100%** — submitting does not "complete"
   the review, the app cannot claim that.
2. **Create an API key** at `/en/settings/api-keys`. Reload
   `/en/onboarding` → Technical reads "4 keys on file · …".
3. Restart the dev server → everything resets to the seeded state above.

## D. Must NOT appear

"75%", "3 of 4", "4592", "Oct 24", "Acme Corp Setup", "Verified by system",
"Signed & uploaded", any `line-through` on completed checks, `bg-white`.

## E. Automated coverage

- `src/server/data/onboarding.test.ts` — 7 unit tests (derived facts, the
  compliance never-COMPLETED / never-counted invariant, live re-derivation).
- `e2e/onboarding.spec.ts` — 5 serial Playwright tests.
- `uat-journeys` F8 (derived progress) and J4 (CTA navigation), rewritten
  from their stale forms.
