import "server-only";

import { Xendit } from "xendit-node";
import { env } from "@/lib/env";

// Reusable Xendit client — INTEGRATION.md #2, NEXTJS_CONCEPTS.md #31 route.ts, #138 Zod
// Server-only: secretKey never leaks to client. Swappable via env + 1 file (PHASE0_PLAN.md:12).
// Requires Node 18+ (xendit-node 7.0.0)

function getXenditClient() {
  const secretKey = env.XENDIT_SECRET_KEY;
  if (!secretKey) {
    // Return null in dev without key — routes should handle gracefully (mock/no-op)
    return null;
  }
  return new Xendit({ secretKey });
}

export const xenditClient = getXenditClient();

// Re-export typed sub-clients for screens — avoid rewrite, reuse SDK types directly
// Usage: `const balance = await xenditClient?.Balance.getBalance()` (Balance.getBalance())
//        `const txs = await xenditClient?.Transaction.getAllTransactions()` (Custom Reports)
export const Balance = xenditClient?.Balance;
export const Transaction = xenditClient?.Transaction;
export const Invoice = xenditClient?.Invoice;
export const Payout = xenditClient?.Payout;
export const Customer = xenditClient?.Customer;
export const PaymentRequest = xenditClient?.PaymentRequest;
export const Refund = xenditClient?.Refund;

// Helper: check if client is configured
export function isXenditConfigured(): boolean {
  return !!xenditClient;
}

/**
 * Server-only factory used by the xendit-adapter. This is the single SDK import
 * boundary; the secret is supplied by provider-secrets at the adapter boundary
 * and never read from `process.env` here.
 */
export function createXenditClient(secretKey: string): Xendit {
  return new Xendit({ secretKey });
}
