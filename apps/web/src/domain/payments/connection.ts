import { z } from "zod";

export const ProviderModeSchema = z.enum(["TEST", "LIVE"]);
export type ProviderMode = z.infer<typeof ProviderModeSchema>;

/**
 * Connection lifecycle. The persisted status is uppercase and provider-neutral.
 * Verifying/rotating state is server-derived; the browser never sets it.
 */
export const ConnectionStatusSchema = z.enum([
  "DRAFT",
  "CONNECTING",
  "VERIFYING",
  "ACTION_REQUIRED",
  "ACTIVE",
  "DEGRADED",
  "ROTATION_REQUIRED",
  "DISCONNECTING",
  "DISCONNECTED",
  "FAILED",
  "REVOKED",
]);

export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

export const CONNECTION_STATUSES: readonly ConnectionStatus[] =
  ConnectionStatusSchema.options as readonly ConnectionStatus[];

/**
 * Allowed transitions.
 *
 * `REVOKED` is terminal for a connection's usable lifetime. `ACTIVE` is not
 * permanent: a capability/webhook regression drives DEGRADED, ACTION_REQUIRED,
 * or ROTATION_REQUIRED. There is deliberately no path back from REVOKED to
 * ACTIVE; a replacement is a new connection.
 */
const ALLOWED_TRANSITIONS: Record<ConnectionStatus, readonly ConnectionStatus[]> = {
  DRAFT: ["CONNECTING", "FAILED", "DISCONNECTED"],
  CONNECTING: ["VERIFYING", "FAILED", "DISCONNECTING", "DISCONNECTED"],
  VERIFYING: ["ACTIVE", "ACTION_REQUIRED", "DEGRADED", "FAILED", "DISCONNECTING", "DISCONNECTED"],
  ACTION_REQUIRED: ["VERIFYING", "DEGRADED", "DISCONNECTING", "DISCONNECTED", "ROTATION_REQUIRED"],
  ACTIVE: ["DEGRADED", "ROTATION_REQUIRED", "DISCONNECTING", "DISCONNECTED", "FAILED"],
  DEGRADED: ["VERIFYING", "ACTIVE", "ROTATION_REQUIRED", "DISCONNECTING", "DISCONNECTED", "FAILED"],
  ROTATION_REQUIRED: ["VERIFYING", "ACTION_REQUIRED", "DEGRADED", "DISCONNECTING", "DISCONNECTED", "FAILED"],
  DISCONNECTING: ["DISCONNECTED", "FAILED", "ACTIVE"],
  DISCONNECTED: ["CONNECTING", "FAILED"],
  FAILED: ["DISCONNECTING", "DISCONNECTED", "CONNECTING"],
  REVOKED: [],
};

export class InvalidStatusTransitionError extends Error {
  constructor(
    readonly from: ConnectionStatus,
    readonly to: ConnectionStatus,
  ) {
    super(`Invalid provider connection transition: ${from} -> ${to}`);
    this.name = "InvalidStatusTransitionError";
  }
}

export function canTransitionConnectionStatus(
  from: ConnectionStatus,
  to: ConnectionStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Validate (and return the next status for) a transition. Throws
 * `InvalidStatusTransitionError` for a disallowed or unknown transition.
 * Provider-agnostic and side-effect free.
 */
export function transitionConnectionStatus(
  from: ConnectionStatus,
  to: ConnectionStatus,
): ConnectionStatus {
  if (!canTransitionConnectionStatus(from, to)) {
    throw new InvalidStatusTransitionError(from, to);
  }
  return to;
}

export function parseConnectionStatus(value: unknown): ConnectionStatus {
  return ConnectionStatusSchema.parse(value);
}

/** Terminal statuses after which a connection can no longer be used. */
export const TERMINAL_CONNECTION_STATUSES: readonly ConnectionStatus[] = ["REVOKED"];

export function isTerminalConnectionStatus(status: ConnectionStatus): boolean {
  return TERMINAL_CONNECTION_STATUSES.includes(status);
}

/** Connection statuses that preclude financial/read operation use. */
export const ACTIVE_CONNECTION_STATUSES: readonly ConnectionStatus[] = ["ACTIVE"];

export function canServiceConnection(status: ConnectionStatus): boolean {
  return ACTIVE_CONNECTION_STATUSES.includes(status);
}

/* ---------------------------------------------------------------------- */
/* Verification contract (shape only; the Xendit/Stripe verifier is injected) */
/* ---------------------------------------------------------------------- */

export interface WebhookHealthState {
  status: "VERIFIED" | "PENDING" | "UNHEALTHY" | "UNCONFIGURED";
  reason: string | null;
  lastCheckedAt: string | null;
}

export interface ConnectionVerification {
  verified: boolean;
  provider: string;
  mode: ProviderMode;
  accountIdentity: string | null; // provider-scoped account id, server-derived
  accountDisplayName: string | null;
  permissionsVerified: boolean;
  capabilities: unknown; // typed CapabilityManifest at the adapter boundary
  webhookHealth: WebhookHealthState | null;
  requirements: string[];
  state: ConnectionStatus;
  reason: string | null;
  verifiedAt: string;
}
