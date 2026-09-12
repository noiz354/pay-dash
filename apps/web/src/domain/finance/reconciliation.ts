/**
 * Wave 6 — three-way financial reconciliation (internal ↔ provider ↔ settlement).
 *
 * The dashboard can currently only agree with itself: every figure is derived
 * from one store, so "consistent" and "correct" are indistinguishable. This
 * matcher introduces the second and third opinions.
 *
 * Three sides:
 *   INTERNAL    — what our ledger believes happened
 *   PROVIDER    — what Xendit/Stripe reports (the authority on whether the API
 *                 call took effect)
 *   SETTLEMENT  — what actually reached/left the bank account (the authority on
 *                 whether the money moved)
 *
 * Design rules that matter:
 *
 *  1. **Never resolve, only report.** Every disagreement becomes an exception
 *     with a type and both observed values. Auto-correcting would destroy the
 *     evidence of how the divergence occurred (same rule as ADR-0039).
 *
 *  2. **An absent side is not an empty side.** If the provider is unreachable
 *     we do not have "zero provider records" — we have no opinion. Treating the
 *     first as the second would raise MISSING_PROVIDER on every row in the
 *     book and bury the real exceptions. `SideInput` makes this explicit.
 *
 *  3. **Deterministic.** Same input ⇒ byte-identical run, so two operators
 *     investigating the same window see the same thing.
 */

import { eqMinor, type Minor } from "./money";

export const EXCEPTION_TYPES = [
  "MISSING_INTERNAL", // provider/settlement know it, our ledger does not
  "MISSING_PROVIDER", // we and/or the bank know it, the provider does not
  "MISSING_SETTLEMENT", // booked and confirmed, but the money never landed
  "AMOUNT_MISMATCH",
  "CURRENCY_MISMATCH",
  "STATUS_MISMATCH",
  "DUPLICATE_PROVIDER", // the same external ref appears twice on one side
  "STALE_PENDING", // still not terminal long after it should be
] as const;

export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

/** Where an observation came from. */
export type ReconSide = "INTERNAL" | "PROVIDER" | "SETTLEMENT";

/** Terminal-ish status vocabulary the three sides are normalized into. */
export type ReconStatus = "SUCCEEDED" | "FAILED" | "PENDING" | "UNKNOWN";

export type ReconRecord = {
  /** The key all three sides agree on — a merchant reference / external id. */
  readonly externalRef: string;
  readonly organizationId: string;
  readonly amount: Minor;
  readonly status: ReconStatus;
  /** When the side observed it — used for STALE_PENDING only. */
  readonly observedAt: string;
  /** Free-form provenance for the operator (provider id, batch id, …). */
  readonly note?: string;
};

/**
 * One side of the reconciliation.
 *
 * `available: false` means "we could not ask" — the run proceeds with the sides
 * it has and records that the answer is partial. This is the difference between
 * "the provider has no such payment" and "the provider is down".
 */
export type SideInput =
  | { readonly available: true; readonly records: readonly ReconRecord[] }
  | { readonly available: false; readonly reason: string };

export type ReconciliationException = {
  readonly type: ExceptionType;
  readonly externalRef: string;
  readonly organizationId: string;
  readonly severity: "FATAL" | "WARN";
  readonly message: string;
  /** The sides that had an opinion about this ref. */
  readonly present: readonly ReconSide[];
  readonly detail?: Readonly<Record<string, string>>;
};

export type ReconciliationTotals = {
  readonly recordsCompared: number;
  readonly matched: number;
  readonly exceptions: number;
  readonly byType: Readonly<Record<ExceptionType, number>>;
};

export type ReconciliationRun = {
  readonly runId: string;
  readonly organizationId: string;
  readonly window: { readonly from: string; readonly to: string };
  /** Which sides actually contributed. A partial run is never a clean run. */
  readonly sidesAvailable: Readonly<Record<ReconSide, boolean>>;
  readonly partial: boolean;
  readonly unavailableReasons: Readonly<Partial<Record<ReconSide, string>>>;
  readonly matched: readonly string[];
  readonly exceptions: readonly ReconciliationException[];
  readonly totals: ReconciliationTotals;
};

export type ReconcileInput = {
  readonly organizationId: string;
  readonly window: { readonly from: string; readonly to: string };
  readonly internal: SideInput;
  readonly provider: SideInput;
  readonly settlement: SideInput;
  /** A pending record older than this (from `window.to`) is STALE_PENDING. */
  readonly stalePendingAfterHours?: number;
  /** Injected for deterministic run ids in tests. */
  readonly runId?: string;
};

