// Wave 4 — ANA-* analytics contract (spec §26) + Wave 4 operational events.
//
// Design rule: **no PII, ever.** Rather than trusting call sites to avoid
// leaking emails/names/account numbers, every event declares an explicit
// *allowlist* of property keys. `trackEvent` drops anything not declared and
// runs a redaction pass over the values that survive, so a well-intentioned
// `track("x", { email })` cannot reach the wire.
//
// Notable spec deviation (documented in IMPLEMENTATION_PROGRESS):
// ANA-010 specifies a raw `query` prop for the palette. A palette query is
// free text an operator may type a customer email or name into, so we emit
// `query_length` + `result_count` instead of the query itself. The success
// metric ("power usage 30%") is still measurable.

import { track } from "./analytics";

/** Every property key that may appear on the wire. Anything else is dropped. */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export type EventSpec = {
  /** Stable event name sent to the tracker. */
  name: string;
  /** Registry id for traceability (ANA-001..014, or W4-* for Wave 4 additions). */
  registry: string;
  /** Allowlisted property keys. Props outside this list are stripped. */
  props: readonly string[];
};

/**
 * Canonical event catalog. Adding an event here is the only way to make it
 * emittable — `trackEvent` is typed against these keys.
 */
export const ANALYTICS_EVENTS = {
  // --- spec §26 funnel (ANA-001..014) -------------------------------------
  auth_started: { name: "auth_started", registry: "ANA-001", props: ["method", "scr"] },
  auth_completed: { name: "auth_completed", registry: "ANA-001", props: ["method", "role", "duration_ms", "scr"] },
  payment_created: { name: "payment_created", registry: "ANA-002", props: ["amount", "currency", "method", "channel", "jrn", "scr"] },
  refund_requested: { name: "refund_requested", registry: "ANA-003", props: ["amount", "currency", "jrn", "scr"] },
  refund_executed: { name: "refund_executed", registry: "ANA-003", props: ["amount", "currency", "actor_diff", "jrn", "scr"] },
  link_created: { name: "link_created", registry: "ANA-004", props: ["max_redemptions", "jrn", "scr"] },
  link_paid: { name: "link_paid", registry: "ANA-004", props: ["max_redemptions", "jrn", "scr"] },
  balance_topup: { name: "balance_topup", registry: "ANA-005", props: ["amount", "currency", "delta_correct", "jrn", "scr"] },
  balance_withdraw: { name: "balance_withdraw", registry: "ANA-005", props: ["amount", "currency", "delta_correct", "jrn", "scr"] },
  payout_bulk_created: { name: "payout_bulk_created", registry: "ANA-006", props: ["row_count", "skipped", "currency", "jrn", "scr"] },
  payout_approved: { name: "payout_approved", registry: "ANA-007", props: ["batch_id", "role", "recipient_count", "jrn", "scr"] },
  payout_retried: { name: "payout_retried", registry: "ANA-007", props: ["batch_id", "role", "retry_count", "jrn", "scr"] },
  nav_used: { name: "nav_used", registry: "ANA-008", props: ["section", "role", "surface", "href"] },
  filter_applied: { name: "filter_applied", registry: "ANA-009", props: ["filter_key", "result_count", "scr"] },
  filter_cleared: { name: "filter_cleared", registry: "ANA-009", props: ["filter_key", "result_count", "scr"] },
  search_performed: { name: "search_performed", registry: "ANA-009", props: ["query_length", "result_count", "scr"] },
  palette_opened: { name: "palette_opened", registry: "ANA-010", props: ["role", "surface"] },
  palette_invoked: { name: "palette_invoked", registry: "ANA-010", props: ["query_length", "result_count", "category", "role"] },
  empty_cta_clicked: { name: "empty_cta_clicked", registry: "ANA-011", props: ["scr", "cta"] },
  error_shown: { name: "error_shown", registry: "ANA-012", props: ["code", "scr", "surface"] },
  stale_refreshed: { name: "stale_refreshed", registry: "ANA-013", props: ["age_sec", "scr"] },
  key_rotated: { name: "key_rotated", registry: "ANA-014", props: ["key_prefix", "jrn", "scr"] },
  ip_added: { name: "ip_added", registry: "ANA-014", props: ["count", "jrn", "scr"] },

  // --- Wave 4 operational events ------------------------------------------
  /** A cross-role journey began (handoff opened by Role A). */
  journey_started: {
    name: "journey_started",
    registry: "W4-JRN",
    props: ["journey", "from_role", "to_role", "entity_type", "scr"],
  },
  /** A cross-role journey reached a terminal state (Role B completed it). */
  journey_completed: {
    name: "journey_completed",
    registry: "W4-JRN",
    props: ["journey", "from_role", "to_role", "entity_type", "duration_ms", "outcome", "scr"],
  },
  /** A mutation was attempted and failed (validation, backend, or authz). */
  mutation_failed: {
    name: "mutation_failed",
    registry: "W4-MUT",
    props: ["mutation", "reason", "code", "scr", "retryable"],
  },
  /** An action was denied by the permission matrix (UI or server). */
  permission_denied: {
    name: "permission_denied",
    registry: "W4-AUTHZ",
    props: ["permission", "role", "surface", "scr", "entity_type"],
  },
  /** Stale data was *shown* to the user (distinct from ANA-013 refresh click). */
  stale_seen: {
    name: "stale_seen",
    registry: "W4-FRESH",
    props: ["age_sec", "scr", "surface"],
  },
  /** A 409 conflict was surfaced and then recovered (retry/refresh accepted). */
  conflict_recovered: {
    name: "conflict_recovered",
    registry: "W4-CONFLICT",
    props: ["entity_type", "resolution", "version_delta", "scr"],
  },
  /** An item crossed its SLA deadline (emitted once per item per band). */
  sla_breached: {
    name: "sla_breached",
    registry: "W4-SLA",
    props: ["entity_type", "band", "age_sec", "sla_sec", "scr"],
  },
  /** The ledger's SLA band filter was engaged (`ALL` = cleared back to every band). */
  sla_filter_applied: {
    name: "sla_filter_applied",
    registry: "W4-SLA",
    props: ["band", "result_count", "scr"],
  },
  /** A Command Center lane card was acted on (proves cards are actionable). */
  command_center_action: {
    name: "command_center_action",
    registry: "W4-CC",
    props: ["lane", "card", "role", "count", "scr"],
  },
} as const satisfies Record<string, EventSpec>;

