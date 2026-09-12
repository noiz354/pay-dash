/**
 * Wave 6 — business SLOs, SLIs and error budgets.
 *
 * The repository already measures *technical* latency (`lib/sla.ts` bands, web
 * vitals). None of it answers the question an operator is actually paid to
 * answer: **is the money flowing correctly, and how much margin is left before
 * we must stop shipping?**
 *
 * Three deliberate choices:
 *
 *  1. **Business SLIs, not CPU graphs.** "Payout success ratio" and
 *     "reconciliation cleanliness" are the indicators that correlate with
 *     customer harm. p99 render time does not.
 *
 *  2. **A good-events/valid-events ratio.** Every SLI is `good / valid`, so the
 *     error budget is a count of events, not a vague percentage. When an
 *     operator asks "how many more failed payouts can we absorb this month?"
 *     the answer is an integer.
 *
 *  3. **Unmeasured is not healthy.** An SLI with zero valid events returns
 *     `NO_DATA`, never 100%. A dashboard that shows green because nothing was
 *     observed is worse than one that shows nothing — it actively misleads.
 */

export type SloId =
  | "payment-success"
  | "payout-success"
  | "webhook-processing"
  | "reconciliation-cleanliness"
  | "ambiguous-resolution"
  | "api-availability";

export type BurnSeverity = "OK" | "WARNING" | "CRITICAL" | "EXHAUSTED" | "NO_DATA";

export type SloDefinition = {
  readonly id: SloId;
  /** What the user experiences when this is broken — written for a human. */
  readonly userImpact: string;
  /** The fraction of valid events that must be good, e.g. 0.995. */
  readonly objective: number;
  readonly windowDays: number;
  /** What counts as a valid event (the denominator). Ambiguity here is fatal. */
  readonly validEvents: string;
  /** What counts as good (the numerator). */
  readonly goodEvents: string;
  /** Where the numbers come from today. "NOT_INSTRUMENTED" is an honest answer. */
  readonly source: string;
};

/**
 * The Wave 6 SLO catalogue.
 *
 * Targets are deliberately *achievable-but-meaningful*. Inventing 99.99% for a
 * system that has never measured itself would produce a permanently-breached
 * budget that everyone learns to ignore.
 */
export const SLO_CATALOGUE: readonly SloDefinition[] = [
  {
    id: "payment-success",
    userImpact: "A customer tries to pay and the attempt fails for a reason that is our fault.",
    objective: 0.995,
    windowDays: 30,
    validEvents: "Payment attempts that reached the provider, excluding customer-side declines.",
    goodEvents: "Attempts reaching a terminal SUCCEEDED state.",
    source: "DurableOperation(operationType='payment.*')",
  },
  {
    id: "payout-success",
    userImpact: "A merchant's payout does not arrive, or arrives late.",
    objective: 0.99,
    windowDays: 30,
    validEvents: "Payout releases accepted by the platform.",
    goodEvents: "Releases confirmed PAID by the provider without manual intervention.",
    source: "DurableOperation(operationType='payout.release')",
  },
  {
    id: "webhook-processing",
    userImpact: "A provider event is lost, so the dashboard shows a stale or wrong status.",
    objective: 0.999,
    windowDays: 30,
    validEvents: "Verified webhook deliveries received.",
    goodEvents: "Deliveries processed to SUCCEEDED (dedupe counts as success).",
    source: "WebhookDelivery.processingStatus",
  },
  {
    id: "reconciliation-cleanliness",
    userImpact: "Our books disagree with the provider or the bank and nobody notices.",
    objective: 0.995,
    windowDays: 30,
    validEvents: "References compared in a complete (non-partial) reconciliation run.",
    goodEvents: "References matching on all available sides.",
    source: "domain/finance/reconciliation.reconciliationCleanliness()",
  },
  {
    id: "ambiguous-resolution",
    userImpact: "Money is in an unknown state and stays there — the worst state to be in.",
    objective: 0.99,
    windowDays: 30,
    validEvents: "Operations that entered UNKNOWN.",
    goodEvents: "Operations resolved to a terminal state within 15 minutes.",
    source: "server/finance/unknown-recovery.agedUnknownOperations()",
  },
  {
    id: "api-availability",
    userImpact: "The dashboard or API is unreachable.",
    objective: 0.995,
    windowDays: 30,
    validEvents: "Non-health HTTP requests to /api/*.",
    goodEvents: "Requests answered with status < 500.",
    source: "NOT_INSTRUMENTED — requires request-level metrics (see WAVE_6_PLAN §5).",
  },
];

