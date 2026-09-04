import { z } from "zod";

/**
 * Event projection (event-projection). Idempotent canonical projectors update a
 * resource's canonical status from provider events. They must be monotonic for
 * terminal states, reject version/out-of-order regressions, and never grant a
 * success from an unknown provider status.
 */

export type ProjectionStatus = string;

export interface ProjectionResource {
  id: string;
  organizationId: string;
  canonicalStatus: ProjectionStatus;
  providerStatus: ProjectionStatus | null;
  version: number;
  updatedAt: string;
}

export interface ProjectionEvent {
  eventId: string;
  provider: "xendit" | "stripe";
  resourceId: string;
  observedProviderStatus: ProjectionStatus;
  occurredAt: string;
}

export type ProjectionErrorCode = "STALE_VERSION" | "OUT_OF_ORDER" | "UNKNOWN_STATUS" | "NOT_FOUND";

export class ProjectionError extends Error {
  constructor(
    readonly code: ProjectionErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProjectionError";
  }
}

/** Monotonic terminal statuses (per resource type). */
const TERMINAL_CANONICAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "REVOKED", "PAID", "RETURNED"]);

/**
 * A per-resource mapping from provider status to the canonical non-success and
 * success statuses a projector may write. Unknown provider values are mapped to
 * a safe non-success `UNKNOWN` and must never become a success.
 */
export interface CanonicalStatusMap {
  /** provider status that is a terminal non-success. */
  readonly terminalFailure: readonly string[];
  /** provider status that is a terminal success. */
  readonly terminalSuccess: readonly string[];
  /** provider status that is a safe unknown. */
  readonly unknown: readonly string[];
}

export function canonicalsForProviderStatus(map: CanonicalStatusMap, providerStatus: string): ProjectionStatus {
  if (map.terminalFailure.includes(providerStatus)) {
    return "FAILED";
  }
  if (map.terminalSuccess.includes(providerStatus)) {
    return "SUCCEEDED";
  }
  if (map.unknown.includes(providerStatus)) {
    return "UNKNOWN";
  }
  // Any un-mapped/future value is conservatively UNKNOWN, never success.
  return "UNKNOWN";
}

/** True if a status is a terminal success that a projector may not regress from. */
export function isTerminalSuccess(status: ProjectionStatus): boolean {
  return TERMINAL_CANONICAL_STATUSES.has(status);
}

/**
 * Guard an in-memory representation of a projector update. It enforces:
 *  - expected version matching (optimistic concurrency);
 *  - no regression from a terminal success / terminal status;
 *  - unknown provider status cannot produce success.
 */
export function projectStatusUpdate(input: {
  resource: ProjectionResource | null;
  event: ProjectionEvent;
  map: CanonicalStatusMap;
  expectedVersion: number;
}): ProjectionResource {
  const { resource, event, map, expectedVersion } = input;
  if (!resource) {
    throw new ProjectionError("NOT_FOUND", "Cannot project an event for an unknown resource");
  }
  if (resource.version !== expectedVersion) {
    throw new ProjectionError("STALE_VERSION", "Projection is stale; expected a different version");
  }

  const nextCanonical = canonicalsForProviderStatus(map, event.observedProviderStatus);
  const isTerminal = isTerminalSuccess(resource.canonicalStatus);
  if (isTerminal) {
    // A terminal success must not regress to a different status.
    if (resource.canonicalStatus !== nextCanonical) {
      throw new ProjectionError("OUT_OF_ORDER", "Cannot regress a terminal projection");
    }
    return { ...resource, providerStatus: event.observedProviderStatus, updatedAt: event.occurredAt };
  }

  return {
    ...resource,
    canonicalStatus: nextCanonical,
    providerStatus: event.observedProviderStatus,
    version: expectedVersion + 1,
    updatedAt: event.occurredAt,
  };
}

export const ProjectionEventSchema = z.object({
  eventId: z.string().min(1),
  provider: z.enum(["xendit", "stripe"]),
  resourceId: z.string().min(1),
  observedProviderStatus: z.string().min(1),
  occurredAt: z.string().datetime(),
});
export type ProjectionEventInput = z.infer<typeof ProjectionEventSchema>;

export function parseProjectionEvent(value: unknown): ProjectionEventInput {
  return ProjectionEventSchema.parse(value);
}
