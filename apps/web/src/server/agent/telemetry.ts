import "server-only";

import { logger } from "@/lib/logger";

/**
 * Agent telemetry (spec §18). Structured, redacted, no secrets.
 * Never log: API keys, tokens, raw credentials, full financial payloads.
 * User identity is emitted as a short stable hash, not the raw id.
 */

const agentLog = logger.child({ module: "merchant-ops-agent" });

function safeId(value: string | null | undefined): string {
  if (!value) return "";
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export type AgentTelemetryEvent = {
  readonly requestId: string;
  readonly sessionId: string;
  readonly userIdHash: string;
  readonly organizationId: string;
};

export function logAgentRunStarted(event: AgentTelemetryEvent): void {
  agentLog.info({ ...event, userId: undefined }, "agent run started");
}

export function logAgentRunCompleted(
  event: AgentTelemetryEvent,
  result: { durationMs: number; toolCount: number; status: string },
): void {
  agentLog.info({ ...event, ...result, userId: undefined }, "agent run completed");
}

export function logAgentToolEvent(
  event: AgentTelemetryEvent,
  tool: { name: string; durationMs: number; status: string },
): void {
  agentLog.info({ ...event, ...tool, userId: undefined }, "agent tool event");
}

export function telemetryFor(context: { userId: string | null; organizationId: string; requestId: string; sessionId: string }): AgentTelemetryEvent {
  return {
    requestId: context.requestId,
    sessionId: context.sessionId,
    userIdHash: safeId(context.userId),
    organizationId: context.organizationId,
  };
}
