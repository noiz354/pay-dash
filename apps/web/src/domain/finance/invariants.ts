/**
 * Wave 6 — the ledger invariant checker (FINANCIAL_INVARIANTS.md).
 *
 * These are the laws of this ledger, expressed once, as executable code. The
 * checker takes a `LedgerSnapshot` and returns every violation it can find — it
 * does **not** throw on the first one, because an operator investigating a
 * financial incident needs the whole picture, not the first symptom.
 *
 * Two deliberate design choices:
 *
 *  1. **Report, never repair.** The checker has no writes. A checker that fixed
 *     what it found would destroy the evidence of how the ledger got there
 *     (same reasoning as ADR-0039: never auto-apply).
 *
 *  2. **FATAL vs WARN.** FATAL means "a number in this snapshot is wrong and
 *     money is misstated". WARN means "this shape is suspicious and a human
 *     should look". Mixing them would make the FATAL count useless as a gate.
 */

import {
  addMinor,
  cmpMinor,
  eqMinor,
  subMinor,
  sumMinor,
  zero,
  type Minor,
} from "./money";
import { isTerminal, type LedgerSnapshot, type Posting } from "./ledger";

export const INVARIANT_CODES = [
  "INV-L1", // double entry: debits == credits per group, per currency
  "INV-L2", // refunds <= captured, per payment
  "INV-L3", // payouts <= available funds
  "INV-L4", // available == opening + settled inflow - settled outflow - reserved
  "INV-L5", // available >= 0 and reserved >= 0
  "INV-L6", // no cross-currency aggregation
  "INV-L7", // terminal states are monotonic
  "INV-L8", // every amount is an integer in minor units
] as const;

export type InvariantCode = (typeof INVARIANT_CODES)[number];
export type Severity = "FATAL" | "WARN";

export type InvariantViolation = {
  readonly code: InvariantCode;
  readonly severity: Severity;
  /** What the violation is about — a group id, payment id, or "snapshot". */
  readonly subject: string;
  readonly message: string;
  /** Present when the invariant is an equality the checker could evaluate. */
  readonly expected?: string;
  readonly actual?: string;
};

export type InvariantReport = {
  readonly organizationId: string;
  readonly asOf: string;
  readonly ok: boolean;
  readonly fatalCount: number;
  readonly warnCount: number;
  readonly violations: readonly InvariantViolation[];
  /** Per-code counts — the shape the SLI and the report table consume. */
  readonly byCode: Readonly<Record<InvariantCode, number>>;
};

function describe(m: Minor): string {
  return `${m.units} ${m.currency}`;
}

/**
 * INV-L8 — every amount in the snapshot is an integer number of minor units in
 * the snapshot's currency. This runs first: if the amounts are not integers,
 * every later equality is meaningless.
 */
function checkAmountShape(snapshot: LedgerSnapshot, out: InvariantViolation[]): void {
  const seen: Array<{ subject: string; amount: Minor }> = [
    ...snapshot.postings.map((p) => ({ subject: `posting:${p.id}`, amount: p.amount })),
    ...snapshot.payments.map((p) => ({ subject: `payment:${p.id}`, amount: p.captured })),
    ...snapshot.refunds.map((r) => ({ subject: `refund:${r.id}`, amount: r.amount })),
    ...snapshot.payouts.map((p) => ({ subject: `payout:${p.id}`, amount: p.amount })),
    { subject: "balance:available", amount: snapshot.balance.available },
    { subject: "balance:reserved", amount: snapshot.balance.reserved },
    { subject: "balance:opening", amount: snapshot.balance.opening },
    { subject: "settledInflow", amount: snapshot.settledInflow },
    { subject: "settledOutflow", amount: snapshot.settledOutflow },
  ];

  for (const { subject, amount } of seen) {
    if (!Number.isFinite(amount.units) || !Number.isInteger(amount.units)) {
      out.push({
        code: "INV-L8",
        severity: "FATAL",
        subject,
        message: `Amount is not an integer number of minor units (${String(amount.units)}). Precision was lost before this snapshot.`,
        expected: "integer minor units",
        actual: String(amount.units),
      });
    }
    // INV-L6 is enforced here too: a value in a different currency inside a
    // single-currency snapshot is a cross-currency aggregation waiting to happen.
    if (amount.currency !== snapshot.currency) {
      out.push({
        code: "INV-L6",
        severity: "FATAL",
        subject,
        message: `Snapshot currency is ${snapshot.currency} but this amount is ${amount.currency}. Aggregating them would produce a number that is true of neither.`,
        expected: snapshot.currency,
        actual: amount.currency,
      });
    }
  }
}

