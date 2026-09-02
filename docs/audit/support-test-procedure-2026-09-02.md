# Support hub — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at `http://localhost:3000/en/support`.

## A. Every affordance is real

1. **Topic cards** (hover shows an arrow):
   - API Reference → `/en/settings/api-keys`
   - Settlement Guide → `/en/payouts`
   - KYC Requirements → `/en/kyc`
   - Reporting & Export → `/en/reports/builder`
   DevTools: the page contains **zero** `href="#"` anchors.
2. **System Status** card: no "API Gateway / Settlement Engine / Webhooks
   — Operational" rows; a single pointer line and **View detailed status**
   → `/en/system`.
3. **Contact Support**: one button — **Email support** →
   `mailto:support@kinetic.test?subject=…`. No Live Chat, no Ticket
   History. The big search bar and Cmd+K kbd are gone.

## B. The `?ref` deep-link (the "Report issue" journey)

4. From `/en/transactions`, open any row's menu → **Report issue** → you
   land on `/en/support?ref=txn_…` with a banner: "You’re reporting on
   `txn_…`".
5. Inspect the **Email support** button's href:
   `mailto:support@kinetic.test?subject=Kinetic%20Ledger%20%E2%80%94%20issue%20with%20txn_…`
   — the reference travels with the report. Clicking it opens the mail
   client with the subject pre-filled.
6. Without `?ref`: no banner, subject is the plain
   "Kinetic Ledger — support request".

## C. Invariants

7. The page stays static (no search, no article content) — its contract is
   that it points, and points correctly, into the app and to the one
   documented support address.
8. Both known deep-link sources (row action, transaction detail) reach the
   same banner; a tampered `?ref=whatever` renders the value as-is
   (data-mono, break-all) — no markup, no route.
