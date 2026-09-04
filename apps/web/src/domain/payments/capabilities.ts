import { z } from "zod";

/**
 * Canonical capability keys a connection may support. A provider either
 * structurally supports a capability or it does not; there is no silent
 * fallback to a mock or to a different provider product.
 */
export const CapabilityKeySchema = z.enum([
  "balanceRead",
  "transactionRead",
  "hostedPaymentLinks",
  "customers",
  "savedPaymentMethods",
  "recurringBilling",
  "refunds",
  "payouts",
  "connectedAccounts",
  "internalTransfers",
  "splitRouting",
  "webhookHealth",
]);

export type CapabilityKey = z.infer<typeof CapabilityKeySchema>;
export const CAPABILITY_KEYS: readonly CapabilityKey[] = CapabilityKeySchema.options;

const CapabilityStateSchema = z
  .object({
    supported: z.boolean(),
    configured: z.boolean(),
    available: z.boolean(),
    mode: z.enum(["TEST", "LIVE"]),
    reason: z.string().nullable(),
    requirements: z.array(z.string()).default([]),
    lastVerifiedAt: z.string().datetime().nullable(),
  })
  .strict();

export type CapabilityState = z.infer<typeof CapabilityStateSchema>;

/**
 * Strict manifest: only the canonical capability keys, each with a validated
 * state. `.strict()` rejects unknown keys, so a raw provider payload or a
 * secret-shaped value cannot smuggle through as a manifest field.
 */
export const CapabilityManifestSchema = z
  .object(Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, CapabilityStateSchema])) as Record<
    CapabilityKey,
    typeof CapabilityStateSchema
  >)
  .strict();

export type CapabilityManifest = z.infer<typeof CapabilityManifestSchema>;

export function parseCapabilityManifest(value: unknown): CapabilityManifest {
  return CapabilityManifestSchema.parse(value);
}

/**
 * A capability is usable only when the provider structurally supports it, it
 * is configured for this connection, and nothing blocks it. Credential
 * presence alone must not yield `available: true`.
 */
export function isCapabilityAvailable(state: CapabilityState): boolean {
  return state.supported && state.configured && state.available !== false;
}

/** Whether a state claims a provider supports the capability at all. */
export function capabilityIsSupported(state: CapabilityState): boolean {
  return state.supported;
}

/**
 * Build the `available` field from `supported`/`configured`/requirements so
 * callers never have to re-derive it inconsistently. The upstream reason is
 * preserved when the capability is genuinely unavailable.
 */
export function deriveCapabilityState(
  input: Omit<CapabilityState, "available">,
): CapabilityState {
  const available = input.supported && input.configured && input.requirements.length === 0;
  return {
    ...input,
    requirements: input.requirements ?? [],
    available,
  };
}