/** INV-L1 — for every posting group, the debits equal the credits. */
function checkDoubleEntry(snapshot: LedgerSnapshot, out: InvariantViolation[]): void {
  const groups = new Map<string, Posting[]>();
  for (const posting of snapshot.postings) {
    const list = groups.get(posting.groupId);
    if (list) list.push(posting);
    else groups.set(posting.groupId, [posting]);
  }

  for (const [groupId, postings] of groups) {
    // Only aggregate postings that share the snapshot currency; a foreign
    // currency posting is already reported by INV-L6 and must not be summed in.
    const local = postings.filter((p) => p.amount.currency === snapshot.currency);
    const debits = sumMinor(
      local.filter((p) => p.side === "DEBIT").map((p) => p.amount),
      snapshot.currency,
    );
    const credits = sumMinor(
      local.filter((p) => p.side === "CREDIT").map((p) => p.amount),
      snapshot.currency,
    );
    if (!eqMinor(debits, credits)) {
      out.push({
        code: "INV-L1",
        severity: "FATAL",
        subject: `group:${groupId}`,
        message: `Posting group does not balance: debits ${describe(debits)} vs credits ${describe(credits)}.`,
        expected: describe(debits),
        actual: describe(credits),
      });
    }
    // A negative posting amount means the sign was used to express direction,
    // which double-entry expresses with `side`. Two encodings of direction is
    // how a group balances arithmetically while meaning the wrong thing.
    for (const p of local) {
      if (p.amount.units < 0) {
        out.push({
          code: "INV-L1",
          severity: "FATAL",
          subject: `posting:${p.id}`,
          message: `Posting amount is negative (${describe(p.amount)}); direction belongs to side=${p.side}, not the sign.`,
          expected: ">= 0",
          actual: String(p.amount.units),
        });
      }
    }
  }
}

/** INV-L2 — the sum of non-failed refunds never exceeds what was captured. */
function checkRefundsWithinCapture(snapshot: LedgerSnapshot, out: InvariantViolation[]): void {
  const capturedByPayment = new Map<string, Minor>();
  for (const payment of snapshot.payments) {
    capturedByPayment.set(payment.id, payment.captured);
  }

  const refundedByPayment = new Map<string, Minor>();
  for (const refund of snapshot.refunds) {
    // A failed or cancelled refund moved no money and must not count against
    // the capture — otherwise a retried refund would look like an over-refund.
    if (refund.status === "FAILED" || refund.status === "CANCELLED") continue;
    const current = refundedByPayment.get(refund.paymentId) ?? zero(snapshot.currency);
    refundedByPayment.set(refund.paymentId, addMinor(current, refund.amount));
  }

  for (const [paymentId, refunded] of refundedByPayment) {
    const captured = capturedByPayment.get(paymentId);
    if (!captured) {
      out.push({
        code: "INV-L2",
        severity: "FATAL",
        subject: `payment:${paymentId}`,
        message: `Refund(s) totalling ${describe(refunded)} reference a payment that is not in the snapshot.`,
        expected: "a known captured payment",
        actual: "missing payment",
      });
      continue;
    }
    if (cmpMinor(refunded, captured) > 0) {
      out.push({
        code: "INV-L2",
        severity: "FATAL",
        subject: `payment:${paymentId}`,
        message: `Refunds exceed the captured amount by ${describe(subMinor(refunded, captured))}.`,
        expected: `<= ${describe(captured)}`,
        actual: describe(refunded),
      });
    }
  }
}

/** INV-L3 — money out never exceeds the funds that exist to pay it. */
function checkPayoutsWithinFunds(snapshot: LedgerSnapshot, out: InvariantViolation[]): void {
  const committed = sumMinor(
    snapshot.payouts
      .filter((p) => p.status !== "FAILED" && p.status !== "CANCELLED")
      .map((p) => p.amount),
    snapshot.currency,
  );
  const fundsEverAvailable = addMinor(snapshot.balance.opening, snapshot.settledInflow);
  if (cmpMinor(committed, fundsEverAvailable) > 0) {
    out.push({
      code: "INV-L3",
      severity: "FATAL",
      subject: "snapshot",
      message: `Committed payouts ${describe(committed)} exceed the funds ever available ${describe(fundsEverAvailable)} — the ledger is paying out money it never received.`,
      expected: `<= ${describe(fundsEverAvailable)}`,
      actual: describe(committed),
    });
  }
}

