# KYC — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at
`http://localhost:3000/en/kyc`. The store is unseeded and in-memory: a
restart returns the page to "Action required".

## A. The honest blank state

1. Badge: **Action required** (warning tone). No `acme_corp_incorporation_2023.pdf`,
   no "2.4 MB", no "Delaware, USA", no Save Draft / Submit Step buttons,
   no "Beneficial Owners" step.
2. Step rail: **1. Basic Info** done — values from the real merchant
   profile (business name from the DBA, registered address, tax ID) and an
   **Edit profile** link → `/en/settings/merchant`. **2. Business
   Documents** active ("Upload your incorporation proof"); **3. Submission**
   "Not yet submitted".
3. Footnote: beneficial owners are collected by the compliance team during
   review — not part of this app (INTEGRATION.md §7 SDK note).

## B. Upload + limits

4. Pick a file in the drop zone:
   - `document.txt` → inline error "Accepted formats: PDF, JPEG or PNG."
   - a >10 MB PDF → "File is larger than the 10 MB limit."
   - `skeleton_akta_perseroan.pdf` → attached row with the real name and
     size.
5. Document Type select + jurisdiction ("e.g. Indonesia (KemenkumHAM)"
   placeholder) are real controls.

## C. Submit + review boundary

6. **Submit for review** → toast; badge flips to **Awaiting review**
   (pending tone); the attached row reads "… · submitted"; the card header
   shows "Submitted just now"; step 3 shows the date.
7. Reload — the submission persists (same store).
8. **Remove submission** → toast; badge back to **Action required**; the
   file row is gone; step 3 back to "Not yet submitted".
9. The page never claims an approved/rejected outcome — the banner states
   the review is the compliance team's side of the table.

## D. Step 1 follows the profile

10. Blank the Tax ID (or address) on `/en/settings/merchant` → save →
    return to `/en/kyc`: step 1 is no longer done and lists exactly the
    missing fields; restore the value and it completes again.
