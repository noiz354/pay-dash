# Team — manual test procedure (2026-09-02)

Run `pnpm dev` from `apps/web` and start at
`http://localhost:3000/en/team`. The store is in-memory and seeded with six
members on the merchant's own `@acmecorp.com` domain (deterministic,
date-relative): 5 active (Daniel Wirawan · Admin, Michael Chen · Developer,
Sarah Anderson · Analyst, Priya Nair · Developer, Kevin Halim · Analyst) and
1 invite (Elena Jenkins · Risk Analyst, invited 3 days ago). A restart
returns the page to this state.

## A. The page is the data

1. Heading **Team & Permissions**, subline "Invites expire in 7 days";
   header actions **Export** and **Add Member**.
2. Members tab: **5 members**, "Showing 1 to 5 of 5" — no "24", no
   `@ledger.com` / `@ledgerscale.io` addresses anywhere.
3. Rows: initials avatars, real emails, role chips with icons, token status
   chips (Active), **Last Active** from real timestamps ("2m ago", "1h
   ago", "3h ago", "26h ago", "9d ago").
4. The invite is **not** a member row: search "elena" in the Members tab →
   empty state "No members match these filters".

## B. Search, filter, pagination (URL state)

1. Search "chen" → exactly Michael Chen; URL gains `?q=chen`; the toolbar's
   "5 members" becomes a **Clear (1)** button (the count while filtered).
   Clearing restores "5 members".
2. Role filter **Developer** → exactly Michael Chen + Priya Nair; URL
   `?role=DEVELOPER`; **Clear (2)** restores.
3. Role filter **Risk Analyst** → empty state (the only risk analyst is an
   unaccepted invite — honest, not a hidden row).
4. Export with `?role=DEVELOPER` active downloads a 2-row CSV (the filter is
   mirrored server-side); unfiltered downloads all 6 (the invite included —
   the export is the store, not the tab).

## C. Pending Invites — derived, never contradictory

1. Tab → exactly **Elena Jenkins**, `elena.j@acmecorp.com`, "Risk Analyst ·
   invited 3d ago (expires in 7 days)", Invited chip, **Resend** + **Revoke**.
2. No "no pending invitations" copy while an invite exists.
3. **Resend** → toast "Invite re-sent to elena.j@acmecorp.com."; the
   "invited" age resets.
4. **Revoke** → Elena disappears; the tab shows the real empty state
   "No pending invitations" (now true).

## D. Add Member — the invite round trip

1. **Add Member** → dialog (Full name, Email, Role). Empty/bad input →
   inline server errors ("Enter the member's name.", "Enter a valid email
   address.").
2. Submit "Anna Wijaya" / `anna@acmecorp.com` / Analyst → success view
   "Invite sent"; **Done** closes.
3. Pending Invites now lists Anna (and Elena, if not revoked): the invite
   was never a silent success.
4. **Invite another** re-opens the form; revoking Anna returns the tab to
   its previous state.

## E. Selection, bulk actions, row menus

1. Check Michael Chen + Priya Nair → bar reads **2 selected**.
2. Bulk role **Admin** + **Change Role** → toast "Role updated for 2
   members."; both chips now read Admin (Roles tab counts move with them).
3. Check Sarah Anderson → **Deactivate** → toast "Member deactivated.";
   chip "Deactivated", last active dimmed, her ⋮ menu now offers
   **Reactivate**.
4. **Reactivate** → toast "Sarah Anderson reactivated."; chip "Active"
   again.
5. Deactivated members stay visible (they left the role counts, not the
   roster); the select-all checkbox selects the current page and clears
   after every action.
6. A single row's ⋮ **Change role** sub-menu lists the other three roles and
   changes only that member ("Role updated.").

## F. Roles tab — real catalog, derived counts

1. Four role rows (Admin, Developer, Analyst, Risk Analyst) with
   descriptions and permission chips.
2. **Members** counts active members per role and move when you change a
   role or deactivate someone (Admin 1 · Developer 2 · Analyst 2 · Risk 0 in
   the seeded state).

## G. Export

1. **Export** (no filters) → `team-YYYY-MM-DD.csv`, header
   `id,name,email,role,status,joined_at,invited_at,last_active_at`, one row
   per member, `mem_…` ids, invited rows with empty `joined_at` and a filled
   `invited_at`.
2. With `q` / `role` in the URL, the CSV is filtered identically (same
   contract as `/api/exports/customers`).

## H. Regression guards (what must be gone)

- `@ledger.com`, `@ledgerscale.io`, "0 selected", "of 24", "coming soon",
  `bg-white` / emerald / amber literals in the page, the
  Invited-row-vs-empty-pending-tab contradiction.