/**
 * INV-L4 — the balance the application shows is exactly what the movements
 * derive. This is the invariant that catches a screen disagreeing with its
 * own data source (the original sin ADR-0011 was written to fix).
 */
function checkBalanceDerivation(snapshot: LedgerSnapshot, out: InvariantViolation[]): void {
  const derived = subMinor(
    subMinor(addMinor(snapshot.balance.opening, snapshot.settledInflow), snapshot.settledOutflow),
    snapshot.balance.reserved,
  );
  if (!eqMinor(derived, snapshot.balance.available)) {
    out.push({
      code: "INV-L4",
      severity: "FATAL",
      subject: "balance:available",
      message: `Reported available balance does not equal opening + settled inflow − settled outflow − reserved.`,
      expected: describe(derived),
      actual: describe(snapshot.balance.available),
    });
  }
}

/** INV-L5 — neither the available balance nor the reservation may be negative. */
function checkNonNegative(snapshot: LedgerSnapshot, out: InvariantViolation[]): void {
  if (snapshot.balance.available.units < 0) {
    out.push({
      code: "INV-L5",
      severity: "FATAL",
      subject: "balance:available",
      message: `Available balance is negative (${describe(snapshot.balance.available)}).`,
      expected: ">= 0",
      actual: String(snapshot.balance.available.units),
    });
  }
  if (snapshot.balance.reserved.units < 0) {
    out.push({
      code: "INV-L5",
      severity: "FATAL",
      subject: "balance:reserved",
      message: `Reserved amount is negative (${describe(snapshot.balance.reserved)}); a reservation releases by reducing to zero, never by going below it.`,
      expected: ">= 0",
      actual: String(snapshot.balance.reserved.units),
    });
  }
}

/** INV-L7 — once terminal, a subject never transitions again. */
function checkTerminalMonotonicity(snapshot: LedgerSnapshot, out: InvariantViolation[]): void {
  const terminalAt = new Map<string, { status: string; at: string }>();
  const ordered = [...snapshot.transitions].sort((a, b) => a.at.localeCompare(b.at));

  for (const t of ordered) {
    const already = terminalAt.get(t.subjectId);
    if (already) {
      out.push({
        code: "INV-L7",
        severity: "FATAL",
        subject: t.subjectId,
        message: `Transitioned ${t.from} → ${t.to} at ${t.at} after reaching terminal ${already.status} at ${already.at}.`,
        expected: `no transition after ${already.status}`,
        actual: `${t.from} → ${t.to}`,
      });
      continue;
    }
    if (isTerminal(t.to)) {
      terminalAt.set(t.subjectId, { status: t.to, at: t.at });
    }
  }
}

/**
 * Run every invariant against a snapshot.
 *
 * Order matters only for readability of the output: shape first (INV-L8/L6),
 * then structural (L1), then financial (L2/L3/L4/L5), then lifecycle (L7).
 */
export function checkLedgerInvariants(snapshot: LedgerSnapshot): InvariantReport {
  const violations: InvariantViolation[] = [];

  checkAmountShape(snapshot, violations);
  // If the shape is broken, the arithmetic checks below would report confusing
  // downstream noise. Report the shape problems on their own.
  const shapeBroken = violations.some((v) => v.code === "INV-L8" || v.code === "INV-L6");
  if (!shapeBroken) {
    checkDoubleEntry(snapshot, violations);
    checkRefundsWithinCapture(snapshot, violations);
    checkPayoutsWithinFunds(snapshot, violations);
    checkBalanceDerivation(snapshot, violations);
    checkNonNegative(snapshot, violations);
  }
  checkTerminalMonotonicity(snapshot, violations);

  const byCode = Object.fromEntries(INVARIANT_CODES.map((c) => [c, 0])) as Record<InvariantCode, number>;
  let fatalCount = 0;
  let warnCount = 0;
  for (const v of violations) {
    byCode[v.code] += 1;
    if (v.severity === "FATAL") fatalCount += 1;
    else warnCount += 1;
  }

  return {
    organizationId: snapshot.organizationId,
    asOf: snapshot.asOf,
    ok: fatalCount === 0,
    fatalCount,
    warnCount,
    violations,
    byCode,
  };
}
