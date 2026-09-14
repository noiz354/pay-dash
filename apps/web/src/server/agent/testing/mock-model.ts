import {
  Model,
  ModelContentBlockDeltaEvent,
  ModelContentBlockStartEvent,
  ModelContentBlockStopEvent,
  ModelMessageStartEvent,
  ModelMessageStopEvent,
  type BaseModelConfig,
  type ModelStreamEvent,
  type StreamOptions,
} from "@strands-agents/sdk";
import type { Message } from "@strands-agents/sdk";

/**
 * Deterministic scripted model for offline tests/demo (no AWS credentials).
 *
 * Implements the Strands `Model` interface by replaying a fixed turn script:
 *   - { kind: "tool", tool, input }  → one tool_use turn
 *   - { kind: "text", text }         → one final assistant text turn
 * The agent loop therefore exercises the REAL tool-calling machinery
 * (tool selection, validation, execution, result injection) with a fake brain.
 */

export type MockTurn =
  | { kind: "tool"; tool: string; input: Record<string, unknown> }
  | { kind: "text"; text: string };

export class MockModel extends Model<BaseModelConfig> {
  private config: BaseModelConfig = { modelId: "mock-model" };
  private call = 0;

  constructor(private readonly turns: readonly MockTurn[]) {
    super();
  }

  updateConfig(modelConfig: BaseModelConfig): void {
    this.config = modelConfig;
  }

  getConfig(): BaseModelConfig {
    return this.config;
  }

  async *stream(_messages: Message[], _options?: StreamOptions): AsyncIterable<ModelStreamEvent> {
    const turn = this.turns[Math.min(this.call, this.turns.length - 1)] ?? { kind: "text", text: "" } as MockTurn;
    this.call += 1;

    yield new ModelMessageStartEvent({ type: "modelMessageStartEvent", role: "assistant" });

    if (turn.kind === "tool") {
      yield new ModelContentBlockStartEvent({
        type: "modelContentBlockStartEvent",
        start: { type: "toolUseStart", name: turn.tool, toolUseId: `mock-tool-${this.call}` },
      });
      yield new ModelContentBlockDeltaEvent({
        type: "modelContentBlockDeltaEvent",
        delta: { type: "toolUseInputDelta", input: JSON.stringify(turn.input) },
      });
      yield new ModelContentBlockStopEvent({ type: "modelContentBlockStopEvent" });
      yield new ModelMessageStopEvent({ type: "modelMessageStopEvent", stopReason: "toolUse" });
      return;
    }

    yield new ModelContentBlockStartEvent({ type: "modelContentBlockStartEvent" });
    yield new ModelContentBlockDeltaEvent({
      type: "modelContentBlockDeltaEvent",
      delta: { type: "textDelta", text: turn.text },
    });
    yield new ModelContentBlockStopEvent({ type: "modelContentBlockStopEvent" });
    yield new ModelMessageStopEvent({ type: "modelMessageStopEvent", stopReason: "endTurn" });
  }
}
