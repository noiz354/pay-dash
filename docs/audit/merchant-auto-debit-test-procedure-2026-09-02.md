# Merchant auto-debit — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web`.

## A. The round trip

1. `http://localhost:3000/en/billing` — the **Next Invoice Date** card's
   sub-line reads **"Auto-debit scheduled"** and links to
   `/en/settings/merchant` (seed: switch on).
2. Open `/en/settings/merchant` → **Platform Branding** → toggle
   **Auto-debit platform invoices** off → the sticky footer flips to
   **Unsaved changes** and Save enables.
3. **Save Changes** → toast "Merchant profile saved."
4. Back to `/en/billing` — the card now reads **"Auto-debit off — set it
   up"** (the branch that used to be unreachable), still linking to the
   profile page.
5. Flip the switch back on and save → the card reads "Auto-debit
   scheduled" again.

## B. Invariants

6. The profile switch and the billing card never disagree — the card's
   value comes from the profile, not from a constant.
7. Nothing else on `/billing` or `/settings/merchant` changes when the
   switch is flipped (no derived amounts move; auto-debit is a collection
   preference, not a fee input).
