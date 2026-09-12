import "server-only";

/**
 * Wave 6 — build a `LedgerSnapshot` from whatever the app is currently using as
 * its source of truth.
 *
 * This is the seam. Today the dashboard stores are the in-memory
 * `globalThis` seam documented in `docs/AUDIT_DATA_SOURCES.md`; tomorrow they
 * are Prisma (ADR-0027). The invariant checker and the reconciliation engine
 * never learn which one they got — they only ever see a `LedgerSnapshot`.
 *
 * Two rules this module holds:
 *
 *  1. **It reports what the app believes, it does not fix it.** If the store's
 *     balance disagrees with its own movements, the snapshot carries the
 *     disagreement so the checker can find it. A "helpful" correction here
 *     would make the checker permanently green and permanently useless.
 *
 *  2. **Postings are derived, not invented.** The current `LedgerEntry` model is
 *     single-sided (`prisma/schema.prisma`: one `amount`, no account, no
 *     counterparty), so the app has no double-entry data yet. Rather than
 *     fabricate balanced pairs — which would make INV-L1 trivially true and
 *     prove nothing — this builder emits **no postings at all** and reports
 *     `doubleEntryAvailable: false`. INV-L1 becomes meaningful the day the
 *     ledger grows a posting table, and the report says so honestly.
 */

import { fromLegacyNumber, minor, zero, type Minor } from "@/domain/finance/money";
import type {
  BalanceAssertion,
  LedgerSnapshot,
  LifecycleStatus,
  PaymentRecord,
  PayoutRecord,
  RefundRecord,
  StatusTransition,
} from "@/domain/finance/ledger";
import { getLedgerRows, type Transaction } from "@/server/data/transactions";
import type { TenantScope } from "@/domain/security/tenant";
import { getPayoutBatches } from "@/server/data/payouts";
import { getBalanceOverview, listMovements, OPENING_BALANCE } from "@/server/data/balance";

const CURRENCY = "IDR";

export type SnapshotBuildResult = {
  snapshot: LedgerSnapshot;
  /**
   * False while the persistence layer has no double-entry postings. INV-L1 is
   * reported as NOT_APPLICABLE rather than silently passing on zero postings.
   */
  doubleEntryAvailable: boolean;
  /** Where the numbers came from — surfaced in the report so no one over-reads them. */
  source: "in-memory-store" | "prisma";
};

/** Map the app's transaction status vocabulary to the canonical lifecycle. */
function lifecycleOf(status: Transaction["status"]): LifecycleStatus {
  switch (status) {
    case "SUCCEEDED":
    case "REFUNDED":
      return "SUCCEEDED";
    case "FAILED":
      return "FAILED";
    case "PROCESSING":
      return "PROCESSING";
    default:
      return "PENDING";
  }
}

/**
 * What a transaction actually captured.
 *
 * The store's `net` is amount − fee, and `balance.ts` books `net` into the
 * balance. The capture ceiling for refunds, however, is the **gross** amount
 * the customer paid: a merchant refunds what the customer paid, not what the
 * merchant kept after fees. Using `net` here would make a legitimate full
 * refund look like an over-refund.
 */
function capturedOf(tx: Transaction): Minor {
  if (tx.status === "SUCCEEDED" || tx.status === "REFUNDED") {
    return fromLegacyNumber(tx.amount, CURRENCY);
  }
  return zero(CURRENCY);
}

function paymentsFrom(rows: readonly Transaction[]): PaymentRecord[] {
  return rows.map((tx) => ({
    id: tx.id,
    status: lifecycleOf(tx.status),
    captured: capturedOf(tx),
    createdAt: tx.createdAt,
  }));
}

/**
 * Refunds are not first-class rows in the in-memory store — a transaction
 * carries a `refundedAmount` scalar. One synthetic refund record per
 * transaction with a non-zero refunded amount preserves the INV-L2 relationship
 * exactly (Σ refunds ≤ captured) without inventing detail the store lacks.
 */
function refundsFrom(rows: readonly Transaction[]): RefundRecord[] {
  const out: RefundRecord[] = [];
  for (const tx of rows) {
    if (tx.refundedAmount > 0) {
      out.push({
        id: `${tx.id}:refund`,
        paymentId: tx.id,
        status: "SUCCEEDED",
        amount: fromLegacyNumber(tx.refundedAmount, CURRENCY),
        createdAt: tx.updatedAt,
      });
    }
  }
  return out;
}

function payoutsFrom(): PayoutRecord[] {
  const out: PayoutRecord[] = [];
  for (const batch of getPayoutBatches()) {
    for (const r of batch.recipients) {
      const status: LifecycleStatus =
        r.status === "PAID" ? "SUCCEEDED" : r.status === "FAILED" ? "FAILED" : "PENDING";
      out.push({
        id: r.id,
        batchId: batch.id,
        status,
        amount: fromLegacyNumber(r.amount, batch.currency ?? CURRENCY),
        createdAt: batch.createdAt,
      });
    }
  }
  return out;
}

/**
 * Transitions the stores can actually evidence. The transaction timeline
 * (`tx.events`) is prose, not a typed state log, so the only transitions we can
 * assert without inventing history are the terminal ones each row has reached.
 * One terminal transition per subject can never violate INV-L7 — which is the
 * honest answer: **the current stores cannot evidence a monotonicity breach**,
 * and the report says that rather than implying the check found nothing wrong.
 */
