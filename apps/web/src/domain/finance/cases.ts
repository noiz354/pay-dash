/**
 * Wave 6 — exception / case management (priority area 7).
 *
 * Detection without a workflow is just a louder alarm. Wave 5 added signals;
 * what is missing is the object that makes a signal *someone's job*: an owner,
 * a state, an audit trail, and a resolution that cannot be faked.
 *
 * The state machine is deliberately small. Every extra state is a place where
 * a case can get stuck, and a stuck financial exception is indistinguishable
 * from an ignored one.
 *
 *   OPEN ──acknowledge──▶ ACKNOWLEDGED ──resolve──▶ RESOLVED
 *     │                        │
 *     └────────escalate────────┴──▶ ESCALATED ──resolve──▶ RESOLVED
 *
 * Rules with teeth:
 *  - You cannot resolve a case you never acknowledged. (No silent close.)
 *  - Resolution requires a reason and an actor. Always.
 *  - A RESOLVED case is terminal; re-opening means a NEW case that links back,
 *    so the history of "we thought this was fixed" is never overwritten.
 *  - A case created from a FATAL signal cannot be resolved as WONT_FIX.
 */

export const CASE_TYPES = [
  "RECON_MISMATCH",
  "PAYOUT_FAILURE",
  "WEBHOOK_FAILURE",
  "SLA_BREACH",
  "AMBIGUOUS_OPERATION",
  "INVARIANT_VIOLATION",
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_STATES = ["OPEN", "ACKNOWLEDGED", "ESCALATED", "RESOLVED"] as const;
export type CaseState = (typeof CASE_STATES)[number];

export type CaseSeverity = "FATAL" | "WARN";

export const RESOLUTIONS = ["FIXED", "FALSE_POSITIVE", "WONT_FIX", "DUPLICATE"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export class CaseError extends Error {
  constructor(
    readonly code:
      | "INVALID_TRANSITION"
      | "RESOLVE_WITHOUT_ACK"
      | "MISSING_REASON"
      | "TERMINAL"
      | "FATAL_WONT_FIX",
    message: string,
  ) {
    super(message);
    this.name = "CaseError";
  }
}

export type CaseEvent = {
  readonly at: string;
  readonly actorId: string;
  readonly from: CaseState;
  readonly to: CaseState;
  readonly note: string;
};

export type ExceptionCase = {
  readonly id: string;
  readonly organizationId: string;
  readonly type: CaseType;
  readonly severity: CaseSeverity;
  readonly state: CaseState;
  /** The thing that went wrong, in the operator's language. */
  readonly summary: string;
  /** Stable key so the same underlying problem does not open 400 cases. */
  readonly dedupeKey: string;
  readonly openedAt: string;
  readonly assigneeId: string | null;
  readonly resolution: Resolution | null;
  readonly history: readonly CaseEvent[];
};

export function openCase(input: {
  id: string;
  organizationId: string;
  type: CaseType;
  severity: CaseSeverity;
  summary: string;
  dedupeKey: string;
  at: string;
}): ExceptionCase {
  return {
    id: input.id,
    organizationId: input.organizationId,
    type: input.type,
    severity: input.severity,
    state: "OPEN",
    summary: input.summary,
    dedupeKey: input.dedupeKey,
    openedAt: input.at,
    assigneeId: null,
    resolution: null,
    history: [],
  };
}

const ALLOWED: Record<CaseState, readonly CaseState[]> = {
  OPEN: ["ACKNOWLEDGED", "ESCALATED"],
  ACKNOWLEDGED: ["ESCALATED", "RESOLVED"],
  ESCALATED: ["RESOLVED"],
  RESOLVED: [],
};

function transition(c: ExceptionCase, to: CaseState, actorId: string, note: string, at: string): ExceptionCase {
  if (c.state === "RESOLVED") {
    throw new CaseError(
      "TERMINAL",
      `Case ${c.id} is RESOLVED. Open a new case linked to it rather than reviving this one — the record of the first resolution must survive.`,
    );
  }
  if (!ALLOWED[c.state].includes(to)) {
    throw new CaseError("INVALID_TRANSITION", `Case ${c.id} cannot move ${c.state} → ${to}.`);
  }
  return {
    ...c,
    state: to,
    history: [...c.history, { at, actorId, from: c.state, to, note }],
  };
}

export function acknowledgeCase(c: ExceptionCase, actorId: string, at: string, note = "acknowledged"): ExceptionCase {
  return { ...transition(c, "ACKNOWLEDGED", actorId, note, at), assigneeId: actorId };
}

export function escalateCase(c: ExceptionCase, actorId: string, at: string, note: string): ExceptionCase {
  if (!note.trim()) throw new CaseError("MISSING_REASON", "Escalation requires a reason.");
  return transition(c, "ESCALATED", actorId, note, at);
}

/**
 * Close a case.
 *
 * Two refusals worth spelling out. First, resolving an OPEN case is blocked:
 * if nobody acknowledged it, nobody looked at it, and "resolved" would be a
 * lie the audit log then preserves forever. Second, a FATAL case cannot be
 * closed WONT_FIX — a fatal financial exception is by definition not something
 * you decline to fix; if it is genuinely not fatal, fix the classifier.
 */
export function resolveCase(
  c: ExceptionCase,
  input: { actorId: string; at: string; resolution: Resolution; reason: string },
): ExceptionCase {
  if (!input.reason.trim()) {
    throw new CaseError("MISSING_REASON", `Resolving ${c.id} requires a written reason.`);
  }
  if (c.state === "OPEN") {
    throw new CaseError(
      "RESOLVE_WITHOUT_ACK",
      `Case ${c.id} is still OPEN — acknowledge it before resolving, so the record shows someone actually looked at it.`,
    );
  }
  if (c.severity === "FATAL" && input.resolution === "WONT_FIX") {
    throw new CaseError(
      "FATAL_WONT_FIX",
      `Case ${c.id} is FATAL and cannot be closed as WONT_FIX. Either fix it or correct its severity — silently declining a fatal financial exception is how losses become permanent.`,
    );
  }
  const moved = transition(c, "RESOLVED", input.actorId, `${input.resolution}: ${input.reason}`, input.at);
  return { ...moved, resolution: input.resolution };
}

/** Dedupe key so one recurring problem is one case, not a flood. */
export function caseDedupeKey(type: CaseType, organizationId: string, subject: string): string {
  return `${organizationId}:${type}:${subject}`;
}

/**
 * Fold a batch of detected signals into cases, reusing any open case with the
 * same dedupe key. Returns the cases to create and the ones already covered.
 */
export function reconcileCases(
  existing: readonly ExceptionCase[],
  signals: readonly { dedupeKey: string; type: CaseType; severity: CaseSeverity; summary: string; organizationId: string }[],
  idFor: (dedupeKey: string) => string,
  at: string,
): { created: ExceptionCase[]; suppressed: string[] } {
  const openKeys = new Set(existing.filter((c) => c.state !== "RESOLVED").map((c) => c.dedupeKey));
  const created: ExceptionCase[] = [];
  const suppressed: string[] = [];
  const seen = new Set<string>();

  for (const s of signals) {
    if (openKeys.has(s.dedupeKey) || seen.has(s.dedupeKey)) {
      suppressed.push(s.dedupeKey);
      continue;
    }
    seen.add(s.dedupeKey);
    created.push(
      openCase({
        id: idFor(s.dedupeKey),
        organizationId: s.organizationId,
        type: s.type,
        severity: s.severity,
        summary: s.summary,
        dedupeKey: s.dedupeKey,
        at,
      }),
    );
  }
  return { created, suppressed };
}

/** Cases breaching their response SLA — what a shift handover is built from. */
export function breachedCases(
  cases: readonly ExceptionCase[],
  slaMinutes: Record<CaseSeverity, number>,
  now: Date,
): ExceptionCase[] {
  return cases.filter((c) => {
    if (c.state === "RESOLVED") return false;
    const ageMin = (now.getTime() - Date.parse(c.openedAt)) / 60_000;
    return ageMin > slaMinutes[c.severity];
  });
}
