import "server-only";

/**
 * Merchant Operations Agent — contracts (WAVE 1).
 *
 * The agent is read-only by default. Every mutation must go through the
 * approval flow (WAVE 5-6), never directly from a model decision.
 */

export type ToolRisk = "READ_ONLY" | "LOW_RISK_WRITE" | "HIGH_RISK_WRITE";

/**
 * Trusted context injected into every tool invocation.
 *
 * NON-NEGOTIABLE: this object is built ONLY from the authenticated session
 * (see `context.ts`). The model NEVER supplies the organization id and never
 * sees this object's construction inputs.
 */
export interface AgentContext {
  readonly organizationId: string;
  readonly userId: string | null;
  readonly roles: readonly string[];
  readonly requestId: string;
  readonly sessionId: string;
  readonly locale: string;
  readonly isDemoFallback: boolean;
}

/**
 * Normalized tool result contract (spec §17).
 * Tools must not dump raw store rows into the model; they summarize, filter
 * sensitive fields, limit sizes, and attach evidence ids.
 */
export interface ToolResultContract {
  readonly status: "ok" | "error";
  readonly summary: string;
  readonly data?: Record<string, unknown>;
  readonly evidenceIds?: string[];
  readonly error?: string;
}

/** One observable tool activity entry (spec §18-19; no chain-of-thought). */
export interface ToolActivity {
  readonly tool: string;
  readonly status: "ok" | "error";
  readonly summary?: string;
}

/** Structured agent run response (spec §25). */
export interface AgentRunContract {
  readonly runId: string;
  readonly status: "completed" | "failed" | "timed_out";
  readonly mode: "read_only";
  readonly summary: string;
  readonly toolActivity: readonly ToolActivity[];
  readonly evidenceIds: readonly string[];
  readonly error?: string;
}

export function okResult(summary: string, data?: Record<string, unknown>, evidenceIds?: string[]): ToolResultContract {
  return { status: "ok", summary, ...(data ? { data } : {}), ...(evidenceIds?.length ? { evidenceIds } : {}) };
}

export function errorResult(summary: string, error?: string): ToolResultContract {
  return { status: "error", summary, ...(error ? { error } : {}) };
}
