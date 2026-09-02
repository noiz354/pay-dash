# 0019 — KYC: submission the app can own

Date: 2026-09-02
Status: Accepted

## Context

`/kyc` (Identity Verification) was a raw prototype with a hard constraint
attached to it: INTEGRATION.md (:93/:114/:323) documents that Xendit KYC
"exists but is **not** in the v7 node SDK product list" — the app can never
fetch a review state. So the page invented one instead:

1. **A hard-coded 4-step rail** (Basic Info ✓, Business Documents ●, the
   rest empty) — no store exists anywhere (verified: zero KYC references in
   `server/`/`lib/`).
2. **An upload that does nothing** — the `<input type="file">` had no
   `onChange`; the "Attached Files" list was a hard-coded
   `acme_corp_incorporation_2023.pdf — 2.4 MB` whose **Delete** button had
   no handler; Document Type was an uncontrolled `Select`; the jurisdiction
   input was uncontrolled with a "Delaware, USA" placeholder in an
   IDR/Xendit app.
3. **Actions with no destination** — **Save Draft** and **Submit Step**
   were handler-less buttons; the progress could never advance.
4. **A step with no model** — "Beneficial Owners" has no data model in the
   app and no SDK support (documented); owners are collected by the
   compliance side.
5. `bg-white` (×4+), `amber-50/200/700` and `emerald-500/600` palette
   literals instead of the app's status tokens; no `metadata`.

## Decision

The page states exactly what the app owns, and says plainly what it
doesn't:

**1. A submission store the app can truthfully write**
(`server/data/kyc.ts`): one record — `fileName`, `sizeBytes`, `docType`,
`jurisdiction`, `submittedAt` — via `submitKycDocument` (replace) /
`removeKycDocument`. **Deliberately unseeded**: a compliance document is an
unverified claim about the merchant — unlike ledger rows, the app should
not fabricate one. The honest default state is "Action required".

**2. Step 1 is real.** "Basic Info" is derived from the merchant profile
(`profileKycCompleteness()` — business name, registered address, tax ID):
complete → done with the values; incomplete → the missing fields listed,
plus an "Edit profile" door to `/settings/merchant`. No more fake check
mark.

**3. The rail keeps only data-backed steps**: Basic Info (profile) →
Business Documents (the store) → Submission (timestamp or "not yet").
"Beneficial Owners" is removed and the rail footnote states where it lives:
the compliance team, during review — not this app (the INTEGRATION.md SDK
note, cited on-page).

**4. The upload is real.** `kyc-upload.tsx`: the file input has an
`onChange` with the stated limits actually enforced (PDF/JPEG/PNG, 10 MB —
client-safe `lib/kyc-options.ts`), a working **Remove** (server action),
and one real action, **Submit for review** (persists the record; the
prototype's handler-less "Save Draft" is removed — a draft store would
invent more than the app knows).

**5. The badge is derived**: unsubmitted → **Action required**
(`--warning`); submitted → **Awaiting review** (`--pending-status`) with
the submitted date. The AML banner keeps the requirement but drops the
unverifiable "end-to-end encrypted / banking-grade" claims and states the
boundary: "the review itself is conducted by the compliance team — its
outcome is not visible in this app."

**6. Tokens**: `bg-white` → `--surface-container-lowest`, emerald →
`--success-status`, amber → `--pending-status`/`--warning`. `metadata`
added.

## Consequences

- The app claims exactly one KYC fact (what the merchant submitted, when)
  and zero review outcomes — the SDK constraint is respected on-page, not
  papered over with invented progress.
- `formatBytes` joins `lib/format.ts` (attached-file sizes).
- The KYC store, like its siblings, is in-memory and unseeded; a restart
  returns the page to "Action required".

## Alternatives considered

- *Seed a submitted document (like the other stores).* Rejected: every
  other seed is a consistent fiction the app "would have generated"
  (ledger rows, links); a compliance document is a claim about the
  merchant's real-world identity, which the app has no business
  fabricating. Unseeded + a real upload flow is the honest default.
- *A 4-step rail with an inert "Beneficial Owners" step.* Rejected: a step
  that can never change is the same hard-coded progress the page shipped
  with; naming the compliance side on-page covers the information.
- *Keep "Save Draft".* Rejected: it would require a draft state the app
  never consumes (submission replaces the record wholesale).

## Verification

- **Unit** — `src/server/data/kyc.test.ts` (4): unseeded start; submit /
  replace / remove (idempotent remove); copy-not-reference; profile
  completeness (seeded complete with dba precedence; blanked
  taxId/address → incomplete with the missing labels listed).
- **Gate** — `pnpm typecheck` clean; `pnpm lint` 0 errors; vitest green.
- **SSR (dev server, 2026-09-02)** — `/en/kyc` renders "Action required",
  the profile-derived step 1 (seeded values), no `acme`/`Delaware`/
  "2.4 MB", no `bg-white` literals, no dead buttons.
- **E2E** — `e2e/kyc.spec.ts` (3, serial): invented artifacts absent,
  file-limit enforcement (a `.txt` is refused), and the upload → submit →
  "Awaiting review" → reload-persists → remove round trip. Runs in CI
  (Playwright browser not installable in this sandbox).
- Manual procedure: `docs/audit/kyc-test-procedure-2026-09-02.md`.