const DEFAULT_STALE_HOURS = 24;

function emptyByType(): Record<ExceptionType, number> {
  return Object.fromEntries(EXCEPTION_TYPES.map((t) => [t, 0])) as Record<ExceptionType, number>;
}

/**
 * Index a side by `externalRef`, reporting duplicates rather than silently
 * keeping the last one. A duplicate on the provider side is one of the clearest
 * double-charge signals there is.
 */
function indexSide(
  records: readonly ReconRecord[],
  side: ReconSide,
  organizationId: string,
  out: ReconciliationException[],
): Map<string, ReconRecord> {
  const map = new Map<string, ReconRecord>();
  const counted = new Set<string>();
  for (const r of records) {
    // A record belonging to another tenant must never be reconciled into this
    // run (INV-T1/T2). Silently including it would let one tenant's provider
    // data shape another tenant's book.
    if (r.organizationId !== organizationId) continue;
    const existing = map.get(r.externalRef);
    if (existing) {
      if (!counted.has(r.externalRef)) {
        out.push({
          type: "DUPLICATE_PROVIDER",
          externalRef: r.externalRef,
          organizationId,
          severity: "FATAL",
          message: `${side} reports ${r.externalRef} more than once — a duplicate on this side means the same movement was recorded twice.`,
          present: [side],
          detail: { side, first: existing.note ?? "", second: r.note ?? "" },
        });
        counted.add(r.externalRef);
      }
      continue;
    }
    map.set(r.externalRef, r);
  }
  return map;
}

function hoursBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 3_600_000;
}

/**
 * Compare the sides that are available for one reference.
 *
 * Comparisons are only made between sides that actually reported. A missing
 * side produces a MISSING_* exception exactly once, and only when at least one
 * other side has a **non-failed** opinion — a failed payment that the provider
 * never created is not a discrepancy, it is the expected outcome.
 */
function compareRef(
  ref: string,
  organizationId: string,
  sides: { internal?: ReconRecord; provider?: ReconRecord; settlement?: ReconRecord },
  available: Record<ReconSide, boolean>,
  staleAfterHours: number,
  windowTo: string,
  out: ReconciliationException[],
): boolean {
  const present: ReconSide[] = [];
  if (sides.internal) present.push("INTERNAL");
  if (sides.provider) present.push("PROVIDER");
  if (sides.settlement) present.push("SETTLEMENT");

  const observed = [sides.internal, sides.provider, sides.settlement].filter(
    (r): r is ReconRecord => Boolean(r),
  );
  const before = out.length;

  // --- presence ---------------------------------------------------------
  // Only a movement that someone believes succeeded is expected everywhere.
  const anySucceeded = observed.some((r) => r.status === "SUCCEEDED");

  if (available.INTERNAL && !sides.internal && anySucceeded) {
    out.push({
      type: "MISSING_INTERNAL",
      externalRef: ref,
      organizationId,
      severity: "FATAL",
      message: `Money moved according to ${present.join("/")} but our ledger has no record of ${ref}.`,
      present,
    });
  }
  if (available.PROVIDER && !sides.provider && anySucceeded) {
    out.push({
      type: "MISSING_PROVIDER",
      externalRef: ref,
      organizationId,
      severity: "FATAL",
      message: `${present.join("/")} report ${ref} as settled but the provider has no such record.`,
      present,
    });
  }
  if (available.SETTLEMENT && !sides.settlement && anySucceeded) {
    out.push({
      type: "MISSING_SETTLEMENT",
      externalRef: ref,
      organizationId,
      severity: "FATAL",
      message: `${ref} is booked as succeeded but never appeared in settlement — the money has not landed.`,
      present,
    });
  }

  // --- value comparisons (pairwise across whatever reported) ------------
  for (let i = 0; i < observed.length; i += 1) {
    for (let j = i + 1; j < observed.length; j += 1) {
      const a = observed[i];
      const b = observed[j];
      if (a.amount.currency !== b.amount.currency) {
        out.push({
          type: "CURRENCY_MISMATCH",
          externalRef: ref,
          organizationId,
          severity: "FATAL",
          message: `Currency disagreement on ${ref}: ${a.amount.currency} vs ${b.amount.currency}.`,
          present,
          detail: { a: a.amount.currency, b: b.amount.currency },
        });
        continue; // amounts in different currencies are not comparable
      }
      if (!eqMinor(a.amount, b.amount)) {
        out.push({
          type: "AMOUNT_MISMATCH",
          externalRef: ref,
          organizationId,
          severity: "FATAL",
          message: `Amount disagreement on ${ref}: ${a.amount.units} vs ${b.amount.units} ${a.amount.currency}.`,
          present,
          detail: { a: String(a.amount.units), b: String(b.amount.units), currency: a.amount.currency },
        });
      }
      // A side still PENDING while another is terminal is a timing artefact,
      // not a contradiction — it is caught by STALE_PENDING if it persists.
      const bothTerminal = a.status !== "PENDING" && b.status !== "PENDING";
      if (bothTerminal && a.status !== b.status) {
        out.push({
          type: "STATUS_MISMATCH",
          externalRef: ref,
          organizationId,
          severity: "FATAL",
          message: `Status disagreement on ${ref}: ${a.status} vs ${b.status}.`,
          present,
          detail: { a: a.status, b: b.status },
        });
      }
    }
  }

  // --- staleness --------------------------------------------------------
  for (const r of observed) {
    if (r.status !== "PENDING") continue;
    const age = hoursBetween(r.observedAt, windowTo);
    if (age > staleAfterHours) {
      out.push({
        type: "STALE_PENDING",
        externalRef: ref,
        organizationId,
        severity: "WARN",
        message: `${ref} has been PENDING for ${age.toFixed(1)}h (threshold ${staleAfterHours}h) — it should have reached a terminal state by now.`,
        present,
        detail: { ageHours: age.toFixed(1) },
      });
      break; // one staleness exception per ref is enough to action it
    }
  }

  return out.length === before;
}