export type AnalyticsEventKey = keyof typeof ANALYTICS_EVENTS;

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/** Property keys that are PII-bearing by name — always dropped, allowlist or not. */
const DENY_KEYS = new Set([
  "email",
  "e_mail",
  "name",
  "customer_name",
  "customer_email",
  "user_name",
  "username",
  "full_name",
  "first_name",
  "last_name",
  "phone",
  "phone_number",
  "msisdn",
  "account_number",
  "accountnumber",
  "bank_account",
  "card_number",
  "pan",
  "cvv",
  "cvc",
  "token",
  "secret",
  "password",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "session",
  "session_id",
  "user_id",
  "userId",
  "ip",
  "ip_address",
  "address",
  "birth_date",
  "dob",
  "ktp",
  "npwp",
  "nik",
  "query",
  "q",
  "search",
  "raw",
  "body",
  "payload",
]);

/** Value shapes that look like PII even under an innocuous key. */
const PII_VALUE_PATTERNS: ReadonlyArray<RegExp> = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/, // email
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // PAN
  // Indonesian mobile: +62 / 62 / 0 prefix, then 8xx, separators optional.
  // Anchors are deliberately absent — `\b` does not fire before a leading `+`.
  /(?:\+?62|0)[\s-]?8\d{1,2}[\s-]?\d{3,4}[\s-]?\d{3,4}/,
  /\b\d{16}\b/, // long digit run (NIK / account)
];

function looksLikePii(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return PII_VALUE_PATTERNS.some((re) => re.test(value));
}

/**
 * Strip everything not on the event's allowlist, then redact anything that
 * still looks like PII. Returns a fresh object — never mutates the input.
 */
export function sanitizeProps(spec: EventSpec, props?: AnalyticsProps): AnalyticsProps {
  const out: AnalyticsProps = {};
  if (!props) return out;
  for (const key of spec.props) {
    if (!(key in props)) continue;
    const value = props[key];
    if (value === undefined) continue;
    if (DENY_KEYS.has(key) || DENY_KEYS.has(key.toLowerCase())) continue;
    if (looksLikePii(value)) continue;
    if (typeof value === "string" && value.length > 120) continue; // no long free text
    out[key] = value;
  }
  return out;
}

/** True when `key` must never be transmitted. Exported for tests/lint. */
export function isDeniedKey(key: string): boolean {
  return DENY_KEYS.has(key) || DENY_KEYS.has(key.toLowerCase());
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

/**
 * Emit a catalogued analytics event. Unknown keys are a type error; props
 * outside the event's allowlist are silently dropped.
 */
export function trackEvent(event: AnalyticsEventKey, props?: AnalyticsProps): void {
  const spec = ANALYTICS_EVENTS[event];
  if (!spec) return;
  track(spec.name, { ...sanitizeProps(spec, props), registry: spec.registry });
}

/** Registry id (ANA-001, W4-SLA, …) for an event — used in traceability docs. */
export function registryOf(event: AnalyticsEventKey): string {
  return ANALYTICS_EVENTS[event].registry;
}
