# 0022 — Team: members the dashboard can manage

Date: 2026-09-02
Status: Accepted

## Context

`/team` was a pure mockup with an internal contradiction:

1. **Four hard-coded rows, off-world** — Daniel Wirawan / `daniel@ledger.com`,
   Michael Chen / `m.chen@ledgerscale.io`, Sarah Anderson /
   `sarah.a@ledger.com`, Priya Nair / `priya@acmecorp.com` — three of the four
   on domains that appear nowhere else in the app, seeded in module scope.
2. **The contradiction** — the Members tab listed Elena Jenkins as
   **Invited**, while the Pending Invites tab rendered "no pending
   invitations". The same store couldn't be both.
3. **A dead config surface** — search, Filter, Export, Add Member, select-all,
   the bulk bar's Change Role / Deactivate (permanently disabled: "0
   selected", because the checkboxes had no state), every ⋮ and every
   pagination control had no handler.
4. **Invented totals** — "Showing 1 to 4 of **24**" (the table renders 4
   rows).
5. **Placeholder tabs** — Roles ("coming soon" copy) and Pending Invites
   (static empty state) had no data.
6. **Prototype debris** — `bg-white` ×4, emerald/amber literals, static
   "last active" text ("2 mins ago", "Yesterday") with no timestamps, no
   `metadata`.
7. **No model anywhere** — `server/data/` has no team store; the merchant
   profile has no owner field; INTEGRATION.md:97/:122/:318 documents the
   screen with **no Xendit source** ("Role-based access control is
   Dashboard-only; the Xendit dashboard is managed separately").

## Decision

The team is app-owned dashboard RBAC — the class the integration doc itself
assigns to the screen (webhooks/links/batches class: business records the
app manages, not identity claims).

**1. `server/data/team.ts` — deliberately seeded.** Six members on the
merchant's own **`@acmecorp.com`** domain (the merchant is Acme Corporation
LLC, `support@acmecorp.com`): Daniel Wirawan (Admin, active), Michael Chen
(Developer), Sarah Anderson (Analyst), Priya Nair (Developer), Kevin Halim
(Analyst, joined long ago) — all ACTIVE — and Elena Jenkins (Risk Analyst,
**INVITED**, invited 3 days ago). Ids are `mem_` + the djb2 base36 of the
email (stable, same spirit as `customerIdFromEmail`). The one invite is why
the pending tab is non-empty — the contradiction is resolved by
construction: *invited members live in Pending Invites, not in the Members
table* (`listMembers` takes `statuses: MemberStatus[]` so the two tabs never
diverge). Fields: `id`, `name`, `email`, `role`,
`status (ACTIVE | INVITED | DEACTIVATED)`, `joinedAt`, `invitedAt`,
`lastActiveAt`, `notes?`.

**2. The page runs a real query** — the Members tab is searchParams-driven
(`q`, `role`, `page`) like `/customers`: debounced search (name/email/id),
role filter, derived "N members" count, real `TablePagination` ("1 to 5 of
5" — no invented 24), empty state when filters match nothing.

**3. Real rows** — initials avatars, `formatRelative(lastActiveAt)` over real
timestamps (invited members show "—"), token status chips, and ⋮ = a real
`DropdownMenu`: active members get Change role (sub-menu of the other three
roles) + Deactivate; deactivated get Reactivate; invited rows only exist
under Pending Invites.

**4. Real selection + bulk actions** — the checkboxes **are** the state
(`Set<string>`, cleared on every re-render after a mutation); the bulk bar
reports the live count and drives real server actions: Change Role
(single or N members, message scales "Role updated." → "Role updated for 2
members.") and Deactivate (bulk-capable by the same `ids[]` contract).

**5. Real invite lifecycle** — `inviteMemberAction` (Add Member dialog: name
≥ 2, email regex, role; server-validated) lands **INVITED**;
`resendInviteAction` re-stamps `invitedAt`; `revokeInviteAction` removes an
INVITED member (no-op on non-invites); `reactivateAction` flips
DEACTIVATED → ACTIVE (sets `joinedAt`, clears `invitedAt`). Invites expire
after `INVITE_TTL_DAYS` (7), stated on the page and the pending rows — the
prototype never said when an invite was sent or that it expires.

**6. Real Roles tab** — the RBAC catalog from client-safe
`lib/team-roles.ts` (4 roles with descriptions + permission lists, shared by
page, dialog, chips and e2e), with member counts **derived** from the store
(active members per role — an invite is not yet a member of a role).

**7. Real export** — `/api/exports/team` mirrors the Members tab filters
("what you see is what you export", the established `/api/exports/*`
contract) + the shared `ExportCsvButton`; 8 columns with raw values (dates as
ISO or empty).

**8. Dropped** — the off-world `@ledger.com` / `@ledgerscale.io` addresses,
the invented "24", the unreachable "0 selected" bar, the placeholder tabs,
the static "last active" strings, the `bg-white` / emerald / amber
literals. `metadata` added.

## Consequences

- The store is in-memory and date-relative (anchored to server start, like
  its siblings); restart returns the seeded state (6 members: 5 active, 1
  invite).
- A member on a domain other than the merchant's is possible through the
  store (`inviteMember` takes any valid email) but the seeded world is
  coherent.
- Role changes and deactivations are app-state only; INTEGRATION.md:318 says
  Xendit-dashboard RBAC is managed separately, and nothing here claims
  otherwise.
- Client components import the vocabulary from `@/lib/team-roles`, never
  from `@/server/data/team` (the store must not leak into the client
  bundle — the same rule that put subscription status in `lib/`).
- The UI actions follow the customer-row pattern: `useActionState` in forms
  (Add Member), direct `action(undefined, formData)` + toast +
  `router.refresh()` for menu/bulk buttons; single-member actions read
  `id`, bulk-capable actions read `ids[]` (the client sends both when the
  selection is one).

## Alternatives considered

- *Honest empty page (ADR-0019 pattern).* Rejected: unlike KYC there is no
  claim to avoid — a dashboard team is exactly the kind of record this app
  does manage, and an empty roster would make the Roles tab, bulk actions
  and the invite lifecycle unverifiable.
- *Map members to Xendit account management.* Rejected: INTEGRATION.md
  documents no such source for the screen (":97/:122/:318 — none; RBAC is
  Dashboard-only"); inventing an SDK surface would be the kind of
  contradiction this pass exists to remove.
