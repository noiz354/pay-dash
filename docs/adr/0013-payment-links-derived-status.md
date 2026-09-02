# 0013 — Payment Links: a real store, and status the merchant never sets

Date: 2026-09-02
Status: Accepted

## Context

`/payments/links` was the setup checklist's third stop ("Configure Routing
Rules") and still shipped the prototype: four hard-coded rows (one with the
literal amount `",250.00"`), `IDR 500,000.00` figures that belonged to no
ledger row, `Single Links` / `Multiple Links` tabs that were `href="#"`, a
filter icon with no filter, and a "Showing 1 to 5 of 24 results" footer with
no page 2. The page also oversold its name — it configured no routing rules,
it was a list of payment requests.

The store had no equivalent: nothing in the app could answer "what is the
status of this link?". The prototype's statuses (Settled / Pending / Expired)
were decorative strings on the hard-coded rows. Meanwhile the ledger
(ADR-0006) already settles money, the balance (ADR-0011) already accounts for
it, and `createTransaction` already supports externally-referenced payments
(`id = referenceId`) — the exact shape a link payment needs.

## Decision

**1. A link is a merchant-authored payment request; its status is derived,
never stored.** `PaymentLink { kind: "single" | "multiple", items[],
payerEmail?, createdAt, expiresAt?, cancelledAt?, paidAt?, currency: "IDR" }`
lives in a `__kineticLinksStore` in-memory store (`src/server/data/links.ts`,
the ADR-0011 pattern) with eight seeded links covering all four statuses.
`deriveLinkStatus(link, paidReferenceIds)` applies one precedence:
**cancelled → paid → expired → open**. "Paid" means either a `paidAt`
(seeded pre-window history, exactly as the balance store carries pre-window
settlements) *or* a SUCCEEDED ledger row whose `referenceId` is the link id —
so a payment the merchant can see in the ledger is the thing that flips the
pill. The merchant's only state writes are `create` and `close
(cancelledAt)`; expiry is the clock; payment is the ledger.

**2. The three merchant actions are the whole surface.**
- **Create** — `createPaymentLinkAction` validates kind-conditional rules
  (single: amount ≥ Rp 10,000; multiple: 2–20 line items, each ≥ Rp 1,000)
  through one zod schema with a `superRefine`, so a multiple link is never
  rejected by the single-amount floor. Payer email and a 7/30-day expiry are
  optional. The dialog (`?new=1` deep link, `useActionState` +
  `useFormStatus`) is open for both kinds — single shows one amount field,
  multiple shows add/remove line-item rows with a client-side running total.
  Success shows the server-generated id and its checkout URL
  (`https://pay.kinetic.test/<id>`, `CopyButton`) with *View link* / *Done* /
  *Create another*.
- **Close** — `expirePaymentLinkAction` sets `cancelledAt` on an OPEN link
  only; paid, expired and already-closed links throw (the money already moved
  or the door is already shut).
- **Simulate payment (TEST MODE)** — `payPaymentLinkAction` →
  `recordLinkPayment` creates a SUCCEEDED ledger transaction with
  `id = referenceId = link id` (the `createTransaction` convention for
  externally-referenced payments) and captures it immediately, then sets
  `paidAt`. The ledger row is the payment: the balance moves
  (`revalidatePath` on `/transactions`, `/balance`, `/dashboard`), and the
  link's pill flips to **Paid** purely by derivation — no status field
  written. A paid link's *View payment* button leads to the real
  `/transactions/<id>` detail page; seeded pre-window payments have no ledger
  row and deliberately offer no such exit.

**3. The list is one URL-driven view per kind.** `?kind=single` (default,
parameter-free) / `?kind=multiple` tabs; `?q` (debounced search over id,
payer email, item labels), `?status`, `?page` (10/page, `TablePagination`)
behave like the balance, ledger and batch toolbars. Rows are
`ClickableRow`s to `/payments/links/[id]`; both empty states (filters vs. no
links for this kind) offer the matching exit.

