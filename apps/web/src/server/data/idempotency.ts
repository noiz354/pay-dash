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
 * In-memory store for idempotency (replace with database in production)
 * This is a mock implementation for the current architecture
 */
const idempotencyStore = new Map<string, IdempotencyRecord>();

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
  key: string,
  type: IdempotencyKeyType,
  orgId: string,
  payloadHash: string,
  result: Record<string, unknown>
): Promise<IdempotencyRecord> {
  const record: IdempotencyRecord = {
    id: `idempotency:${key}`,
    key,
    type,
    orgId,
    payloadHash,
    result,
    createdAt: new Date(),
  };
  
  idempotencyStore.set(key, record);
  return record;
}

/**
 * Check if operation was already performed
 * 
 * @param key - Idempotency key
 * @returns Existing result or null if not found
 */
export async function checkIdempotency(key: string): Promise<IdempotencyRecord | null> {
  return idempotencyStore.get(key) ?? null;
}

/**
 * Execute operation with idempotency
 * 
 * @param options - Operation options
 * @returns Result of operation (existing or new)
 */
export interface ExecuteWithIdempotencyOptions<T, P> {
  orgId: string;
  type: IdempotencyKeyType;
  entityId?: string;
  payload: P;
  operation: (payload: P) => Promise<T>;
}

export async function executeWithIdempotency<T, P>(
  options: ExecuteWithIdempotencyOptions<T, P>
): Promise<T> {
  const { orgId, type, entityId, payload, operation } = options;
  
  // Generate key
  const key = entityId
    ? generateIdempotencyKey(orgId, type, entityId, payload)
    : generateSimpleIdempotencyKey(orgId, type, payload);
  
  // Check for existing result
  const existing = await checkIdempotency(key);
  if (existing) {
    return existing.result as T;
  }
  
  // Execute operation
  const result = await operation(payload);
  
  // Store result
  const payloadHash = hashPayload(payload);
  await storeIdempotencyResult(key, type, orgId, payloadHash, result as Record<string, unknown>);
  
  return result;
}

/**
 * Check for conflicting payload (same key, different payload)
 * 
 * @param key - Idempotency key (without payload hash)
 * @param payloadHash - Hash of new payload
 * @returns True if conflict detected
 */
export async function checkConflict(keyPrefix: string, payloadHash: string): Promise<boolean> {
  // Find all keys with this prefix
  for (const [key, record] of idempotencyStore) {
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
  orgId: string,
  type: IdempotencyKeyType,
  entityId: string,
  payload: unknown
): Promise<ConflictResult> {
  const payloadHash = hashPayload(payload);
  const keyPrefix = generateKeyPrefix(orgId, type, entityId);
  
  const existing = await checkConflict(keyPrefix, payloadHash);
  
  if (existing) {
    // Find the existing record for this prefix
    for (const [, record] of idempotencyStore) {
      if (record.key.startsWith(keyPrefix)) {
        return {
          isConflict: true,
          existingRecord: record,
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
