import "server-only";

/**
 * Idempotency System — BE-005
 * 
 * Prevents duplicate money movement operations
 * Same key + payload = single logical mutation
 * Same key + different payload = conflict (409)
 * 
 * Key generation: hash(orgId + type + entityId + payloadHash)
 */

import { createHash } from "crypto";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";

/**
 * Idempotency key types for different operations
 */
export type IdempotencyKeyType = 
  | "payout:create"
  | "payout:approve"
  | "payout:cancel"
  | "payout:retry"
  | "refund:request"
  | "refund:approve"
  | "payment:create"
  | "payment:retry"
  | "transfer:create"
  | "topup:create"
  | "withdrawal:create";

/**
 * Idempotency result stored in database
 */
export interface IdempotencyRecord {
  id: string;
  key: string;
  type: IdempotencyKeyType;
  orgId: string;
  payloadHash: string;
  result: Record<string, unknown>;
  createdAt: Date;
}

/**
 * In-memory store for idempotency (replace with database in production).
 * Wave 7G: partitioned by tenant. The key already embeds the org (ADR-0036),
 * but enforcement was missing — a caller holding another org's key received
 * that org's stored result payload. The partition IS the predicate now.
 */
type IdempotencyStore = { tenants: Map<string, Map<string, IdempotencyRecord>> };
const globalStore = globalThis as unknown as { __kineticIdempotencyStore?: IdempotencyStore };
function store(): IdempotencyStore {
  if (!globalStore.__kineticIdempotencyStore) globalStore.__kineticIdempotencyStore = { tenants: new Map() };
  return globalStore.__kineticIdempotencyStore;
}

/** A read for a tenant with no records answers empty; it never materialises one. */
const EMPTY_PARTITION: Map<string, IdempotencyRecord> = new Map();

/**
 * Validate the caller's context at the boundary. `parseOrganizationContext` is
 * the only constructor, so a malformed or missing ctx throws here rather than
 * becoming "the demo tenant" (contract C-1/C-2).
 */
function scopeOf(ctx: OrganizationContext): OrganizationContext {
  return parseOrganizationContext(ctx);
}

/** The caller's records. Never materialises a partition, so a read cannot invent a tenant. */
function readPartition(ctx: OrganizationContext): Map<string, IdempotencyRecord> {
  const { organizationId } = scopeOf(ctx);
  return store().tenants.get(organizationId) ?? EMPTY_PARTITION;
}

/** The caller's records, materialised for a write. */
function writePartition(organizationId: string): Map<string, IdempotencyRecord> {
  const tenants = store().tenants;
  let partition = tenants.get(organizationId);
  if (!partition) {
    partition = new Map();
    tenants.set(organizationId, partition);
  }
  return partition;
}

/**
 * How many tenants hold idempotency records. Row-free tenancy probe: answers a
 * question about the store, never returns a record — it is the quarantine gate
 * and the seam's demo-fallback refusal, so it cannot take a ctx (7C/7D/7F
 * precedent). Empty partitions do not count.
 */
export function countIdempotencyTenants(): number {
  let count = 0;
  for (const partition of store().tenants.values()) {
    if (partition.size > 0) count += 1;
  }
  return count;
}

/** The single tenant holding records, or `null` when there is none or more than one. */
export function soleIdempotencyOrganizationId(): string | null {
  let sole: string | null = null;
  for (const [organizationId, partition] of store().tenants) {
    if (partition.size === 0) continue;
    if (sole !== null) return null;
    sole = organizationId;
  }
  return sole;
}

/**
 * Generate a deterministic hash for payload
 */
