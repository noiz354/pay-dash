import "server-only";

/**
 * Wave 7A — the unscoped-ledger quarantine.
 *
 * @deprecated Every surface here is Wave 7B work in waiting. Nothing new may
 * import this module: `transactions-structural.test.ts` (S-2) fails CI when the
 * consumer set grows, and the list only ever shrinks — one module per PR, each
 * getting its own tenant-scoped DAL and its own cross-tenant tests.
 *
 * ## Why this file exists at all
 *
 * Transactions is the first vertical slice of tenant isolation, and it is
 * deliberately one slice: Wave 6 rejected "retrofit 20 data modules in one PR"
 * because a mega-diff cannot be reviewed, and an unreviewed security change is
 * a guess. Converting the transaction ledger left 12 call sites in *other*
 * modules reading `getLedgerRows()` — derived surfaces (balance, audit, risk,
 * webhooks, handoff, onboarding, command center, links, customers, invoices, the
 * finance snapshot, the report builder).
 *
 * Two bad options were available: give them a scope they had not earned (a
 * default organization — the exact defect this wave exists to remove), or leave
 * them reading a process-wide array and hope the second tenant never arrives.
 *
 * ## The third option: fail closed
 *
 * This module may only answer while the store holds **exactly one tenant**. As
 * soon as a second tenant has rows, every unscoped reader throws instead of
 * widening its view, naming the surface that tried. So the interim state is not
 * "leaky but documented" — it is "safe for a single-tenant demo deployment, and
 * loud the moment that stops being true", which is precisely the operational
 * constraint Wave 6 recorded as a standing risk.
 *
 * The `surface` argument is mandatory for the same reason: a crash that says
 * "unscoped ledger access refused" is noise; one that says
 * "…by `audit`" is a work item.
 */

import {
  countLedgerTenants,
  getLedgerRows,
  listRefundsAwaiting,
  listTransactions,
  soleLedgerOrganizationId,
  type LedgerRow,
  type ListTransactionsOptions,
  type Paginated,
  type Transaction,
  type TransactionFilters,
} from "./transactions";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

/** The frozen set of derived surfaces still reading the ledger unscoped. */
// Wave 7F retired the onboarding entry: `getOnboardingStatus(ctx)` now reads the
// ledger through the scoped `getLedgerRows(ctx)`, so the fail-closed
// single-tenant refusal (D-28) no longer gates the checklist. Eleven surfaces
// remain; shrink-only, never re-grow (WAVE_ROADMAP_7D_TO_11.md §4). The note
// lives above the array on purpose — the structural ratchet reads this literal
// as text, and a quoted surface name inside a comment would read as an entry.
// Wave 7G retired the links, risk and webhooks entries: those three DALs now
// read the ledger through the scoped `getLedgerRows(ctx)`, so the fail-closed
// single-tenant refusal (D-28) no longer gates them. Seven surfaces remain;
// shrink-only, never re-grow (WAVE_ROADMAP_7D_TO_11.md §4). The note lives
// above the array on purpose — the structural ratchet reads this literal as
// text, and a quoted surface name inside a comment would read as an entry.
export const LEGACY_LEDGER_SURFACES = [
  "audit",
  "balance",
  "command-center",
  "customers",
  "finance-snapshot",
  "handoff",
  "reports",
] as const;

export type LegacyLedgerSurface = (typeof LEGACY_LEDGER_SURFACES)[number];

export class UnscopedLedgerAccessError extends Error {
  constructor(
    readonly surface: LegacyLedgerSurface,
    readonly tenantCount: number,
    message: string,
  ) {
    super(message);
    this.name = "UnscopedLedgerAccessError";
  }
}

function refuseUnlessSingleTenant(surface: LegacyLedgerSurface): string {
  if (typeof surface !== "string" || !surface.trim()) {
    // `surface` is required so a refusal is actionable. A caller that passed
    // nothing is a bug in the caller, and saying so is clearer than pretending
    // the refusal is about the tenant count.
    throw new TypeError("Unscoped ledger access requires an explicit `surface` name (see LEGACY_LEDGER_SURFACES).");
  }
  const sole = soleLedgerOrganizationId();
  if (!sole) {
    throw new UnscopedLedgerAccessError(
      surface,
      countLedgerTenants(),
      `Unscoped ledger read by "${surface}" refused: the transaction store holds more than one tenant, so there is no "the" ledger. Scope this read (Wave 7B) — an unscoped view of a multi-tenant ledger is a cross-tenant read.`,
    );
  }
  return sole;
}

function legacyContext(surface: LegacyLedgerSurface): OrganizationContext {
  const organizationId = refuseUnlessSingleTenant(surface);
  return parseOrganizationContext({ organizationId });
}

/** Rows for the derived readers. See the module docblock for the gate. */
export function legacyLedgerRows(surface: LegacyLedgerSurface): Transaction[] {
  return getLedgerRows(legacyContext(surface));
}

/**
 * The list read for derived readers (customers/invoices derive their rows from
 * the ledger). Same gate, same single-tenant assumption.
 */
export async function legacyListTransactions(
  surface: LegacyLedgerSurface,
  filters: TransactionFilters = {},
  options: ListTransactionsOptions = {},
): Promise<Paginated<LedgerRow>> {
  // `async` on purpose: a refusal must reject the promise an `await` caller is
  // already holding, not throw synchronously out of a `.then` chain. The sync
  // readers above throw, because their callers are sync.
  return listTransactions(legacyContext(surface), filters, options);
}

/** Role B's refund queue for derived readers (handoff/notifications). */
export function legacyRefundQueue(surface: LegacyLedgerSurface): Transaction[] {
  return listRefundsAwaiting(legacyContext(surface));
}
