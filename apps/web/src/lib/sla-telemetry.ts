import { trackEvent } from "@/lib/analytics-events";

// Wave 4 §3 — `sla_breached` emission (W4-SLA).
//
// The contract in the analytics catalog says "emitted once per item per band".
// This module owns that dedupe. It is deliberately *not* inside the SLA engine:
// `lib/sla.ts` must stay pure (deterministic, server-safe), while telemetry is
// a client-side side effect tied to what the operator was actually shown.

export type SlaBreachSubject = {
  /** Stable entity id (transaction id, payout batch id, …). */
  id: string;
  /** Catalog entity type, e.g. `failed_payment`, `transaction_settlement`. */
  entityType: string;
  band: string;
  /** Seconds since the anchor — reported as `age_sec`. */
  ageSeconds: number | null;
  /** The policy window in seconds — reported as `sla_sec`. */
  dueSeconds: number | null;
};

export type SlaBreachTelemetryOptions = {
  /** Screen id for traceability (`scr` prop). */
  scr?: string;
  /** Inject a store to observe dedupe in tests; defaults to a module-level set. */
  seen?: Set<string>;
};

function defaultSeen(): Set<string> {
  const g = globalThis as unknown as { __kineticSlaBreachSeen?: Set<string> };
  if (!g.__kineticSlaBreachSeen) g.__kineticSlaBreachSeen = new Set<string>();
  return g.__kineticSlaBreachSeen;
}

/**
 * Emit `sla_breached` for every breached subject not already reported in this
 * session (per item **and** per band: an escalation OVERDUE → CRITICAL is a new
 * signal, a re-render of the same breach is not). Returns how many events were
 * newly emitted so callers and tests can assert exact-once behaviour.
 */
export function reportSlaBreaches(subjects: readonly SlaBreachSubject[], options: SlaBreachTelemetryOptions = {}): number {
  const seen = options.seen ?? defaultSeen();
  let emitted = 0;
  for (const s of subjects) {
    const breached = s.band === "OVERDUE" || s.band === "CRITICAL";
    if (!breached) continue;
    const key = `${s.entityType}:${s.id}:${s.band}`;
    if (seen.has(key)) continue;
    seen.add(key);
    trackEvent("sla_breached", {
      entity_type: s.entityType,
      band: s.band,
      age_sec: s.ageSeconds ?? undefined,
      sla_sec: s.dueSeconds ?? undefined,
      scr: options.scr,
    });
    emitted++;
  }
  return emitted;
}
