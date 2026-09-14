import "server-only";

import { Agent, type Model } from "@strands-agents/sdk";
import type { BaseModelConfig } from "@strands-agents/sdk";

import { createAgentModel, readPositiveInt } from "./model";
import { MERCHANT_OPS_POLICY } from "./policies";
import { logAgentRunCompleted, logAgentRunStarted, telemetryFor } from "./telemetry";
import { buildReadOnlyTools } from "./tools";
import type { AgentContext, AgentRunContract, ToolActivity } from "./types";

/**
 * Merchant Operations Agent — Strands orchestration layer (spec §15).
 *
 * Replaces the manual Gemini function-calling loop with the Strands agent
 * loop, guarded by:
 *   - limits.turns        → hard cap on model/tool iterations (no loops)
 *   - cancelSignal        → wall-clock timeout per run
 *   - read-only tool set  → no financial mutation possible from the model
 *   - policy system prompt→ financial integrity + tenant + data≠instruction
 */

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TURNS = 6;

export type RunMerchantOpsAgentInput = {
  readonly context: AgentContext;
  readonly message: string;
  readonly model?: Model<BaseModelConfig>;
};

/** Extracts the final assistant text from the agent's last message. */
function lastMessageText(agent: Agent): string {
  const blocks = agent.messages.at(-1)?.content ?? [];
  const parts: string[] = [];
  for (const block of blocks) {
    if ("text" in block && typeof block.text === "string") parts.push(block.text);
  }
  return parts.join("\n").trim();
}

/** Collects observable tool activity (names + statuses only — no reasoning). */
function collectToolActivity(agent: Agent): ToolActivity[] {
  const activity: { tool: string; status: "ok" | "error"; summary?: string }[] = [];
  for (const message of agent.messages) {
    for (const block of message.content as unknown[]) {
      const record = block as Record<string, unknown>;
      // Live SDK classes expose fields directly; serialized forms wrap them.
      const toolUse =
        (record.toolUse as { name?: unknown } | undefined) ??
        (typeof record.name === "string" ? record : undefined);
      const toolResult =
        (record.toolResult as { status?: unknown; content?: unknown } | undefined) ??
        (typeof record.status === "string" ? record : undefined);
      if (toolUse && typeof (toolUse as { name?: unknown }).name === "string") {
        activity.push({ tool: (toolUse as { name: string }).name, status: "ok" });
      } else if (toolResult) {
        const last = activity[activity.length - 1];
        if (last) {
          last.status = toolResult.status === "success" ? "ok" : "error";
          const summary = summarizeToolResult(toolResult.content);
          if (summary) last.summary = summary;
        }
      }
    }
  }
  return activity;
}

function summarizeToolResult(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const first = content[0] as { text?: string; json?: unknown } | undefined;
  if (!first) return undefined;
  const candidate = typeof first.text === "string" ? first.text : JSON.stringify(first.json);
  if (!candidate) return undefined;
  try {
    const parsed = JSON.parse(candidate) as { summary?: string };
    return typeof parsed.summary === "string" ? parsed.summary.slice(0, 400) : candidate.slice(0, 400);
  } catch {
    return candidate.slice(0, 400);
  }
}

export async function runMerchantOpsAgent(input: RunMerchantOpsAgentInput): Promise<AgentRunContract> {
  const { context, message } = input;
  const telemetry = telemetryFor(context);
  const startedAt = Date.now();

  const agent = new Agent({
    name: "paydash-merchant-ops",
    model: input.model ?? createAgentModel(),
    tools: buildReadOnlyTools(context),
    systemPrompt: MERCHANT_OPS_POLICY,
    printer: false,
  });

  const timeoutMs = readPositiveInt("AGENT_RUNTIME_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const maxTurns = readPositiveInt("AGENT_MAX_TOOL_TURNS", DEFAULT_MAX_TURNS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  logAgentRunStarted(telemetry);

  try {
    await agent.invoke(message, {
      cancelSignal: controller.signal,
      limits: { turns: maxTurns },
    });

    const toolActivity = collectToolActivity(agent);
    const evidenceIds = toolActivity.map((entry) => entry.tool);
    const summary = lastMessageText(agent) || "(the model returned no final text)";

    logAgentRunCompleted(telemetry, {
      durationMs: Date.now() - startedAt,
      toolCount: toolActivity.length,
      status: "completed",
    });

    return {
      runId: context.requestId,
      status: "completed",
      mode: "read_only",
      summary,
      toolActivity,
      evidenceIds,
    };
  } catch (error) {
    const aborted = controller.signal.aborted;
    const messageText = error instanceof Error ? error.message : String(error);
    logAgentRunCompleted(telemetry, {
      durationMs: Date.now() - startedAt,
      toolCount: collectToolActivity(agent).length,
      status: aborted ? "timed_out" : "failed",
    });
    return {
      runId: context.requestId,
      status: aborted ? "timed_out" : "failed",
      mode: "read_only",
      summary: aborted
        ? "The agent run exceeded its time limit before completing. No action was taken."
        : "The agent run failed. No action was taken.",
      toolActivity: collectToolActivity(agent),
      evidenceIds: [],
      error: aborted ? "AGENT_TIMED_OUT" : messageText.slice(0, 300),
    };
  } finally {
    clearTimeout(timer);
  }
}
