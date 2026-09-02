# 0020 — Report builder: a query the app can run

Date: 2026-09-02
Status: Accepted

## Context

`/reports/builder` (Custom Reports Builder) was the app's last pure mockup:
every one of its ~10 affordances had no handler, and its "Live Preview" was
five invented rows.

1. **Invented preview** — hard-coded `txn_1Nj8V2…` ids that exist nowhere in
   the store (real ids look like `txn_05dkphc1`), "Oct 24" dates (the data is
   2026-08/09), four customer emails absent from the customer store,
   **corrupted USD amounts** (`,250.00`, `,500.00` — leading digits missing)
   under an **Amount (USD)** header in an IDR app, and a fabricated
   **"Showing 1,248 rows" / "1-50 of 1,248"** (actual ledger: 46 rows).
2. **No state at all** — the data-source radios, the date inputs (hard-coded
   `2023-10-01/31`), the 7D/30D/YTD presets, the filter Add/× buttons, the
   column checkboxes, Apply, Reset, Schedule, **Export CSV** and the
   pagination chevron all had no handler. The page claimed a live query the
   app never ran.
3. **`bg-white` ×3, `bg-amber-50` ×1** palette literals; no `metadata`.
4. The txn-id cells were styled clickable with no destination — while
   `/transactions/[id]` exists.

The constraint that shaped KYC does **not** apply here: INTEGRATION.md
(:89/:109) documents this screen as `Transaction.getAllTransactions({filters})`,
and the v7 SDK product list includes `Transaction`. The report is a query over
data the app already owns — and the stores already ship `toCsv()`
(transactions.ts:430) and `customersToCsv()` (customers.ts:348), so even the
CSV export is a fact the app can truthfully produce.

## Decision

The page states exactly what it owns, and runs a real query:

**1. A query engine the client can run** (`lib/report-options.ts`,
client-safe): per-source column definitions, status vocabulary (the real
`TRANSACTION_STATUSES` / `PAYOUT_STATUSES` / `CUSTOMER_STATUSES` — no
invented options), row mappers from the store types (type-only imports),
`runQuery` (date range + status + amount bounds), and `buildReportCsv`
(RFC-style quoting; raw values, not display-formatted). The server page
passes the full row sets (46 ledger rows, 5 batches, 11 customers —
deterministic seed) to a client `<ReportBuilder>`; filtering, projection and
CSV are pure transforms over the app's own rows. No new store, no API
round-trip, no SDK call.

**2. Data sources: the stores that exist** — Transactions / Payouts /
Customers. **Disputes is dropped** (no disputes model exists anywhere in the
app — the closest fact is ledger status `REFUNDED`), with a footnote on-page
saying where refund facts live. Same pattern as ADR-0019's Beneficial Owners.

**3. Every control is real** — date range actually filters (7D/30D/YTD set
real ranges from today); the status filter uses the source's real vocabulary;
the amount min/max filter the source's amount (transaction amount / batch
total / lifetime value) **in IDR**; the column checkboxes drive both the
preview and the CSV; Reset restores defaults; the query runs live (there is
no Apply — nothing is staged).

**4. The preview is the data** — real rows, real count chip (`N of M rows`),
`formatMoney` IDR, real customer emails and method labels, status chips in
the app's status tokens, and the id cell links to the real detail page
(`/transactions/[id]`, `/payouts/[id]`, `/customers/[id]`). Zero matches show
an `EmptyState` with a working "Clear filters" action.

**5. Export CSV actually downloads** — a client Blob built by
`buildReportCsv` from exactly the filtered rows and selected columns
(`kinetic-<source>-<date>.csv`); disabled when the preview is empty. The
footer says so plainly: the CSV contains exactly what you see.

**6. Dropped without a model** — **Schedule** (no scheduling store, not in
the documented SDK surface for this screen) and the fake pagination (46 rows
fit one view; the count chip replaces the invented "1-50 of 1,248").

**7. Tokens & metadata** — `bg-white`/`bg-amber-50` → tokens; `metadata`
added.

## Consequences

- The page's headline claim ("the preview and CSV export run over your
  actual data") is true by construction: every displayed value comes from
  the stores, and the download is a pure function of the visible rows.
- The support page's "Reporting & Export → /reports/builder" deep-link
  (ADR-0016) now lands on a page that works.
- The CSV uses raw values (ISO dates, numeric amounts) — an export for
  spreadsheets, not a pretty-printed view.
- Row sets are the whole in-memory stores; a restart regenerates them
  deterministically (seed `mulberry32(20260901)`), so counts are stable.

## Alternatives considered

- *Server-action query per config change.* Rejected: the full sets are ~60
  rows the page already fetched for the preview; a round-trip per keystroke
  buys nothing and adds pending states the page doesn't need.
- *Keep "Disputes" as a fourth source mapped to refunded transactions.*
  Rejected: relabelling a status filter as a data source invents a model the
  app doesn't have; the footnote + status filter covers the fact honestly.
- *Keep "Schedule".* Rejected: no store, no SDK surface, and a scheduler that
  can't run would be the same class of no-op button the page shipped with.

## Verification

- **Unit** — `src/lib/report-options.test.ts` (10): mappers against the real
  stores (detail links, IDR display, batch total = Σ recipients, lifetime
  value, success-rate %); `runQuery` (empty query, status/amount/date,
  zero-match → `[]`, not an error); default column selection; CSV header =
  selected columns, raw values; csv quoting (comma/quote/newline);
  `parseAmountFilter` bounds.
- **Gate** — `pnpm typecheck` clean; `pnpm lint` 0 errors; vitest green
  (245).
- **SSR (dev server, 2026-09-02)** — `/en/reports/builder` renders the real
  rows (46 real `txn_…` ids, `Rp` amounts), "46 of 46 rows", all real
  controls; no `1,248`/`txn_1Nj8V2`/`Amount (USD)`/`sarah.jenkins`/
  `Schedule`/`Apply`/`bg-white`/`amber-50`.
- **E2E** — `e2e/reports.spec.ts` (6, serial, CI-runnable): invented
  artifacts absent + real id links to `/en/transactions/…`; source switch
  re-queries (11 customers / 5 batches); filters narrow live (REFUNDED →
  2 of 46; date; 7D preset; Reset); column checkboxes drive the preview;
  **Export CSV downloads** a 2-row file whose header is exactly the default
  selected columns; zero matches → empty state + disabled export.
  `uat-journeys.spec.ts` **F3** (previously red against the prototype — it
  asserted a `QRIS` checkbox and `IDR 1,000,000.00` that never existed on
  the page) rewritten to assert the real builder.
- Manual procedure: `docs/audit/reports-test-procedure-2026-09-02.md`.