**4. The detail page is the destination of every row.** Breadcrumb, id +
derived pill + copy, checkout URL card with copy, items + total (every
figure through `formatMoney` IDR — the `",250.00"` literal is gone),
payer/created/expires/paid/closed rows, a status note that explains what
each state means and what can still happen, and the actions gated by state:
close + simulate only when OPEN, *View payment* only when the ledger has the
row. `not-found.tsx` for unknown ids.

**5. The setup step says what the page does.** The checklist's "Configure
Routing Rules" (step `routing`, `href: /payments/links`) is retitled
**"Create a Payment Link"** with a description that matches the page — the
page has never configured routing, and the app has no routing store to
configure.

## Consequences

- No surface can claim a link status the stores cannot back: cancelled is a
  merchant write, paid is ledger-derived, expired is the clock, open is the
  residue. The same two stores (`transactions`, `links`) already reconcile
  through `referenceId`, so a simulated payment is visible in exactly the
  places money is supposed to appear.
- `recordLinkPayment` mutates a ledger row in place (PENDING → SUCCEEDED) —
  the same idiom as `retryTransaction` / `refundTransaction`; in TEST MODE a
  link payment that sat in PENDING would never settle on its own.
- The dashboard checklist's `routing` step is still self-attested (there is
  no "a link exists" ground truth worth deriving — the first link is a
  behaviour, not a state); ADR-0012's note about it is now accurate.
- Eight seeded links pre-date the ledger window for their payments, so the
  `paidAt`-without-ledger-row path is exercised by seeds, not just by
  simulation.

## Alternatives considered

- *Store a `status` field on the link and update it on payment.* Rejected:
  two sources of truth (ledger says succeeded, link says open) is exactly
  the drift the whole app is built to avoid; derivation makes disagreement
  impossible.
- *A real payer checkout page (pay.kinetic.test).* Out of scope for the
  prototype: no auth, no channels, no host page. The URL is what the merchant
  sends; TEST MODE simulation stands in for the payer and exercises the same
  ledger path a real capture would.
- *Routing-rules page to match the old checklist title.* Rejected: the
  product has no routing model; inventing one for a setup-step label is the
  fabrication this audit removes.
- *Expire = delete.* Rejected: closed links are audit data (a merchant needs
  to know they closed it, when, and that nothing was charged).

## Verification

- **Unit** — `src/server/data/links.test.ts` (21 tests): seed coverage
  (8 links; 3 open / 2 paid / 2 expired / 1 cancelled; sorted; totals),
  filters (kind, status, q over id/email/label) and pagination (pages,
  clamping), `deriveLinkStatus` precedence (cancelled > paid; paidAt vs.
  ledger-reference; expired vs. open), `createLink`, `expireLink` guards
  (unknown / already closed / paid), `recordLinkPayment` (ledger row with
  `id = referenceId = link id`, SUCCEEDED, `paidAt` set, no double-pay, no
  pay-after-close); `link-status-pill.test.tsx` (labels + colour classes).
- **Gate** — `pnpm typecheck` clean; `pnpm lint` 0 errors; 19 test files /
  196 unit tests green.
- **SSR (dev server, 2026-09-02)** — `/en/payments/links` renders the five
  single links (`plink_8x9a2b1c`, `plink_3k4m5n6p`, `plink_9q8w7e6r`,
  `plink_7f8g9h0j`, `plink_4c5d6e7f`) with `Rp` IDR figures and no
  `",250.00"`; `?kind=multiple` renders the three multiple links with
  `Rp 58.750.000` / `Rp 27.500.000` / `Rp 21.200.000`; `?status=PAID`
  renders exactly the two seeded paid links; the detail page renders the
  checkout URL, close + simulate actions and the items card; unknown ids
  render the not-found state.
- **E2E** — `e2e/links.spec.ts` (10 tests, serial): tab/count/amount
  assertions, URL filters + clear, row → detail with copyable checkout URL
  and no *View payment* for seeded pre-window payments, not-found, create
  round-trips for both kinds (success panel, `?new=1` cleanup, row lands
  first), simulate → toast + Paid pill + *View payment* → real ledger row,
  close → Cancelled with actions removed, expired/cancelled detail notes.
  Runs in CI (Playwright browser not installable in this sandbox).
- Manual procedure: `docs/audit/links-test-procedure-2026-09-02.md`.