function hashPayload(payload: unknown): string {
  const normalized = JSON.stringify(payload, Object.keys(payload as object).sort());
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Generate idempotency key
 * 
 * @param orgId - Organization ID
 * @param type - Operation type
 * @param entityId - Entity ID (batch, transaction, etc.)
 * @param payload - Operation payload
 * @returns Deterministic idempotency key
 */
export function generateIdempotencyKey(
  orgId: string,
  type: IdempotencyKeyType,
  entityId: string,
  payload: unknown
): string {
  const payloadHash = hashPayload(payload);
  const key = `${orgId}:${type}:${entityId}:${payloadHash}`;
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Generate simple idempotency key for operations without entity ID
 */
export function generateSimpleIdempotencyKey(
  orgId: string,
  type: IdempotencyKeyType,
  payload: unknown
): string {
  const payloadHash = hashPayload(payload);
  const key = `${orgId}:${type}:${payloadHash}`;
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Store idempotency result
 */
export async function storeIdempotencyResult(
  ctx: OrganizationContext,
  key: string,
  type: IdempotencyKeyType,
  payloadHash: string,
  result: Record<string, unknown>
): Promise<IdempotencyRecord> {
  // The stored org comes from the context, never from a trusted parameter: the
  // partition is decided by the caller's tenancy, so a record whose key was
  // generated for another org still lands in (and is only visible to) this one.
  const { organizationId } = scopeOf(ctx);
  const record: IdempotencyRecord = {
    id: `idempotency:${key}`,
    key,
    type,
    orgId: organizationId,
    payloadHash,
    result,
    createdAt: new Date(),
  };
  
  writePartition(organizationId).set(key, record);
  return { ...record };
}

/**
 * Check if operation was already performed
 * 
 * @param key - Idempotency key
 * @returns Existing result or null if not found
 */
export async function checkIdempotency(ctx: OrganizationContext, key: string): Promise<IdempotencyRecord | null> {
  // The tenant is derived from the context, never from the key or a trusted
  // parameter: the same key in a different tenant is a miss, never a hit.
  const { organizationId } = scopeOf(ctx);
  const record = store().tenants.get(organizationId)?.get(key);
  return record ? { ...record } : null;
}

/**
 * Execute operation with idempotency
 * 
 * @param options - Operation options
 * @returns Result of operation (existing or new)
 */
export interface ExecuteWithIdempotencyOptions<T, P> {
  type: IdempotencyKeyType;
  entityId?: string;
  payload: P;
  operation: (payload: P) => Promise<T>;
}

export async function executeWithIdempotency<T, P>(
  ctx: OrganizationContext,
  options: ExecuteWithIdempotencyOptions<T, P>
): Promise<T> {
  // The org is resolved from the context once, at the boundary: the key
  // generator, the lookup and the write all agree on the same tenant, so a
  // replay inside the tenant returns the stored result and the same operation
  // in two tenants runs twice — B does not inherit A's result.
  const { organizationId } = scopeOf(ctx);
  const { type, entityId, payload, operation } = options;
  
  // Generate key. When an entityId is present the key is prefix-compatible
  // (`org:type:entity:payloadHash`) so `checkForConflict` can scan by logical
  // operation; the sha256 generator remains available for callers that want an
  // opaque digest, but the stored key must be discoverable by its own prefix.
  const payloadHashForKey = hashPayload(payload);
  const key = entityId
    ? `${generateKeyPrefix(organizationId, type, entityId)}${payloadHashForKey}`
    : generateSimpleIdempotencyKey(organizationId, type, payload);
  
  // Check for existing result
  const existing = await checkIdempotency(ctx, key);
  if (existing) {
    return existing.result as T;
  }
  
  // Execute operation
  const result = await operation(payload);
  
  // Store result
  const payloadHash = hashPayload(payload);
  await storeIdempotencyResult(ctx, key, type, payloadHash, result as Record<string, unknown>);
  
  return result;
}

/**
 * Check for conflicting payload (same key, different payload)
 * 
 * @param key - Idempotency key (without payload hash)
 * @param payloadHash - Hash of new payload
 * @returns True if conflict detected
 */
export async function checkConflict(ctx: OrganizationContext, keyPrefix: string, payloadHash: string): Promise<boolean> {
  // The tenant is derived from the context; the prefix scan is confined to the
  // caller's partition — another tenant's in-flight money operations are not an
  // existence oracle.
  const { organizationId } = scopeOf(ctx);
  const partition = store().tenants.get(organizationId);
  if (!partition) return false;
  for (const [key, record] of partition) {
    if (key.startsWith(keyPrefix) && record.payloadHash !== payloadHash) {
      return true; // Conflict: same prefix, different payload
    }
  }
  return false;
}

/**
 * Generate key prefix for conflict checking
 */
export function generateKeyPrefix(
  orgId: string,
  type: IdempotencyKeyType,
  entityId: string
): string {
  return `${orgId}:${type}:${entityId}:`;
}

/**
 * Conflict result for 409 responses
 */
export interface ConflictResult {
  isConflict: boolean;
  existingRecord?: IdempotencyRecord;
  message: string;
}

/**
 * Check for conflict and return appropriate response
 */
export async function checkForConflict(
  ctx: OrganizationContext,
  type: IdempotencyKeyType,
  entityId: string,
  payload: unknown
): Promise<ConflictResult> {
  // The org comes from the context: `checkForConflict` used to take `orgId` as a
  // trusted parameter and return the full record — result included — for *any*
  // org passed in. That was the leak. Now the prefix is built from the caller's
  // own tenancy and the scan never leaves their partition.
  const { organizationId } = scopeOf(ctx);
  const payloadHash = hashPayload(payload);
  const keyPrefix = generateKeyPrefix(organizationId, type, entityId);
  
  const hasConflict = await checkConflict(ctx, keyPrefix, payloadHash);
  
  if (hasConflict) {
    // Find the existing record for this prefix — inside the caller's partition only.
    for (const [, record] of readPartition(ctx)) {
      if (record.key.startsWith(keyPrefix)) {
        return {
          isConflict: true,
          existingRecord: { ...record },
          message: `Conflict detected: ${type} for ${entityId} with different payload`,
        };
      }
    }
  }
  
  return {
    isConflict: false,
    message: "No conflict",
  };
}