export function reconcile(input: ReconcileInput): ReconciliationRun {
  const { organizationId, window } = input;
  const staleAfterHours = input.stalePendingAfterHours ?? DEFAULT_STALE_HOURS;
  const exceptions: ReconciliationException[] = [];

  const available: Record<ReconSide, boolean> = {
    INTERNAL: input.internal.available,
    PROVIDER: input.provider.available,
    SETTLEMENT: input.settlement.available,
  };
  const unavailableReasons: Partial<Record<ReconSide, string>> = {};
  if (!input.internal.available) unavailableReasons.INTERNAL = input.internal.reason;
  if (!input.provider.available) unavailableReasons.PROVIDER = input.provider.reason;
  if (!input.settlement.available) unavailableReasons.SETTLEMENT = input.settlement.reason;

  const internal = input.internal.available
    ? indexSide(input.internal.records, "INTERNAL", organizationId, exceptions)
    : new Map<string, ReconRecord>();
  const provider = input.provider.available
    ? indexSide(input.provider.records, "PROVIDER", organizationId, exceptions)
    : new Map<string, ReconRecord>();
  const settlement = input.settlement.available
    ? indexSide(input.settlement.records, "SETTLEMENT", organizationId, exceptions)
    : new Map<string, ReconRecord>();

  // Sorted so the run is deterministic regardless of input iteration order.
  const refs = [...new Set([...internal.keys(), ...provider.keys(), ...settlement.keys()])].sort();

  const matched: string[] = [];
  for (const ref of refs) {
    const clean = compareRef(
      ref,
      organizationId,
      { internal: internal.get(ref), provider: provider.get(ref), settlement: settlement.get(ref) },
      available,
      staleAfterHours,
      window.to,
      exceptions,
    );
    if (clean) matched.push(ref);
  }

  const byType = emptyByType();
  for (const e of exceptions) byType[e.type] += 1;

  const partial = !available.INTERNAL || !available.PROVIDER || !available.SETTLEMENT;

  return {
    runId: input.runId ?? `recon_${organizationId}_${window.from}_${window.to}`,
    organizationId,
    window,
    sidesAvailable: available,
    partial,
    unavailableReasons,
    matched,
    exceptions,
    totals: {
      recordsCompared: refs.length,
      matched: matched.length,
      exceptions: exceptions.length,
      byType,
    },
  };
}

/**
 * The SLI feeding the reconciliation-cleanliness SLO (§5 of WAVE_6_PLAN).
 * A partial run returns `null`: you cannot claim a cleanliness percentage when
 * one of the sides did not answer.
 */
export function reconciliationCleanliness(run: ReconciliationRun): number | null {
  if (run.partial) return null;
  if (run.totals.recordsCompared === 0) return 1;
  return run.totals.matched / run.totals.recordsCompared;
}