export function sloById(id: SloId): SloDefinition {
  const found = SLO_CATALOGUE.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown SLO "${id}"`);
  return found;
}

export type SliMeasurement = {
  readonly sloId: SloId;
  readonly good: number;
  readonly valid: number;
  readonly windowStart: string;
  readonly windowEnd: string;
};

export type ErrorBudget = {
  readonly sloId: SloId;
  readonly objective: number;
  /** null when there is no data — never silently 1. */
  readonly sli: number | null;
  /** Events we were allowed to fail in this window. */
  readonly budgetEvents: number;
  /** Events we actually failed. */
  readonly spentEvents: number;
  readonly remainingEvents: number;
  /** 0 = untouched, 1 = exactly exhausted, >1 = breached. */
  readonly burnedFraction: number | null;
  readonly severity: BurnSeverity;
  readonly summary: string;
};

const WARNING_AT = 0.5;
const CRITICAL_AT = 0.9;

/**
 * Compute the error budget for one measurement.
 *
 * The budget is expressed in *events* because that is the unit a human can act
 * on. "You have 12 failed payouts left this month" changes behaviour;
 * "0.4% remaining" does not.
 */
export function errorBudget(m: SliMeasurement): ErrorBudget {
  const def = sloById(m.sloId);

  if (m.valid < 0 || m.good < 0) {
    throw new Error(`Negative event counts for ${m.sloId}: good=${m.good} valid=${m.valid}`);
  }
  if (m.good > m.valid) {
    throw new Error(
      `More good than valid events for ${m.sloId} (${m.good} > ${m.valid}) — the SLI definition is being applied inconsistently.`,
    );
  }

  if (m.valid === 0) {
    return {
      sloId: m.sloId,
      objective: def.objective,
      sli: null,
      budgetEvents: 0,
      spentEvents: 0,
      remainingEvents: 0,
      burnedFraction: null,
      severity: "NO_DATA",
      summary: `No valid events observed for ${m.sloId} in this window. This is NOT a pass — the indicator is unmeasured.`,
    };
  }

  const sli = m.good / m.valid;
  const bad = m.valid - m.good;
  // Fractional budgets are floored: you cannot spend 0.4 of a failed payout,
  // and rounding up would hand out budget the objective does not permit.
  const budgetEvents = Math.floor(m.valid * (1 - def.objective));
  const remainingEvents = budgetEvents - bad;
  const burnedFraction = budgetEvents === 0 ? (bad > 0 ? Infinity : 0) : bad / budgetEvents;

  let severity: BurnSeverity;
  if (burnedFraction >= 1) severity = "EXHAUSTED";
  else if (burnedFraction >= CRITICAL_AT) severity = "CRITICAL";
  else if (burnedFraction >= WARNING_AT) severity = "WARNING";
  else severity = "OK";

  const pct = (sli * 100).toFixed(3);
  const summary =
    severity === "EXHAUSTED"
      ? `${m.sloId} is at ${pct}% against a ${(def.objective * 100).toFixed(2)}% objective — budget exhausted (${bad} bad / ${budgetEvents} allowed). Freeze risky changes.`
      : `${m.sloId} is at ${pct}% — ${remainingEvents} of ${budgetEvents} budgeted failures remaining.`;

  return {
    sloId: m.sloId,
    objective: def.objective,
    sli,
    budgetEvents,
    spentEvents: bad,
    remainingEvents,
    burnedFraction: burnedFraction === Infinity ? Infinity : Number(burnedFraction.toFixed(6)),
    severity,
    summary,
  };
}

/**
 * The release gate.
 *
 * An exhausted budget on a money-path SLO blocks a release; an unmeasured one
 * does not block, but it must be reported, because "we don't know" is a
 * different answer from "we're fine" and the two must never be merged.
 */
export function releaseGate(budgets: readonly ErrorBudget[]): {
  decision: "READY" | "CONDITIONAL" | "BLOCKED";
  blocking: readonly string[];
  unmeasured: readonly string[];
} {
  const blocking = budgets.filter((b) => b.severity === "EXHAUSTED").map((b) => b.sloId);
  const unmeasured = budgets.filter((b) => b.severity === "NO_DATA").map((b) => b.sloId);
  const critical = budgets.filter((b) => b.severity === "CRITICAL").map((b) => b.sloId);

  if (blocking.length > 0) return { decision: "BLOCKED", blocking, unmeasured };
  if (critical.length > 0 || unmeasured.length > 0) {
    return { decision: "CONDITIONAL", blocking: critical, unmeasured };
  }
  return { decision: "READY", blocking: [], unmeasured: [] };
}