function transitionsFrom(rows: readonly Transaction[]): StatusTransition[] {
  const out: StatusTransition[] = [];
  for (const tx of rows) {
    const lifecycle = lifecycleOf(tx.status);
    if (lifecycle === "SUCCEEDED" || lifecycle === "FAILED") {
      out.push({ subjectId: tx.id, from: "PROCESSING", to: lifecycle, at: tx.updatedAt });
    }
  }
  return out;
}

/**
 * Settled inflow / outflow, derived with the *same* rules `balance.ts` uses:
 * a SUCCEEDED transaction contributes its `net`; a refund reduces the balance;
 * a PAID payout recipient is settled outflow; a PENDING recipient is a
 * reservation, not an outflow. Top-ups are inflow.
 *
 * These deliberately mirror `deriveMovements()`/`effectOf()` so that INV-L4
 * tests the store's *own* claim about `available` against the store's *own*
 * movement rules. A divergence means the balance page and its data source
 * disagree — precisely the class of bug ADR-0011 was written to eliminate.
 */
async function settlementTotals(scope: TenantScope): Promise<{ settledInflow: Minor; settledOutflow: Minor }> {
  // Enumerate the balance module's OWN movement list — the same rows the
  // /balance page renders — rather than re-implementing its derivation here.
  // Two independent implementations of one rule is how a checker ends up
  // agreeing with a bug. `listMovements` with a large page size and no filter
  // returns the complete movement set.
  const { rows } = await listMovements(scope, { range: "all", pageSize: 100_000, page: 1 });

  let inflow = 0;
  let outflow = 0;
  for (const m of rows) {
    // Only settled movements have left or entered the balance. A PENDING
    // withdrawal is a reservation (carried separately) and a PENDING
    // settlement has not landed yet — this mirrors `effectOf()` in balance.ts.
    if (m.status !== "SETTLED") continue;
    if (m.amount >= 0) inflow += m.amount;
    else outflow += -m.amount;
  }

  return {
    settledInflow: fromLegacyNumber(inflow, CURRENCY),
    settledOutflow: fromLegacyNumber(outflow, CURRENCY),
  };
}

/**
 * Build the snapshot for an organization.
 *
 * NOTE on tenancy: the current in-memory stores are **not** organization-scoped
 * (see `TENANT_ISOLATION_REPORT.md` / INV-T1). The `organizationId` recorded on
 * the snapshot is therefore the *requested* scope, and the caller is told via
 * `source` that the underlying data is a single process-wide store. Wave 7
 * makes the store scoped; this function's signature does not change when it does.
 */
export async function buildLedgerSnapshot(
  scope: TenantScope,
  now: Date = new Date(),
): Promise<SnapshotBuildResult> {
  const rows = getLedgerRows(scope);
  const overview = await getBalanceOverview(scope);

  const opening = OPENING_BALANCE;
  const { settledInflow, settledOutflow } = await settlementTotals(scope);

  const balance: BalanceAssertion = {
    opening: fromLegacyNumber(opening, CURRENCY),
    available: fromLegacyNumber(overview.available, CURRENCY),
    reserved: fromLegacyNumber(overview.reserved, CURRENCY),
  };

  const snapshot: LedgerSnapshot = {
    organizationId: scope.organizationId,
    currency: CURRENCY,
    asOf: now.toISOString(),
    // No posting table exists yet — see the module docblock. Emitting nothing is
    // the honest representation; INV-L1 is reported NOT_APPLICABLE upstream.
    postings: [],
    payments: paymentsFrom(rows),
    refunds: refundsFrom(rows),
    payouts: payoutsFrom(),
    transitions: transitionsFrom(rows),
    balance,
    settledInflow,
    settledOutflow,
  };

  return { snapshot, doubleEntryAvailable: false, source: "in-memory-store" };
}

/** Convenience for scripts/tests: build a snapshot from explicit parts. */
export function snapshotFromParts(parts: {
  organizationId: string;
  currency?: string;
  asOf?: string;
  payments?: PaymentRecord[];
  refunds?: RefundRecord[];
  payouts?: PayoutRecord[];
  openingMinor?: number;
  availableMinor?: number;
  reservedMinor?: number;
  settledInflowMinor?: number;
  settledOutflowMinor?: number;
}): LedgerSnapshot {
  const currency = (parts.currency ?? CURRENCY).toUpperCase();
  return {
    organizationId: parts.organizationId,
    currency,
    asOf: parts.asOf ?? new Date().toISOString(),
    postings: [],
    payments: parts.payments ?? [],
    refunds: parts.refunds ?? [],
    payouts: parts.payouts ?? [],
    transitions: [],
    balance: {
      opening: minor(parts.openingMinor ?? 0, currency),
      available: minor(parts.availableMinor ?? 0, currency),
      reserved: minor(parts.reservedMinor ?? 0, currency),
    },
    settledInflow: minor(parts.settledInflowMinor ?? 0, currency),
    settledOutflow: minor(parts.settledOutflowMinor ?? 0, currency),
  };
}
